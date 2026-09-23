# Le paiement de Mon Club Combat Pro

**Rien ici n'est deploye ni branche au 23/09/2026.** Il n'y a pas encore de
compte Stripe, et il n'y en aura pas avant la societe : Stripe demande une
entite et un IBAN. Ce dossier est pret a partir le jour ou ce compte existe,
et le site marche sans lui — c'est le back-office (`admin.html`) qui ouvre le
Pro a la main en attendant.

## Ce que ces deux fonctions font

`paiement` — appelee par le gerant depuis son espace club.
- `{"action":"passer"}` ouvre une page de paiement Stripe pour l'abonnement.
- `{"action":"gerer"}` rouvre le portail Stripe, ou il change sa carte et resilie.
- Elle ne donne **jamais** le Pro : elle ne fait qu'emmener le gerant chez Stripe.

`paiement-stripe` — le webhook. C'est **le seul endroit** qui ecrit
`club.offre`. Le Pro suit l'abonnement Stripe et rien d'autre : ni la page, ni
le gerant, ni l'autre fonction ne peuvent le donner. Il ecoute
`checkout.session.completed` et les trois `customer.subscription.*`.

Aucune dependance : ni SDK Stripe, ni `supabase-js`. Le site n'a ni build ni
paquet, et une fonction qui tire une bibliotheque d'un CDN casse le jour ou la
version epinglee disparait. L'API Stripe est du formulaire, PostgREST est du
HTTP, la signature est un HMAC-SHA256 de la bibliotheque standard.

## Le jour ou le compte Stripe existe

1. Dans Stripe, creer le produit **Mon Club Combat Pro**, prix recurrent
   **39 € par mois**, et noter l'identifiant du prix (`price_…`).
2. Dans Stripe, Developers > Webhooks, ajouter
   `https://<projet>.supabase.co/functions/v1/paiement-stripe`, avec les
   evenements `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Noter le
   secret de signature (`whsec_…`).
3. Poser les secrets cote Supabase (Edge Functions > Secrets) :
   `STRIPE_CLE` (la cle secrete `sk_…`), `STRIPE_PRIX` (le `price_…`),
   `STRIPE_WEBHOOK` (le `whsec_…`), `SITE_URL` (`https://fight-scale.vercel.app`).
   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par Supabase.
4. Deployer : `supabase functions deploy paiement paiement-stripe`.

**La cle secrete Stripe et la cle `service_role` ne doivent jamais entrer dans
le depot ni dans une page.** Elles ne vivent que dans les secrets de Supabase.
La cle publiable Supabase, elle, est publique par construction : elle est dans
`sb.js`, et c'est le RLS qui protege les donnees.

## Ce qu'il reste a faire ensuite

Le bouton « Passer au Pro » de l'espace club n'appelle pas encore ces
fonctions : il ouvre la fenetre de compte. Le brancher est une ligne, le jour
ou les secrets sont poses.
