# Les outils qui fabriquent le site

Le site servi par Vercel est à la racine du dépôt : des pages HTML complètes,
sans build et sans dépendance. Ces pages ne s'écrivent pas à la main, elles sont
assemblées par les scripts de ce dossier. Sans eux, la moindre correction de
gabarit demanderait de repasser sur quarante fichiers.

`.vercelignore` garde ce dossier hors du déploiement.

## Reconstruire le site

    ./rebatir.sh

L'ordre des étapes n'est pas négociable : chacune lit ce que la précédente a
écrit. `rebatir.sh` le tient. Le résultat est dans `site/`, à recopier à la
racine du dépôt.

Pour reconstruire en relisant les clubs publiés dans la base :

    MCC_BASE=1 ./rebatir.sh

L'adresse du projet et la clé publiable sont lues dans `sb.js` à défaut de
`SUPABASE_URL` et `SUPABASE_CLE`. C'est ce que fait le workflow GitHub
`.github/workflows/annuaire.yml`, toutes les heures : les pages de ville et de
discipline sont écrites à l'avance pour Google, donc elles ne changent pas
toutes seules quand une fiche est publiée. Le visiteur, lui, n'attend pas :
`_annuaire.js` complète la page depuis la base au chargement.

## Ce que fait chaque script

- `page.tpl.html` — le gabarit commun : styles, bandeau, pied de page.
- `build.py` — l'accueil.
- `build_clubs.py` — les cinq pages qui partagent la feuille `_clubs.css` :
  page de vente, formulaire de fiche, espace club, back-office, nouveau mot de
  passe.
- `build_recherche.py`, `build_salle.py`, `build_annuaire.py` — la recherche,
  la fiche d'une salle, les pages de ville et de discipline.
- `compte.py` — pose la fenêtre de création d'espace club et charge le client
  Supabase sur toutes les pages.
- `gen_salles.py`, `tuiles.py`, `vitrine.py` — les données de démonstration et
  les visuels de ville. Les fonds de carte dont `tuiles.py` tire ses vignettes
  pèsent des dizaines de mégaoctets et ne sont pas dans le dépôt : les vignettes
  déjà dessinées sont gardées dans `vignettes/`, et c'est elles que le build
  relit. Effacer un fichier de `vignettes/` suffit à le faire redessiner, à
  condition d'avoir les fonds dans `../geo/`.
- `sync_artifact.py` — recopie `site/` vers la maquette publiée en Artifact.
- `adapte.cjs` — convertit des clubs de la base en salles du site. Il n'a pas
  son propre convertisseur : il charge celui du site (`MCC.enSalle`, dans
  `sb.js`) dans un faux navigateur, pour qu'il n'y en ait jamais deux.

## Les tests

`tests/` contient des parcours Playwright. Ils ouvrent les pages construites et
vérifient ce qu'un visiteur verrait.

    NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node tests/parcours.cjs

`essai.cjs` suit le pratiquant : la fiche d'un vrai club se charge depuis la
base par son slug, ne montre rien d'inventé, et la demande de séance d'essai
part. `annuaire.cjs` vérifie qu'un club publié apparaît partout où on le
cherche — accueil, recherche, page de ville, page de discipline — sans attendre
une reconstruction.

Le palier Pro est ce que `essai.cjs` éprouve à partir de sa cinquième section :
une fiche gratuite n'affiche aucun formulaire de réservation, aucun bouton
d'action, pas même le téléphone quelque part dans le HTML — et la base
elle-même ne le rend pas, puisque la vue `annuaire` le remplace par `null`.
Une demande envoyée à la main sur un club gratuit est refusée.

Le faux Supabase de `_faux_sb.js` refait cette vue : si une page affichait les
coordonnées d'un club gratuit, le test le verrait.

`backend.cjs` suit le gérant de bout en bout, y compris le suivi de ses
prospects : changer d'étape, écrire une note, poser une date de rappel, filtrer,
chercher, et exporter le CSV (le téléchargement est intercepté dans la page,
rien n'est écrit sur le disque).

`backend.cjs` est le seul à part : il sert `site/` sur un petit serveur local et
remplace Supabase par `_faux_sb.js`, un faux serveur en mémoire. Il éprouve le
vrai code des pages — noms de champs, ordre des gestionnaires, enchaînement des
promesses — sans réseau. La sécurité, elle, se teste sur une vraie base :
voir `../db/rls_test.sh`.
