# La prise de rendez-vous : la fonction `rdv`

La page d'accueil de monclubcombat.fr propose de réserver un appel de 15 min.
Le widget de la page parle à **une seule fonction Edge Supabase**, `rdv`, qui
calcule les disponibilités, enregistre la réservation, crée l'évènement dans
Google Agenda (si c'est branché), envoie les e-mails par Resend et, toutes les
5 minutes, les rappels à moins d'une heure. Il n'y a pas d'autre serveur.

Adresse : `https://qhbutuhdmyajlgorbhxf.supabase.co/functions/v1/rdv`

## Les fichiers

| Fichier | Rôle |
|---|---|
| `logique.ts` | Toute la logique : créneaux (heure de Paris, été/hiver), validation, limites, e-mails, `.ics`, routage. Aucune API Deno : Node 22 l'exécute tel quel. Exporte `traite(req, env, deps)`. |
| `index.ts` | Le branchement, et rien d'autre : `Deno.serve`, `Deno.env`, le client Supabase (clé service), `fetch` vers Resend et Google. |
| `../../../db/010_rendez_vous.sql` | La table `rendez_vous`, ses index, le RLS, la tâche pg_cron des rappels. |
| `../../../outils/tests/rdv.test.mjs` | Les tests : `node --test outils/tests/rdv.test.mjs` |
| `../../../outils/tests/rdv_local.mjs` | Un serveur de démonstration en mémoire sur le port 8768, qui écrit les e-mails en HTML. |
| `../../../outils/tests/rdv_memoire.mjs` | La base, le courrier et l'agenda en mémoire que les deux précédents partagent. |
| `../../../outils/google_jeton.mjs` | Obtient le refresh token Google en local, sans rien écrire. |

## Ce que fait la fonction (le contrat)

Réponses en JSON. CORS ouvert à `https://monclubcombat.fr`,
`https://www.monclubcombat.fr`, `https://fight-scale.vercel.app` et
`http://localhost:*`. `verify_jwt = false` (voir `supabase/config.toml` : la
clé publiable que la page envoie n'est pas un JWT).

- `GET /disponibilites` : `200 { creneaux: [ISO UTC, triés], duree_min: 15, meet: true|false, fuseau: "Europe/Paris" }`.
  Créneaux de 15 min toutes les 30 min, **lundi à vendredi, 9 h 30 à 12 h 30 et
  14 h à 18 h 30 heure de Paris** (constante `HORAIRES` dans `logique.ts`), à
  partir de maintenant + 3 h, jusqu'à 14 jours. On retire les créneaux déjà
  réservés (`statut = 'confirme'`) et, si Google est branché, les plages
  occupées de l'agenda (`freeBusy`). Un créneau doit tenir en entier dans la
  plage : le dernier du matin est 12 h 00, le dernier du soir 18 h 00.
  `meet` dit si le format Google Meet existe (secrets Google posés).
- `POST /reserver` : `{ debut, prenom, nom, email, telephone, format: "meet"|"telephone", club, ville, discipline, situation, objectif, projet?, source?, site_web? }`
  - `201 { id, debut, fin, lien_meet|null }`
  - `400 { erreur: "champ_manquant", champ }`, `{ erreur: "email_invalide" }`, `{ erreur: "champ_trop_long", champ }`, `{ erreur: "format_invalide" }`, `{ erreur: "format_indisponible" }` (Meet demandé sans Google)
  - `409 { erreur: "creneau_pris" }` : hors liste, ou pris entre-temps (contrainte d'unicité en base)
  - `429 { erreur: "trop_de_demandes" }` : plus de 3 réservations pour cet e-mail, ou 10 pour cette adresse IP (hachée), sur 24 h
  - `500 { erreur: "serveur" }`
  - `site_web` est le champ piège : rempli, on répond 201 et il ne se passe rien.
  - Si Google ne répond pas, la réservation est **quand même** enregistrée (`lien_meet` null) ; le prospect lit qu'on lui enverra le lien, Amaury lit « Lien Meet non créé ».
- `POST /annuler { token }` ou `GET /annuler?token=` : `200 { ok: true, debut }`, idempotent (`200 { ok: true, deja: true, debut }` la deuxième fois), `404 { erreur: "inconnu" }`. Supprime l'évènement Google, envoie les deux e-mails d'annulation.
- `POST /rappels` avec `x-cron-secret: <RDV_CRON_SECRET>` : `200 { envoyes: n }`. Rappelle les `confirme` qui commencent dans moins de 60 min, une seule fois (`rappel_envoye_le`). `401` sans le secret.
- Autre route : `404 { erreur: "route_inconnue" }` ; mauvaise méthode : `405`.

## Les e-mails

Expéditeur `Mon Club Combat <rdv@monclubcombat.fr>` (domaine vérifié chez
Resend). HTML une colonne sur fond blanc, bouton rouge, version texte jointe.

| Quand | À | Sujet |
|---|---|---|
| réservation | le prospect | `RDV confirmé · vendredi 25 septembre à 10:00` + pièce jointe `rendez-vous.ics` |
| réservation | contact@ | `📅 Nouvelle résa · Prénom Nom · date` (répondre écrit au prospect) |
| 1 h avant | le prospect | `⏰ Rappel : votre appel Mon Club Combat dans 1 h (date)` |
| annulation | le prospect | `RDV annulé · date` |
| annulation | contact@ | `❌ Annulation · Prénom Nom · date` |

Le `.ics` : `METHOD:REQUEST`, `UID` = id de la réservation, dates en UTC,
`SUMMARY` « Appel Mon Club Combat », `LOCATION` = lien Meet ou « Téléphone »,
`DESCRIPTION` avec le lien d'annulation `https://monclubcombat.fr/annuler?token=…`.

## 1. La base : coller `db/010_rendez_vous.sql`

Dans Supabase → SQL Editor, coller le fichier entier puis Run. Il est rejouable.
Il crée la table `rendez_vous` (RLS activé : seule la clé service écrit et lit,
l'équipe lit via `est_admin()`), l'index unique qui garantit un créneau par
rendez-vous, l'extension `pg_cron`, et la fonction `rdv_planifie_rappels()`.

Si `pg_cron` ne se crée pas depuis le SQL Editor, l'activer dans
Database → Extensions, puis relancer `select rdv_planifie_rappels();`.

## 2. Les secrets de la fonction

Supabase → Edge Functions → Secrets
(https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/functions/secrets).

| Nom | Obligatoire | Valeur |
|---|---|---|
| `RESEND_API_KEY` | oui | la clé Resend (`re_…`), celle du domaine monclubcombat.fr |
| `RDV_CRON_SECRET` | non | inutile depuis le 20/10/2026 : le secret est tiré dans le coffre par `db/011_rdv_secret_cron.sql` et la fonction l'y lit. S'il est posé ici, il prime, et la même valeur doit alors aller dans le coffre. |
| `RDV_SEL_IP` | conseillé | une autre chaîne au hasard : le sel du hash des adresses IP. À défaut, `RDV_CRON_SECRET` sert de sel. |
| `RDV_NOTIFIE` | non | l'adresse qui reçoit les notifications ; défaut `contact@monclubcombat.fr` |
| `SITE_URL` | non | défaut `https://monclubcombat.fr` (liens des e-mails) |
| `GOOGLE_CLIENT_ID` | non | voir étape 5 |
| `GOOGLE_CLIENT_SECRET` | non | voir étape 5 |
| `GOOGLE_REFRESH_TOKEN` | non | voir étape 5 |
| `GOOGLE_CALENDAR_ID` | non | défaut `primary` (l'agenda principal du compte) |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent déjà : Supabase les
fournit tout seul. **Sans les quatre `GOOGLE_*`, tout marche** : créneaux
calculés depuis les horaires et la base, format téléphone seul (`meet: false`),
l'e-mail dit qu'Amaury appelle au numéro donné.

## 3. Le secret du cron dans le coffre, puis la tâche

Coller `db/011_rdv_secret_cron.sql` : il tire le secret au hasard dans le
coffre (personne ne le voit), ouvre `rdv_secret_cron()` à la seule clé
service pour que la fonction le relise, et lance `select rdv_planifie_rappels();`.
Fait sur le projet le 20/10/2026.

La seconde ligne crée la tâche `rdv-rappels` (toutes les 5 minutes, via
`net.http_post`). La commande planifiée relit le coffre à chaque exécution : le
secret n'apparaît pas dans `cron.job`. Pour vérifier :

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
```

Si la fonction n'est pas encore déployée, les premières exécutions rendent 404 :
c'est normal jusqu'à l'étape 4.

## 4. Déployer la fonction

**Avec le CLI**, depuis la racine du dépôt :

```sh
supabase functions deploy rdv --project-ref qhbutuhdmyajlgorbhxf --no-verify-jwt
```

(`supabase/config.toml` porte déjà `verify_jwt = false` pour `rdv`.)

**Depuis le tableau de bord** : Edge Functions → Deploy a new function →
nom `rdv`, coller `index.ts` dans `index.ts` et ajouter un second fichier
`logique.ts` avec le contenu de `logique.ts`. Éteindre « Enforce JWT
verification ». Pour une mise à jour : ouvrir la fonction → Code → remplacer
les deux fichiers → Deploy updates.

Vérifier :

```sh
curl https://qhbutuhdmyajlgorbhxf.supabase.co/functions/v1/rdv/disponibilites
```

doit rendre `{"creneaux":[…],"duree_min":15,"meet":false,"fuseau":"Europe/Paris"}`
(`meet` passe à `true` une fois Google branché).

## 5. Google Agenda et Google Meet (facultatif)

1. Dans https://console.cloud.google.com/ créer un projet (ou en prendre un),
   puis **APIs & Services → Library** : activer **Google Calendar API**.
2. **OAuth consent screen** : type *External*, nom « Mon Club Combat », l'adresse
   d'Amaury en contact ; dans *Test users*, ajouter le compte Google dont
   l'agenda recevra les rendez-vous. Portées demandées par le script :
   `calendar.events` (créer et supprimer les évènements) et `calendar.freebusy`
   (lire les plages occupées).
3. **Credentials → Create credentials → OAuth client ID**, type **Desktop app**.
   Noter le *Client ID* et le *Client secret*.
4. Sur une machine avec Node 22 et un navigateur :

   ```sh
   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node outils/google_jeton.mjs
   ```

   Le script affiche une adresse : l'ouvrir, choisir le compte, accepter. Le
   refresh token s'affiche dans le terminal. Le script n'écrit rien sur le
   disque : copier le jeton **directement** dans les secrets de la fonction
   (`GOOGLE_REFRESH_TOKEN`), avec `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.
5. Tant que l'écran de consentement est en statut *Testing*, Google révoque le
   refresh token au bout de 7 jours. Passer le projet en **Production**
   (bouton *Publish app* ; pour ces portées, pas de validation nécessaire
   tant que l'application reste à usage interne) pour un jeton durable.

Ce que la fonction fait avec : `freeBusy.query` pour retirer les plages
occupées, `events.insert` avec `conferenceDataVersion=1` pour obtenir le lien
Meet (le prospect est invité, `sendUpdates=none` : ce sont nos e-mails qui
invitent), `events.delete` à l'annulation. Un appel au téléphone bloque aussi
l'agenda, sans visio.

## Tester en local

```sh
# les tests (Node 22, aucune installation)
node --test outils/tests/rdv.test.mjs

# un serveur de démonstration, base en mémoire, Google absent (meet:false)
node outils/tests/rdv_local.mjs
# ou avec un faux Google (meet:true, faux lien Meet)
node outils/tests/rdv_local.mjs --meet
```

Le serveur écoute sur `http://localhost:8768/functions/v1/rdv` et écrit chaque
e-mail dans `outils/tests/sorties/mails/` (`NN-genre.html`, `.txt`, `.ics`,
plus `journal.json`). Le front y pointe quand `window.MCC_RDV_API` vaut
`http://localhost:8768/functions/v1/rdv` (c'est ce que fait le script de
capture). Routes de service : `GET /_test/etat`, `POST /_test/reinitialise`,
`POST /_test/rappels` (joue le cron).

```sh
curl -s http://localhost:8768/functions/v1/rdv/disponibilites
curl -s -X POST http://localhost:8768/functions/v1/rdv/reserver -H 'content-type: application/json' \
  -d '{"debut":"<un créneau de la liste>","prenom":"Karim","nom":"Benali","email":"karim@salle.fr","format":"telephone","telephone":"06 12 34 56 78","club":"Team Ouragan","ville":"Lyon","discipline":"mma","situation":"Ouverte, des cours à remplir","objectif":"Remplir mes cours"}'
```

## Ce qu'il faut savoir

- **Un créneau, un rendez-vous.** L'index unique partiel `(debut) where statut = 'confirme'`
  tranche quand deux personnes cliquent au même instant : la seconde reçoit 409
  et revient au choix du créneau.
- **Les limites** (3 par e-mail, 10 par adresse, sur 24 h) comptent toutes les
  lignes créées, annulées comprises. L'adresse IP n'est jamais stockée : un
  SHA-256 salé (`RDV_SEL_IP`, à défaut `RDV_CRON_SECRET`) seulement. Sans
  aucun des deux secrets, l'adresse n'est pas hachée du tout (`ip_hash` reste
  nul, la limite par adresse est inactive) et le journal le dit : un SHA-256
  d'IPv4 sans sel se casse par force brute. L'adresse lue est
  `cf-connecting-ip` (posé par Cloudflare), sinon la **dernière** entrée de
  `x-forwarded-for`, celle que la passerelle a ajoutée : la première est
  écrite par le client lui-même et se forge à volonté.
- **Les champs** sont nettoyés avant tout : les caractères de contrôle (sauts
  de ligne compris) deviennent une espace dans les champs à une ligne ; seul
  `projet` garde ses sauts de ligne, rendus en retrait dans les e-mails. Un
  `\n` glissé dans un prénom ne fabrique donc ni sujet cassé ni fausse ligne
  « E-mail : … » dans le mail d'Amaury.
- **Le journal** de la fonction (Edge Functions → Logs) ne porte que des
  identifiants, des dates et des codes d'erreur : jamais un nom, un e-mail, un
  téléphone ni une adresse.
- **Les rappels** sont marqués avant l'envoi (deux crons qui se chevauchent ne
  doublent pas) et libérés si Resend refuse (le passage suivant réessaie).
- **Un Resend en panne** n'empêche pas la réservation : elle est en base,
  l'erreur est au journal.
- `honore` et `absent` sont des statuts posés à la main par l'équipe, après
  l'appel (Table Editor) ; la fonction ne les écrit pas.
