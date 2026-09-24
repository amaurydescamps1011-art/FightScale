/* Ce que Stripe nous raconte.

   C'est le seul endroit qui donne ou retire le Pro. Ni la page, ni le gerant,
   ni la fonction `paiement` ne touchent a `club.offre` : seul l'argent le fait.

   Il suit aussi les packs de seances d'essai achetes sur acquisition.html
   (fonction `achat-pack`) : ceux-la portent `type: 'pack'` dans leurs
   metadonnees, ne mettent a jour que `commande_pack`, et ne touchent jamais a
   `club.offre`.

   Trois precautions, parce que ce point d'entree est ouvert sur l'internet et
   qu'il ecrit avec la cle `service_role` :
     1. `verify_jwt = false` dans config.toml (dans le tableau de bord :
        « Enforce JWT verification » eteint) -- Stripe n'a pas de jeton
        Supabase -- donc la signature Stripe est la seule preuve d'identite, et
        elle est verifiee avant de lire quoi que ce soit du corps.
     2. Le corps est lu en texte brut : la signature porte sur les octets
        envoyes, pas sur un JSON re-serialise.
     3. L'horodatage est controle : sans lui, un evenement intercepte un jour
        pourrait etre rejoue indefiniment.

   Rien de ce que Stripe raconte n'est cru sur parole pour l'identite du club :
   le `club_id` vient des metadonnees que nous avons nous-memes posees en
   creant la session. */

/* ------------------------------------------------------------ le commun */

/* Un seul fichier, sans import : il se deploie en le collant tel quel dans
   l'editeur du tableau de bord Supabase. Ces petites fonctions sont donc
   recopiees dans chacune des trois fonctions de paiement -- qui en corrige une
   corrige les trois.

   Aucune dependance : ni SDK Stripe, ni supabase-js. Le reste du projet est un
   site sans build ni paquet, et une fonction qui tire une bibliotheque depuis
   un CDN a chaque deploiement casse le jour ou la version epinglee disparait.
   L'API Stripe est du POST en formulaire et du JSON en retour, PostgREST est du
   HTTP : il n'y a rien a abstraire. */

function json(corps: unknown, code = 200): Response {
  return new Response(JSON.stringify(corps),
    { status: code, headers: { 'Content-Type': 'application/json' } });
}

/** Une variable d'environnement obligatoire, ou une erreur qui la nomme. */
function env(nom: string): string {
  const v = Deno.env.get(nom);
  if (!v) throw new Error('variable d\'environnement absente : ' + nom);
  return v;
}

/* L'API Stripe prend des formulaires, avec les objets imbriques entre crochets :
   `line_items[0][price]=price_123`. On aplatit donc l'objet plutot que d'ecrire
   ces cles a la main, ou la moindre faute de frappe passe inapercue. */
function aplatit(o: unknown, prefixe = '', sortie = new URLSearchParams()): URLSearchParams {
  if (o === null || o === undefined) return sortie;
  if (Array.isArray(o)) {
    o.forEach((v, i) => aplatit(v, prefixe + '[' + i + ']', sortie));
  } else if (typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      aplatit(v, prefixe ? prefixe + '[' + k + ']' : k, sortie);
    }
  } else {
    sortie.append(prefixe, String(o));
  }
  return sortie;
}

async function stripe(chemin: string, corps?: unknown): Promise<any> {
  const r = await fetch('https://api.stripe.com/v1/' + chemin, {
    method: corps ? 'POST' : 'GET',
    headers: {
      'Authorization': 'Bearer ' + env('STRIPE_CLE'),
      'Content-Type': 'application/x-www-form-urlencoded',
      /* Epinglee : sans ca, Stripe sert la version du compte, qui change le
         jour ou quelqu'un clique « mettre a jour » dans le tableau de bord. */
      'Stripe-Version': '2024-06-20',
    },
    body: corps ? aplatit(corps).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Stripe ' + r.status + ' : ' + (d?.error?.message || chemin));
  return d;
}

/* Ecrire avec la cle service_role, c'est passer a cote du RLS. Elle ne vit que
   dans les secrets de la fonction (Supabase la fournit d'office) et ne doit
   jamais partir vers une page. */
async function base(chemin: string, init: RequestInit = {}): Promise<any> {
  const cle = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + chemin, {
    ...init,
    headers: {
      'apikey': cle,
      'Authorization': 'Bearer ' + cle,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
      ...(init.headers || {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error('base ' + r.status + ' : ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

/* ---------------------------------------------------------- la signature */

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

/* ------------------------------------------------------------ le Pro */

/** Recopie l'etat d'un abonnement Stripe dans la base, et aligne `club.offre`.
 *  Un abonnement en essai, actif ou en cours de relance donne le Pro ; tout
 *  le reste le retire. L'abonnement est relu chez Stripe plutot que pris dans
 *  l'evenement : un `created` en retard ne doit pas defaire un Pro paye. */
async function applique(abonnement: any): Promise<string> {
  const clubId = abonnement?.metadata?.club_id;
  if (!clubId) return 'sans club_id, ignore';

  /* `past_due` garde le Pro : Stripe retente le prelevement pendant quelques
     jours (Smart Retries), et couper la fiche d'un club au premier refus de
     carte serait brutal. Au bout des tentatives, l'abonnement passe `unpaid`
     ou `canceled`, et la le Pro tombe. */
  const actif = ['active', 'trialing', 'past_due'].includes(abonnement.status);
  /* La fin de periode a quitte l'abonnement pour ses lignes dans les versions
     recentes de l'API. Les evenements arrivent dans la version choisie en
     creant le webhook, pas dans celle epinglee plus haut : on lit les deux. */
  const finS = abonnement.current_period_end
    ?? abonnement.items?.data?.[0]?.current_period_end;
  const fin = finS ? new Date(finS * 1000).toISOString() : null;

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
  await base('club?id=eq.' + encodeURIComponent(clubId), {
    method: 'PATCH',
    body: JSON.stringify({ offre: actif ? 'pro' : 'gratuit' }),
  });

  return clubId + ' -> ' + (actif ? 'pro' : 'gratuit');
}

/* ------------------------------------------------------------ les packs */

/* Le mot de Stripe, traduit dans celui de `commande_pack`. Ce qui n'est pas
   ici (incomplete, incomplete_expired, paused) ne change pas la commande : un
   premier paiement en cours n'est ni paye ni perdu. */
const STATUT_PACK: Record<string, string> = {
  active: 'payee',
  trialing: 'payee',
  past_due: 'impayee',
  unpaid: 'impayee',
  canceled: 'resiliee',
};

/** Recopie l'etat d'un abonnement de pack sur sa commande. Ne touche a rien
 *  d'autre : un pack ne donne pas le Pro. `payee_le` est pose par la base, au
 *  premier passage a `payee` (trigger `commande_pack_payee_le`), pour qu'un
 *  evenement rejoue ne deplace pas la date du premier paiement. */
async function appliquePack(abonnement: any, session?: any): Promise<string> {
  const id = abonnement?.metadata?.commande_id || session?.metadata?.commande_id;
  if (!id) return 'pack sans commande_id, ignore';

  const champs: Record<string, unknown> = {
    stripe_client: abonnement?.customer ?? session?.customer ?? undefined,
    stripe_abonnement: abonnement?.id ?? session?.subscription ?? undefined,
  };
  if (session?.id) champs.stripe_session = session.id;

  /* la session terminee et payee suffit ; sinon c'est l'abonnement qui dit */
  const payee = session && ['paid', 'no_payment_required'].includes(session.payment_status);
  const statut = payee ? 'payee' : STATUT_PACK[abonnement?.status];
  if (statut) champs.statut = statut;

  await base('commande_pack?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(champs),
  });

  return 'commande ' + id + ' -> ' + (statut || 'inchangee');
}

const estPack = (o: any) => o?.metadata?.type === 'pack';

/* ----------------------------------------------------------- l'entree */

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
    const objet = e.data?.object;
    let quoi = 'ignore : ' + e.type;

    switch (e.type) {
      /* Le paiement vient d'aboutir. L'objet `session` ne porte pas l'etat de
         l'abonnement, donc on va le chercher : c'est lui qui fait foi. */
      case 'checkout.session.completed': {
        const id = objet.subscription;
        const abonnement = id ? await stripe('subscriptions/' + id) : null;
        if (estPack(objet)) quoi = await appliquePack(abonnement, objet);
        else if (abonnement && !estPack(abonnement)) quoi = await applique(abonnement);
        break;
      }
      /* Creation, changement de carte, resiliation, echec de paiement : Stripe
         renvoie l'abonnement entier a chaque fois, il n'y a rien a deduire. */
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        /* Pour un pack, on relit l'abonnement chez Stripe : les evenements
           n'arrivent pas toujours dans l'ordre, et un `created` encore
           `incomplete` recu en retard ne doit pas defaire une commande payee.
           Le Pro garde son chemin d'origine : `type: 'pro'`, ou pas de type
           du tout pour un abonnement cree avant que le type existe. */
        if (estPack(objet)) quoi = await appliquePack(await stripe('subscriptions/' + objet.id));
        else quoi = await applique(await stripe('subscriptions/' + objet.id));
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
