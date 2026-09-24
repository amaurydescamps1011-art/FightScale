/* Un club achete un pack de seances d'essai depuis acquisition.html.

   Le visiteur n'a pas de compte : `verify_jwt = false` dans config.toml (dans
   le tableau de bord : « Enforce JWT verification » eteint). Ce n'est pas un
   trou, parce que cette fonction ne donne rien :
     - le prix est calcule ici, a partir du pack et de la duree. Ce que la page
       affiche n'est qu'une vitrine ; un montant envoye par la page serait
       ignore, il n'y en a d'ailleurs aucun dans ce qu'on lit ;
     - elle ecrit une commande `en_attente` et rend l'adresse d'une page de
       paiement Stripe. C'est tout. La commande ne passe `payee` que par le
       webhook (paiement-stripe), quand Stripe dit que l'argent est passe.

   Un seul fichier, sans import : il se deploie en le collant tel quel dans
   l'editeur du tableau de bord Supabase. Les petites fonctions du haut sont
   donc recopiees dans chacune des trois fonctions de paiement -- qui en
   corrige une corrige les trois.

   Ce qu'elle attend (POST, JSON) :
     { pack: 'grow', duree: 3, club, ville, nom, mail, tel }
   Ce qu'elle rend :
     200 { url }       -> la page de paiement Stripe, ou envoyer le visiteur
     400 { erreur }    -> un champ manque ou ne va pas ; la phrase est a montrer
     500 { erreur }    -> Stripe ou la base n'ont pas repondu */

/* ------------------------------------------------------------ le commun */

/* Aucune dependance : ni SDK Stripe, ni supabase-js. Le reste du projet est un
   site sans build ni paquet, et une fonction qui tire une bibliotheque depuis
   un CDN a chaque deploiement casse le jour ou la version epinglee disparait.
   L'API Stripe est du POST en formulaire et du JSON en retour, PostgREST est du
   HTTP : il n'y a rien a abstraire. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(corps: unknown, code = 200): Response {
  return new Response(JSON.stringify(corps),
    { status: code, headers: { ...CORS, 'Content-Type': 'application/json' } });
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

/* ------------------------------------------------------------ les tarifs */

/* La seule table de prix qui compte. Celle d'acquisition.html doit dire la
   meme chose, mais c'est celle-ci qui encaisse. En euros HT par mois. */
const PACKS: Record<string, { nom: string; seances: number; prix: number }> = {
  start:  { nom: 'Start',  seances: 20,  prix: 300 },
  grow:   { nom: 'Grow',   seances: 40,  prix: 600 },
  boost:  { nom: 'Boost',  seances: 60,  prix: 900 },
  scale:  { nom: 'Scale',  seances: 100, prix: 1500 },
  pro:    { nom: 'Pro',    seances: 150, prix: 2250 },
  custom: { nom: 'Custom', seances: 200, prix: 3000 },
};

/* La duree d'engagement en mois, et la remise qu'elle donne, en pourcent. */
const DUREES: Record<number, { remise: number; libelle: string }> = {
  0: { remise: 0,  libelle: 'Sans engagement' },
  3: { remise: 15, libelle: 'Engagement 3 mois (-15 %)' },
  6: { remise: 20, libelle: 'Engagement 6 mois (-20 %)' },
};

/* Les memes bornes que la table `commande_pack` : mieux vaut une phrase claire
   ici qu'un refus de la base que le visiteur ne comprendrait pas. */
function texte(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

/* ------------------------------------------------------------ l'appel */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'POST attendu' }, 405);

  const d = await req.json().catch(() => null);
  if (!d || typeof d !== 'object') return json({ erreur: 'Demande illisible.' }, 400);

  const pack = String(d.pack ?? '').toLowerCase();
  if (!Object.hasOwn(PACKS, pack)) return json({ erreur: 'Choisissez un pack.' }, 400);

  /* `hasOwn` et pas `DUREES[duree]` seul : Number('') vaut 0, et un champ
     vide ne doit pas passer pour « sans engagement ». */
  const duree = d.duree === '' || d.duree === null || d.duree === undefined ? NaN : Number(d.duree);
  if (!Object.hasOwn(DUREES, duree)) return json({ erreur: 'Choisissez une durée d\'engagement.' }, 400);

  const club = texte(d.club, 200);
  if (!club) return json({ erreur: 'Indiquez le nom de votre club.' }, 400);
  const ville = texte(d.ville, 120);
  if (!ville) return json({ erreur: 'Indiquez la ville du club.' }, 400);
  const nom = texte(d.nom, 160);
  if (!nom) return json({ erreur: 'Indiquez votre nom.' }, 400);
  const mail = texte(d.mail, 254);
  if (!mail || !/^[^\s@]+@[^\s@]+$/.test(mail)) {
    return json({ erreur: 'Indiquez une adresse e-mail valide.' }, 400);
  }
  /* le telephone est facultatif, mais borne comme le reste */
  const tel = d.tel === undefined || d.tel === null ? '' : String(d.tel).trim();
  if (tel.length > 40) return json({ erreur: 'Ce numéro de téléphone est trop long.' }, 400);

  const p = PACKS[pack];
  const { remise, libelle } = DUREES[duree];
  const montant = Math.round(p.prix * 100 * (100 - remise) / 100);

  try {
    /* La commande existe avant la page de paiement : si le visiteur abandonne
       chez Stripe, l'equipe sait quand meme qui a failli acheter quoi. */
    const id = crypto.randomUUID();
    await base('commande_pack', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        id, pack, duree, montant_centimes: montant,
        club, ville, nom, mail, tel: tel || null,
      }),
    });

    const site = (Deno.env.get('SITE_URL') || 'https://monclubcombat.fr').replace(/\/+$/, '');
    const page = site + '/acquisition.html';

    /* `type: 'pack'` et `commande_id` sont le fil que suit le webhook : il les
       retrouve sur la session et sur l'abonnement. Pas de `club_id` : un pack
       n'a rien a voir avec l'offre Pro d'une fiche. */
    const meta = { type: 'pack', commande_id: id, pack, duree: String(duree) };

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer_email: mail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: montant,
          recurring: { interval: 'month' },
          /* les prix affiches sont hors taxes */
          tax_behavior: 'exclusive',
          product_data: {
            name: 'Pack ' + p.nom + ' : ' + p.seances + ' séances d\'essai par mois',
            description: libelle,
          },
        },
      }],
      /* l'adresse de facturation, pour que la facture d'un club soit juste */
      billing_address_collection: 'required',
      /* le numero de TVA du club, s'il en a un, sur sa facture */
      tax_id_collection: { enabled: true },
      success_url: page + '?paiement=ok#contact',
      cancel_url: page + '?paiement=annule#offres',
      locale: 'fr',
      subscription_data: { metadata: meta },
      metadata: meta,
    });

    await base('commande_pack?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ stripe_session: session.id }),
    });

    return json({ url: session.url });
  } catch (e) {
    /* le detail va aux journaux de la fonction, pas au visiteur */
    console.error(e);
    return json({
      erreur: 'Le paiement n\'a pas pu s\'ouvrir. Réessayez dans un instant, '
        + 'ou écrivez-nous à contact@monclubcombat.fr.',
    }, 500);
  }
});
