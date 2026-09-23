/* Ce que Stripe nous raconte.

   C'est le seul endroit qui donne ou retire le Pro. Ni la page, ni le gerant,
   ni la fonction `paiement` ne touchent a `club.offre` : seul l'argent le fait.

   Trois precautions, parce que ce point d'entree est ouvert sur l'internet et
   qu'il ecrit avec la cle `service_role` :
     1. `verify_jwt = false` dans config.toml -- Stripe n'a pas de jeton
        Supabase -- donc la signature Stripe est la seule preuve d'identite, et
        elle est verifiee avant de lire quoi que ce soit du corps.
     2. Le corps est lu en texte brut : la signature porte sur les octets
        envoyes, pas sur un JSON re-serialise.
     3. L'horodatage est controle : sans lui, un evenement intercepte un jour
        pourrait etre rejoue indefiniment.

   Rien de ce que Stripe raconte n'est cru sur parole pour l'identite du club :
   le `club_id` vient des metadonnees que nous avons nous-memes posees en
   creant la session. */

import { json, env, stripe, base } from '../_partage.ts';

const TOLERANCE = 300; // secondes

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparaison a temps constant : comparer deux signatures avec === laisse
 *  fuir, par le temps de reponse, le nombre de caracteres devines. */
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* La verification decrite par Stripe : l'en-tete porte `t=<horodatage>` et une
   ou plusieurs `v1=<hmac>`, et le HMAC-SHA256 est calcule sur `<t>.<corps>`. */
async function signatureValide(corps: string, entete: string, secret: string): Promise<boolean> {
  const parts: Record<string, string[]> = {};
  entete.split(',').forEach((p) => {
    const [k, v] = p.split('=');
    if (k && v) (parts[k.trim()] ||= []).push(v.trim());
  });
  const t = parts.t?.[0];
  const recues = parts.v1 || [];
  if (!t || !recues.length) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE) return false;

  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const attendue = hex(await crypto.subtle.sign(
    'HMAC', cle, new TextEncoder().encode(t + '.' + corps)));

  return recues.some((v) => memeSecret(v, attendue));
}

/* --------------------------------------------------------------- l'ecriture */

/** Recopie l'etat d'un abonnement Stripe dans la base, et aligne `club.offre`.
 *  Un abonnement en essai ou actif donne le Pro ; tout le reste le retire. */
async function applique(abonnement: any): Promise<string> {
  const clubId = abonnement?.metadata?.club_id;
  if (!clubId) return 'sans club_id, ignore';

  const actif = abonnement.status === 'active' || abonnement.status === 'trialing';
  const fin = abonnement.current_period_end
    ? new Date(abonnement.current_period_end * 1000).toISOString() : null;

  await base('abonnement?on_conflict=club_id', {
    method: 'POST',
    body: JSON.stringify({
      club_id: clubId,
      stripe_client: abonnement.customer,
      stripe_abonnement: abonnement.id,
      statut: abonnement.status,
      fin_periode: fin,
      arret_demande: !!abonnement.cancel_at_period_end,
    }),
  });

  /* `service_role` contourne le RLS et le trigger `club_offre_figee` (qui ne
     bloque que les appels portant un auth.uid()) : c'est voulu, c'est le seul
     chemin par lequel l'offre change. */
  await base('club?id=eq.' + clubId, {
    method: 'PATCH',
    body: JSON.stringify({ offre: actif ? 'pro' : 'gratuit' }),
  });

  return clubId + ' -> ' + (actif ? 'pro' : 'gratuit');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'POST attendu' }, 405);

  const corps = await req.text();
  const entete = req.headers.get('stripe-signature') || '';
  if (!await signatureValide(corps, entete, env('STRIPE_WEBHOOK'))) {
    /* on ne dit pas ce qui cloche : une signature invalide n'a pas a etre aidee */
    return json({ erreur: 'signature refusee' }, 400);
  }

  try {
    const e = JSON.parse(corps);
    let quoi = 'ignore : ' + e.type;

    switch (e.type) {
      /* Le paiement vient d'aboutir. L'objet `session` ne porte pas l'etat de
         l'abonnement, donc on va le chercher : c'est lui qui fait foi. */
      case 'checkout.session.completed': {
        const id = e.data.object.subscription;
        if (id) quoi = await applique(await stripe('subscriptions/' + id));
        break;
      }
      /* Creation, changement de carte, resiliation, echec de paiement : Stripe
         renvoie l'abonnement entier a chaque fois, il n'y a rien a deduire. */
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        quoi = await applique(e.data.object);
        break;
      /* Un prelevement echoue : Stripe repasse l'abonnement en `past_due` et
         nous renverra un `subscription.updated`. On ne coupe rien ici. */
    }

    /* Toujours 200 des que la signature est bonne : un code d'erreur ferait
       rejouer l'evenement par Stripe pendant trois jours. */
    return json({ recu: true, quoi });
  } catch (err) {
    console.error(err);
    return json({ recu: true, erreur: String((err as Error).message || err) });
  }
});
