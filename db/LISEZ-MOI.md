# La base de Mon Club Combat

Ce dossier porte le schéma de la base. Il n'y a pas de serveur à écrire : le site
parle directement à **Supabase** (Postgres hébergé + comptes + stockage de fichiers),
et ce sont les politiques d'accès du schéma qui font la sécurité.

## Ce qu'il y a dedans

| Fichier | À quoi ça sert |
|---|---|
| `001_schema.sql` | Le schéma complet. À coller dans Supabase → SQL Editor → Run. Rejouable autant de fois qu'on veut. |
| `rls_test.sh` | Rejoue les règles d'accès sur un Postgres local et vérifie qu'un gérant ne peut pas lire ni modifier le club d'un autre. |

## Les tables

- **`club`** — la fiche. Elle a un `statut` : `brouillon`, `en_attente`, `publie`,
  `refuse`, `suspendu`. **Rien n'est visible publiquement avant `publie`** : c'est
  une validation manuelle qui fait paraître une fiche, jamais l'inscription.
- **`club_membre`** — quel compte gère quel club. Une table de liaison plutôt qu'une
  colonne, pour qu'un club puisse avoir deux gérants plus tard sans rien changer.
- **`equipe`** — être dans cette table, c'est être administrateur. On n'y entre qu'à
  la main depuis Supabase ; aucune règle ne permet de s'y ajouter soi-même.
- **`demande`** — les demandes de séance d'essai, et le suivi que le club en fait.
  Le statut suit la règle métier : `recue` n'est pas un lead, seule une `confirmee`
  en est un. Le parcours complet est `recue → contactee → confirmee → honoree →
  adherent`, plus `absente` et `annulee` comme fins. S'y ajoutent `notes` (libre),
  `relance` (la date du prochain rappel) et `origine`. Tout cela n'est lisible que
  par le club concerné et par l'équipe.
  **`creneau` est du texte, pas une date** : il porte le libellé lisible du cours
  choisi (« Mardi 18h30 – 20h00 · MMA »), ou, pour un club sans planning, ce que le
  pratiquant a écrit. La colonne était un `timestamptz`, et tout dépôt aurait échoué
  sur la vraie base — le faux serveur des tests, lui, l'acceptait.
  **`cours_id` est ce que la base vérifie** : l'identifiant du cours dans le planning
  du club (voir `club.cours`).
- **`abonnement`** — l'état Stripe d'un club : identifiants, statut, fin de période
  payée. Une table à part, et pas des colonnes sur `club`, parce que `club` est lu
  publiquement : un identifiant Stripe n'a rien à faire dans une page. Seul le
  webhook y écrit, avec la clé `service_role` ; un gérant lit la sienne et rien d'autre.

Les comptes eux-mêmes vivent dans `auth.users`, qui appartient à Supabase.

## La vue `annuaire`, et pourquoi elle existe

Amaury, 23/09/2026 : **sur une fiche gratuite, il n'y a aucun moyen de contacter
la salle.** Les coordonnées sont le paywall, c'est ce qui fait passer un club au Pro.

Les cacher dans la page ne suffirait pas : le site lit la base directement avec une
clé publique, donc n'importe qui ouvre la console et refait la requête. Il faut que
la base elle-même ne les rende pas. Une politique RLS ne sait pas protéger une seule
colonne, et un `revoke select (tel)` serait absolu alors que la règle dépend de la
ligne. D'où une vue :

- `annuaire` ne rend que les clubs `publie`, et remplace par `null` le téléphone,
  l'e-mail, le site, Instagram et Facebook d'un club qui n'est pas `offre = 'pro'` ;
- la table `club` **n'a plus de politique de lecture publique** : un gérant voit son
  club, l'équipe voit tout, personne d'autre ne voit rien ;
- le site (`sb.js`, `_salle.js`) lit `annuaire`, jamais `club`.

Deux conséquences à garder en tête :
- la vue n'est pas en `security_invoker`, donc elle contourne le RLS de `club` : c'est
  son `where statut = 'publie'` qui tient la limite de l'annuaire ;
- une politique qui a besoin de lire `club` ne peut plus passer par un `exists`, qui
  ne verrait plus rien. C'est pourquoi le dépôt d'une demande passe par la fonction
  `club_ouvert_aux_essais()`, en `security definer`.

## Ce qui donne le Pro

Une seule chose : `club.offre`. Deux verrous autour d'elle.
- Le trigger `club_offre_figee` remet l'ancienne valeur si un gérant essaie de se
  l'accorder en modifiant sa fiche. Seuls l'équipe et la clé `service_role` passent.
- La politique `demande_depot` exige `offre = 'pro'` : une demande de séance d'essai
  forgée à la main sur un club gratuit est refusée par la base.

## Une séance d'essai tombe sur un cours

Règle d'Amaury du 23/09/2026. Le club saisit son planning sur sa fiche, dans
`club.cours` : une liste d'objets `{ id, jour, de, a, quoi, niveau }`, où `jour` va
de 0 (lundi) à 6 et où `id` est tiré au sort par le formulaire, une fois pour
toutes. C'est cet `id` qu'une demande désigne, et pas un numéro de ligne : le club
peut réordonner son planning ou décaler une heure sans que les demandes déjà reçues
changent de cours.

`club_a_ce_cours()`, en `security definer`, tient la règle côté base, et
`demande_depot` l'appelle :
- club sans planning → le texte libre passe encore, sinon une salle qui n'a rien
  saisi ne pourrait plus rien recevoir ;
- club avec un planning → seul un `cours_id` qui existe chez **lui** passe ; le
  texte libre seul est refusé.

Le tenir dans le formulaire ne tiendrait rien : la page parle à la base avec une
clé publique.

Aujourd'hui, le Pro s'ouvre à la main depuis le back-office. Demain, c'est le webhook
Stripe qui l'écrira — voir `../supabase/LISEZ-MOI.md`.

## Un piège de `returning`

Un visiteur dépose une demande sans avoir aucune politique de **lecture** sur
`demande` — ses coordonnées ne regardent que le club. Conséquence :
`insert … returning <une colonne>` échoue avec « new row violates row-level
security policy », alors que le même insert sans `returning` passe. Postgres
applique la politique de SELECT dès que le `returning` touche une colonne de la
table. `sb.js` n'en fait pas, et `rls_test.sh` vérifie les deux cas.

## La sécurité, en une phrase

La clé « anon » du site est **publique par construction** : elle part dans le code de
la page, n'importe qui peut la lire, et ce n'est pas un problème. Ce qui protège les
données, ce sont les politiques RLS de `001_schema.sql`. La clé `service_role`, elle,
ne doit jamais être mise dans le dépôt ni dans une page.

## Ce qui reste à faire une fois le projet Supabase créé

1. Coller `001_schema.sql` dans le SQL Editor.
2. Créer un bucket public `photos-clubs` dans Storage.
3. Créer son compte sur le site, puis s'ajouter dans `equipe` à la main :
   `insert into equipe (membre_id) values ('<son id dans auth.users>');`
