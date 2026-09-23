# Mon Club Combat

L'annuaire des salles de sports de combat en France, et les outils qui vont
avec pour les clubs qui veulent remplir leurs séances d'essai.

En ligne : https://fight-scale.vercel.app (déploiement automatique à chaque
push sur `main`, site en `noindex` tant que l'annuaire n'est pas ouvert).

## Ce qu'il y a dans ce dépôt

- **la racine** — le site tel que Vercel le sert : des pages HTML complètes,
  sans build et sans dépendance, plus `carte.js`, `geo.js` (la géographie de la
  carte de recherche, 1,6 Mo) et `sb.js` (la configuration Supabase).
- **`outils/`** — les scripts qui fabriquent ces pages, et les tests.
  Voir `outils/LISEZ-MOI.md`. Hors déploiement grâce à `.vercelignore`.
- **`db/`** — le schéma de la base et ses règles de sécurité.
  Voir `db/LISEZ-MOI.md`.
- `vercel.json` — URL sans `.html`, cache long sur `geo.js`, en-tête `noindex`.

## Le backend

Supabase : Postgres, comptes, stockage des photos. Les pages lui parlent
directement depuis le navigateur, il n'y a pas de serveur à nous. La clé
publiable qui se trouve dans `sb.js` est faite pour être publique ; ce qui
protège les données, ce sont les politiques RLS de `db/001_schema.sql`.

Quatre pages en dépendent : `referencer.html` (le gérant remplit sa fiche),
`espace-club.html` (il suit sa fiche et ses demandes de séance d'essai) et
`admin.html` (notre back-office, où une fiche est publiée ou refusée) et
`motdepasse.html` (le lien reçu par e-mail quand un gérant l'a oublié).

Côté pratiquant, la fiche d'une salle porte un formulaire de séance d'essai qui
écrit directement dans la base, et les pages de recherche, de ville et de
discipline se complètent depuis la base au chargement. Elles sont en plus
refabriquées toutes les heures pour Google, par
`.github/workflows/annuaire.yml`.
