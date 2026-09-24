/* Ce que le gerant declenche depuis son espace club.

   Deux actions, et rien de plus :
     « passer »  -> ouvrir la page de paiement Stripe pour s'abonner au Pro
     « gerer »   -> rouvrir le portail Stripe pour changer sa carte ou resilier

   Aucune des deux ne donne le Pro. C'est le webhook (paiement-stripe) qui
   ecrit `club.offre`, quand Stripe dit que l'argent est passe. Un gerant qui
   rejouerait cet appel n'obtient qu'une page de paiement de plus.

   Cette fonction est appelee avec le jeton du gerant : `verify_jwt` reste a
   true dans config.toml (dans le tableau de bord : « Enforce JWT
   verification » laisse allume).

   Un seul fichier, sans import : il se deploie en le collant tel quel dans
   l'editeur du tableau de bord Supabase. Les petites fonctions du haut sont
   donc recopiees dans chacune des trois fonctions de paiement -- qui en
   corrige une corrige les trois. */

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

/* ------------------------------------------------------------- le club */

/** L'identifiant du club que ce compte gere, ou null. */
async function clubDuGerant(uid: string): Promise<string | null> {
  const l = await base('club_membre?select=club_id&membre_id=eq.' + encodeURIComponent(uid) + '&limit=1');
  return l?.[0]?.club_id ?? null;
}

/** Le compte du gerant connecte, verifie par Supabase Auth lui-meme.
 *  On ne se fie plus a l'interrupteur « Verify JWT » de la plateforme :
 *  Supabase le deconseille (il ne connait que l'ancien secret JWT, pas les
 *  nouvelles cles de signature). La fonction demande donc a /auth/v1/user
 *  qui porte ce jeton : un jeton faux, expire ou la simple cle publiable
 *  d'un visiteur sont refuses la-bas, et on renvoie 401. */
async function gerantDuJeton(req: Request): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const jwt = h.replace(/^Bearer\s+/i, '');
  if (jwt.split('.').length !== 3) return null;
  /* la cle publiable que le site envoie deja (en-tete `apikey`), a defaut
     celle que Supabase injecte dans la fonction */
  const cle = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY')
    || env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(env('SUPABASE_URL') + '/auth/v1/user', {
    headers: { 'apikey': cle, 'Authorization': 'Bearer ' + jwt },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id || null;
}

/* ------------------------------------------------------------ l'appel */

/* Le Pro coute 39 € par mois. Le prix est ecrit ici, et pas lu de la page :
   personne ne choisit son tarif depuis la console. Si un prix a ete cree dans
   Stripe (`price_…`) et pose dans le secret STRIPE_PRIX, c'est lui qui sert ;
   sinon Stripe fabrique le prix a la volee a partir de ces lignes. */
const PRO = {
  currency: 'eur',
  unit_amount: 3900,
  recurring: { interval: 'month' },
  product_data: { name: 'Mon Club Combat Pro' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const uid = await gerantDuJeton(req);
    if (!uid) return json({ erreur: 'connexion requise' }, 401);

    const { action } = await req.json().catch(() => ({ action: '' }));
    const clubId = await clubDuGerant(uid);
    if (!clubId) return json({ erreur: 'aucun club rattache a ce compte' }, 403);

    const site = (Deno.env.get('SITE_URL') || 'https://monclubcombat.fr').replace(/\/+$/, '');
    const retour = site + '/espace-club.html';

    /* L'abonnement deja connu, s'il existe : c'est lui qui porte le client
       Stripe, pour ne pas en creer un deuxieme au deuxieme achat. */
    const abo = (await base('abonnement?select=*&club_id=eq.' + clubId))?.[0] || null;

    if (action === 'gerer') {
      if (!abo?.stripe_client) return json({ erreur: 'aucun abonnement a gerer' }, 404);
      /* Le portail doit avoir ete active une fois dans Stripe (Facturation >
         Portail client), sinon Stripe refuse ici -- voir LISEZ-MOI.md. */
      const portail = await stripe('billing_portal/sessions', {
        customer: abo.stripe_client,
        return_url: retour,
      });
      return json({ url: portail.url });
    }

    if (action !== 'passer') return json({ erreur: 'action inconnue' }, 400);

    const club = (await base(
      'club?select=id,nom,mail,offre&id=eq.' + clubId))?.[0];
    if (!club) return json({ erreur: 'club introuvable' }, 404);
    if (club.offre === 'pro') return json({ erreur: 'ce club est deja Pro' }, 409);

    /* Un client Stripe par club, reutilise ensuite. `metadata.club_id` est le
       fil qui relie le paiement a la fiche : le webhook n'a que ca pour savoir
       qui crediter, donc il est pose sur le client, sur la session et sur
       l'abonnement. `type: 'pro'` le distingue des packs de l'agence, qui
       passent par le meme webhook et ne touchent jamais a `club.offre`. */
    let client = abo?.stripe_client;
    if (!client) {
      const c = await stripe('customers', {
        name: club.nom,
        email: club.mail || undefined,
        metadata: { club_id: clubId },
      });
      client = c.id;
      await base('abonnement?on_conflict=club_id', {
        method: 'POST',
        body: JSON.stringify({ club_id: clubId, stripe_client: client }),
      });
    }

    const prix = Deno.env.get('STRIPE_PRIX');
    const meta = { club_id: clubId, type: 'pro' };

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer: client,
      line_items: [prix ? { price: prix, quantity: 1 } : { price_data: PRO, quantity: 1 }],
      /* Stripe renvoie le gerant sur son espace : il y verra le Pro actif des
         que le webhook sera passe, ce qui prend une seconde ou deux. */
      success_url: retour + '?abonnement=ok',
      cancel_url: retour + '?abonnement=annule',
      locale: 'fr',
      allow_promotion_codes: true,
      /* Une facture de club doit porter son adresse et, s'il en a un, son
         numero de TVA. Avec un client deja cree, Stripe exige qu'on l'autorise
         a mettre a jour le nom et l'adresse du client depuis la caisse. */
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      customer_update: { name: 'auto', address: 'auto' },
      subscription_data: { metadata: meta },
      metadata: meta,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ erreur: String((e as Error).message || e) }, 500);
  }
});
