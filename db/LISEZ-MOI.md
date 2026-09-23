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
- **`demande`** — les demandes de séance d'essai. Le statut suit la règle métier :
  `recue` n'est pas un lead, seule une `confirmee` en est un.

Les comptes eux-mêmes vivent dans `auth.users`, qui appartient à Supabase.

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
