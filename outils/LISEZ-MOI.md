# Les outils qui fabriquent le site

Le site servi par Vercel est à la racine du dépôt : des pages HTML complètes,
sans build et sans dépendance. Ces pages ne s'écrivent pas à la main, elles sont
assemblées par les scripts de ce dossier. Sans eux, la moindre correction de
gabarit demanderait de repasser sur quarante fichiers.

`.vercelignore` garde ce dossier hors du déploiement.

## Reconstruire le site

Dans l'ordre, sinon une étape travaille sur la version précédente :

    python3 gen_salles.py
    python3 build_clubs.py --clubs
    python3 build_clubs.py --referencer
    python3 build_clubs.py --espace-club
    python3 build_clubs.py --admin
    python3 build_recherche.py
    python3 build_salle.py
    python3 build.py
    python3 build_site.py       # recopie tout dans site/
    python3 build_annuaire.py   # les 24 pages de villes et de disciplines

Puis recopier `site/` à la racine du dépôt.

## Ce que fait chaque script

- `page.tpl.html` — le gabarit commun : styles, bandeau, pied de page.
- `build.py` — l'accueil.
- `build_clubs.py` — les quatre pages qui partagent la feuille `_clubs.css` :
  page de vente, formulaire de fiche, espace club, back-office.
- `build_recherche.py`, `build_salle.py`, `build_annuaire.py` — la recherche,
  la fiche d'une salle, les pages de ville et de discipline.
- `compte.py` — pose la fenêtre de création d'espace club et charge le client
  Supabase sur toutes les pages.
- `gen_salles.py`, `tuiles.py`, `vitrine.py` — les données de démonstration et
  les visuels de ville.
- `sync_artifact.py` — recopie `site/` vers la maquette publiée en Artifact.

## Les tests

`tests/` contient des parcours Playwright. Ils ouvrent les pages construites et
vérifient ce qu'un visiteur verrait.

    NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node tests/parcours.cjs

`backend.cjs` est le seul à part : il sert `site/` sur un petit serveur local et
remplace Supabase par `_faux_sb.js`, un faux serveur en mémoire. Il éprouve le
vrai code des pages — noms de champs, ordre des gestionnaires, enchaînement des
promesses — sans réseau. La sécurité, elle, se teste sur une vraie base :
voir `../db/rls_test.sh`.
