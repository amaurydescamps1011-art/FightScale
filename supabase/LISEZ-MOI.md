# Le paiement en ligne — le brancher pas à pas

Trois fonctions encaissent l'argent du site. Le code est prêt ; ce qui reste se
fait à la main, depuis tes comptes Stripe et Supabase, et **tout se fait depuis
un navigateur, téléphone compris** : aucun terminal, aucune installation.

On commence en **mode test** de Stripe : pas besoin de société, aucun vrai
argent ne bouge, et tout le parcours se vérifie avec une fausse carte. Le passage
en mode réel (étape 9) viendra quand la société existera.

## Ce que font les trois fonctions

| Fonction | Qui l'appelle | Ce qu'elle fait |
|---|---|---|
| `paiement` | un gérant connecté, depuis son espace club | ouvre la page Stripe pour s'abonner au **Pro (39 € / mois)**, ou le portail Stripe où il change sa carte et résilie |
| `achat-pack` | un visiteur, depuis `acquisition.html`, sans compte | enregistre la commande d'un **pack de séances d'essai** et ouvre la page Stripe pour le payer |
| `paiement-stripe` | Stripe lui-même (le « webhook ») | quand Stripe dit que l'argent est passé : donne ou retire le Pro, ou marque le pack payé |

Aucune des deux premières ne donne quoi que ce soit : elles emmènent chez
Stripe, c'est tout. **Seul le webhook**, quand Stripe confirme le paiement,
ouvre le Pro d'un club ou passe une commande de pack à « payée ». Les prix sont
écrits dans les fonctions elles-mêmes : personne ne peut choisir son tarif depuis
la page.

Quand un pack est payé, un e-mail part vers **contact@monclubcombat.fr** (sujet
« Pack Grow payé : nom du club »), et répondre à cet e-mail écrit directement au
club. Il faut pour ça que la clé Resend soit dans le coffre Supabase, comme pour
les autres e-mails du site.

---

## Les deux règles à ne jamais oublier

- **La clé secrète Stripe (`sk_test_…`, plus tard `sk_live_…`) ne se colle
  qu'à un seul endroit : les secrets Supabase (étape 7).** Jamais dans une
  conversation, un e-mail, un message, ni dans le code du site. Si elle a fui,
  Stripe permet de la « faire tourner » (bouton *Roll key*) : l'ancienne meurt.
- Pareil pour le secret du webhook (`whsec_…`).

---

## 1. Créer le compte Stripe et rester en mode test

1. Va sur https://dashboard.stripe.com/register et crée un compte (e-mail, mot
   de passe). **Stripe va te proposer d'« activer ton compte »** en demandant
   une société, un SIRET, un IBAN : **ignore-le pour l'instant.** Ce n'est
   nécessaire que pour encaisser de vrais paiements.
2. En haut du tableau de bord, vérifie que l'interrupteur **« Mode test »**
   (*Test mode*) est **allumé** (bandeau orange « Données de test »). Tout ce
   qui suit se fait dans ce mode.

## 2. Récupérer la clé secrète de test

1. Ouvre https://dashboard.stripe.com/test/apikeys
   (ou : *Développeurs* → *Clés API*).
2. Dans la ligne **Clé secrète** (*Secret key*), clique sur **Révéler la clé de
   test** : elle commence par **`sk_test_`**.
3. Garde cet onglet ouvert : tu la colleras directement dans Supabase à
   l'étape 7. Ne la recopie nulle part ailleurs.

(La « clé publiable » `pk_test_…` ne sert pas : le site n'en a pas besoin.)

## 3. Activer le portail client (une seule fois)

> **Mode test : déjà fait le 24/09/2026** (portail « Mon Club Combat Pro » :
> carte, factures, adresse, n° de TVA, résiliation en fin de période). À
> refaire seulement en mode réel.

C'est la page Stripe où un club Pro change sa carte ou résilie. Tant qu'elle
n'est pas activée, le bouton « Gérer mon abonnement » renvoie une erreur.

1. Ouvre https://dashboard.stripe.com/test/settings/billing/portal
   (ou : *Paramètres* → *Facturation* → *Portail client*).
2. Clique sur **Activer le lien de test** / **Enregistrer** (*Save*). Coche au
   passage « Les clients peuvent annuler leur abonnement » et « mettre à jour
   leur moyen de paiement » si ce n'est pas déjà fait.

## 4. Remettre le schéma de la base à jour

Le paiement des packs ajoute une table, `commande_pack`. Recolle le schéma en
entier, comme d'habitude (il est rejouable, rien ne s'efface) :

1. Ouvre https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/sql/new
2. Colle tout le fichier
   https://raw.githubusercontent.com/amaurydescamps1011-art/FightScale/main/db/001_schema.sql
3. **Run**. Il doit répondre « Success. No rows returned ».

## 5. Déployer les trois fonctions (copier-coller)

Chaque fonction tient dans **un seul fichier `index.ts`**, à coller tel quel.
Pour chacune des trois, dans cet ordre :

| Nom exact de la fonction | Fichier à copier | « Verify JWT » (ou « Enforce JWT verification ») |
|---|---|---|
| `paiement` | https://raw.githubusercontent.com/amaurydescamps1011-art/FightScale/main/supabase/functions/paiement/index.ts | **éteindre** |
| `achat-pack` | https://raw.githubusercontent.com/amaurydescamps1011-art/FightScale/main/supabase/functions/achat-pack/index.ts | **éteindre** |
| `paiement-stripe` | https://raw.githubusercontent.com/amaurydescamps1011-art/FightScale/main/supabase/functions/paiement-stripe/index.ts | **éteindre** |

Les gestes, pour une fonction :

1. Ouvre https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/functions
2. **Deploy a new function** → **Via Editor**.
3. L'éditeur s'ouvre avec un exemple dans `index.ts` : **efface tout**, puis
   colle le contenu du fichier (lien du tableau ci-dessus → tout sélectionner →
   copier).
4. En bas, dans le champ du nom, écris le **nom exact** (`paiement`,
   `achat-pack` ou `paiement-stripe` — tout en minuscules, avec le tiret). C'est
   ce nom qui fait l'adresse ; un autre nom et le site ne la trouve pas.
5. **Deploy function**. Attends le message de succès.
6. Pour **les trois** : ouvre la fonction → onglet **Details** (ou
   *Settings*) → **Verify JWT with legacy secret** (ancien nom : *Enforce JWT
   Verification*) → **éteins** → **Save**. C'est ce que Supabase recommande :
   chaque fonction fait sa propre vérification.
   - `paiement-stripe` : c'est Stripe qui appelle, il n'a pas de compte
     Supabase. La fonction vérifie elle-même la signature de Stripe.
   - `achat-pack` : c'est un visiteur sans compte. La fonction ne fait
     qu'ouvrir une page de paiement, au prix qu'elle calcule elle-même.
   - `paiement` : elle vérifie elle-même, auprès de Supabase, que l'appel vient
     d'un gérant connecté, et refuse tout le reste.

**Pour mettre à jour une fonction plus tard** : ouvre-la → onglet **Code** →
remplace tout par la nouvelle version → **Deploy updates**. Vérifie ensuite que
l'interrupteur JWT n'a pas bougé.

## 6. Créer le webhook dans Stripe

> **Mode test : déjà créé le 24/09/2026**, avec les 4 événements et la
> version d'API du code. Il te reste seulement le point 7 ci-dessous :
> ouvre https://dashboard.stripe.com/test/webhooks, clique sur la
> destination « Mon Club Combat : Pro et packs », puis **Révéler** le
> secret de signature.

C'est l'adresse que Stripe appelle pour dire « c'est payé ».

1. Ouvre https://dashboard.stripe.com/test/webhooks
   (ou : *Développeurs* → *Webhooks*). Toujours en **mode test**.
2. **Ajouter une destination** (*Add destination*, ou *Add endpoint* sur
   l'ancienne interface).
3. « Événements de » : **Ton compte** (*Your account*). Laisse la version
   d'API proposée. Si Stripe demande un style de contenu, choisis
   **Snapshot** (pas *Thin*).
4. Sélectionne exactement ces **4 événements** (la recherche aide) :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Type de destination : **Point de terminaison webhook** (*Webhook endpoint*).
6. URL du point de terminaison :

   ```
   https://qhbutuhdmyajlgorbhxf.supabase.co/functions/v1/paiement-stripe
   ```

7. **Créer la destination**. Sur la page qui s'ouvre, dans **Secret de
   signature** (*Signing secret*), clique sur **Révéler** : il commence par
   **`whsec_`**. Garde l'onglet ouvert pour l'étape suivante.

## 7. Poser les secrets dans Supabase

1. Ouvre https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/functions/secrets
   (ou : *Edge Functions* → *Secrets*).
2. Ajoute ces trois secrets (**Name** à gauche, **Value** à droite), puis
   **Save** :

| Name | Value |
|---|---|
| `STRIPE_CLE` | la clé `sk_test_…` de l'étape 2 |
| `STRIPE_WEBHOOK` | le secret `whsec_…` de l'étape 6 |
| `SITE_URL` | `https://monclubcombat.fr` |

Les noms s'écrivent exactement ainsi, en majuscules. `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` existent déjà : Supabase les fournit tout seul, n'y
touche pas. Un secret modifié compte tout de suite, sans redéployer.

`STRIPE_PRIX` est **facultatif** : sans lui, le Pro est facturé 39 € / mois par
un prix que la fonction décrit elle-même. Si un jour tu crées dans Stripe un
produit « Mon Club Combat Pro » avec son prix mensuel, tu peux poser son
identifiant (`price_…`) sous ce nom pour que Stripe range tous les abonnements
sous ce produit.

## 8. Tester de bout en bout (mode test)

**Un pack :**

1. Sur https://monclubcombat.fr/acquisition.html, choisis un pack et une durée,
   remplis le formulaire, valide : tu arrives sur une page Stripe.
2. Carte **`4242 4242 4242 4242`**, n'importe quelle date future (`12/34`),
   n'importe quel code (`123`), n'importe quel nom et code postal.
3. Tu reviens sur la page acquisition. Dans les secondes qui suivent :
   - dans Supabase, *Table Editor* → `commande_pack`, la ligne passe à
     **`payee`** avec une date dans `payee_le` ;
   - un e-mail « Pack … payé » arrive sur contact@monclubcombat.fr.

**Le Pro :** depuis l'espace club d'un compte gérant, « Passer au Pro », même
carte. Le club passe Pro. **Attention** : même en mode test, c'est la vraie
base qui est modifiée. Teste sur un club à toi, puis résilie l'abonnement de
test dans Stripe (*Clients* → le client → l'abonnement → *Annuler*) : le club
repasse gratuit tout seul.

**Si rien ne se passe :** dans Stripe, *Développeurs* → *Webhooks* → ta
destination → onglet des événements : chaque envoi doit être en **200**. Un
**400 « signature refusée »** veut dire que `STRIPE_WEBHOOK` ne correspond pas
(recopie le `whsec_`). Un **401** veut dire que « Enforce JWT verification » est
resté allumé sur `paiement-stripe`. Les messages d'erreur détaillés sont dans
Supabase : la fonction → onglet **Logs**.

Une carte refusée pour tester l'échec : `4000 0000 0000 0002`.

## 9. Passer en mode réel (quand la société existe)

1. Dans Stripe, **Activer le compte** : société, SIRET, représentant, IBAN.
2. Publie avant ça les **conditions de vente** sur le site (prix, durée,
   résiliation) : la page `conditions.html` promet qu'aucun paiement n'est
   demandé sans elles.
3. **Éteins le mode test**, puis refais, en mode réel :
   - l'étape 2 → la clé devient **`sk_live_…`** ;
   - l'étape 3 → le portail client s'active séparément en réel ;
   - l'étape 6 → un **nouveau** webhook, même URL, mêmes 4 événements, qui
     donne un **nouveau `whsec_…`**.
4. Dans les secrets Supabase (étape 7), **remplace** `STRIPE_CLE` et
   `STRIPE_WEBHOOK` par les valeurs réelles. Rien à redéployer.
5. Fais un vrai achat de pack avec ta propre carte, vérifie la ligne `payee`,
   puis rembourse-le depuis Stripe.
6. Les commandes de test restent dans la table ; pour les effacer (SQL Editor) :
   `delete from commande_pack where stripe_session like 'cs_test_%';`

Les **factures** : Stripe en émet une à chaque prélèvement, Pro comme packs.
Avant le mode réel, dans Stripe :
- Paramètres › Facturation › **Modèle de facture** : ta raison sociale, ton
  adresse, ton SIREN, et soit ton numéro de TVA, soit la mention
  « TVA non applicable, art. 293 B du CGI » si tu es en franchise.
- Paramètres › Facturation › **E-mails aux clients** : coche l'envoi des
  factures et des reçus de paiement, et l'e-mail en cas d'échec de paiement.
- Paramètres › Facturation › **Gestion des échecs de paiement** : garde les
  nouvelles tentatives automatiques (Smart Retries). Pendant ces tentatives le
  club garde le Pro ; si elles échouent toutes, l'abonnement est résilié et le
  site retire le Pro tout seul. Choisis « résilier l'abonnement » comme issue.
La caisse demande l'adresse de facturation et, en option, le numéro de TVA du
club : ils apparaissent sur ses factures.

Deux points à voir avec le comptable avant le mode réel :
- **La TVA.** Les packs sont affichés et facturés **hors taxes** : Stripe
  prélève le montant HT tel quel et n'ajoute pas de TVA, sauf si on active
  Stripe Tax. Le Pro est facturé 39 € tout rond.
- **L'engagement.** Les remises à 3 et 6 mois sont appliquées par Stripe, mais
  Stripe n'empêche pas une résiliation avant la fin : l'engagement tient par
  les conditions de vente. Un club qui a pris un pack n'a d'ailleurs pas de
  portail pour résilier seul : il passe par nous.

---

## Pour qui reprendra le code

- Pas de dépendance : ni SDK Stripe, ni `supabase-js`. L'API Stripe est du
  formulaire, PostgREST du HTTP, la signature un HMAC-SHA256 de la bibliothèque
  standard. Une fonction qui tire une bibliothèque d'un CDN casse le jour où la
  version épinglée disparaît.
- Chaque `index.ts` est autonome (pas d'import relatif) pour se coller dans
  l'éditeur du tableau de bord. Les petites fonctions communes (`stripe`,
  `base`, `json`…) sont donc recopiées dans les trois fichiers : qui en corrige
  une corrige les trois. Avec la CLI, `supabase functions deploy paiement
  achat-pack paiement-stripe` marche aussi ; `config.toml` porte les réglages JWT.
- Le webhook distingue les deux produits par `metadata.type` : `pro` (ou pas de
  type mais un `club_id`) écrit `abonnement` et `club.offre` ; `pack` n'écrit
  que `commande_pack`, et ne touche jamais au Pro.
- La clé `service_role` et les clés Stripe ne vivent que dans les secrets
  Supabase. La clé publiable du site, elle, est publique par construction :
  c'est le RLS qui protège les données.
