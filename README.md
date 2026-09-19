# Site FightScale — maquette

Site statique, aucune dépendance et aucun build : cinq fichiers servis tels quels.

- `index.html` — accueil
- `recherche.html` — résultats et carte
- `clubs.html` — référencer ma salle
- `carte.js` — la carte de France en semis de points du héros
- `geo.js` — la géographie embarquée de la carte de recherche (1,6 Mo)
- `vercel.json` — URL sans `.html`, cache long sur `geo.js`, en-tête `noindex`
- `robots.txt` — indexation bloquée : les salles, les notes et les chiffres sont fictifs

## Déployer

Depuis ce dossier :

    npx vercel deploy --prod

ou déposer le dossier sur https://vercel.com/new (import d'un dossier).

Rien à configurer : framework « Other », pas de commande de build,
répertoire de sortie = la racine.
