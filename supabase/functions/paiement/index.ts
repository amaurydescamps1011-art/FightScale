/* Ce que le gerant declenche depuis son espace club.

   Deux actions, et rien de plus :
     « passer »  -> ouvrir la page de paiement Stripe pour s'abonner au Pro
     « gerer »   -> rouvrir le portail Stripe pour changer sa carte ou resilier

   Aucune des deux ne donne le Pro. C'est le webhook (paiement-stripe) qui
   ecrit `club.offre`, quand Stripe dit que l'argent est passe. Un gerant qui
   rejouerait cet appel n'obtient qu'une page de paiement de plus.

   Cette fonction est appelee avec le jeton du gerant : `verify_jwt` reste a
   true dans config.toml. */

import { CORS, json, env, stripe, base, clubDuGerant, gerantDuJeton } from '../_partage.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const uid = gerantDuJeton(req);
    if (!uid) return json({ erreur: 'connexion requise' }, 401);

    const { action } = await req.json().catch(() => ({ action: '' }));
    const clubId = await clubDuGerant(uid);
    if (!clubId) return json({ erreur: 'aucun club rattache a ce compte' }, 403);

    const site = env('SITE_URL').replace(/\/+$/, '');
    const retour = site + '/espace-club.html';

    /* L'abonnement deja connu, s'il existe : c'est lui qui porte le client
       Stripe, pour ne pas en creer un deuxieme au deuxieme achat. */
    const abo = (await base('abonnement?select=*&club_id=eq.' + clubId))?.[0] || null;

    if (action === 'gerer') {
      if (!abo?.stripe_client) return json({ erreur: 'aucun abonnement a gerer' }, 404);
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
       l'abonnement. */
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

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer: client,
      line_items: [{ price: env('STRIPE_PRIX'), quantity: 1 }],
      /* Stripe renvoie le gerant sur son espace : il y verra le Pro actif des
         que le webhook sera passe, ce qui prend une seconde ou deux. */
      success_url: retour + '?abonnement=ok',
      cancel_url: retour + '?abonnement=annule',
      locale: 'fr',
      allow_promotion_codes: true,
      subscription_data: { metadata: { club_id: clubId } },
      metadata: { club_id: clubId },
    });

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ erreur: String((e as Error).message || e) }, 500);
  }
});
