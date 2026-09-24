# Mise en route — ce qu'il reste à faire à la main

Le site est en ligne et le code est prêt. Ce qui suit ne peut se faire que depuis
tes comptes : Supabase, Google et Vercel. Dans l'ordre.

---

## Les liens

| À quoi ça sert | Adresse |
|---|---|
| Le site | https://fight-scale.vercel.app |
| **Notre back-office** (publier ou refuser une fiche, ouvrir le Pro) | https://fight-scale.vercel.app/admin.html |
| L'espace d'un club (ses demandes, son suivi de prospects) | https://fight-scale.vercel.app/espace-club.html |
| La fiche d'un club, à remplir ou à modifier | https://fight-scale.vercel.app/referencer.html |
| La page « Mon compte » d'un gérant | https://fight-scale.vercel.app/mon-compte.html |
| La page de vente, avec les deux formules | https://fight-scale.vercel.app/clubs.html |
| À quoi ressemble une fiche complète | https://fight-scale.vercel.app/salle.html?demo=1 |

Le back-office ne s'ouvre qu'aux comptes inscrits dans la table `equipe` : un
gérant qui tombe dessus ne voit rien. L'espace club ne montre que le club dont on
est gérant.

Ces pages ne font rien tant que l'étape 1 n'est pas faite.

---

## 1. Supabase — cinq gestes, dix minutes

Les menus du tableau de bord Supabase changent de nom d'une version à l'autre, et
je ne peux pas les voir d'ici pour vérifier. Voici donc les **adresses directes**
de chaque écran : elles ouvrent la bonne page sans avoir à chercher dans le menu.
Si l'une tombe à côté, dis-le moi et on cherchera autrement.

### a. Coller le schéma

https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/sql/new

Le fichier à coller en entier :
https://raw.githubusercontent.com/amaurydescamps1011-art/FightScale/main/db/001_schema.sql
(tout sélectionner, copier, coller dans l'éditeur, **Run**.)

Il est rejouable : on peut le recoller à chaque changement sans rien casser.
**Il a changé aujourd'hui, donc il faut le recoller même s'il était déjà passé.**

### b. Créer le bucket des photos

https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/storage/buckets

**New bucket** → nom exactement `photos-clubs` → cocher **Public bucket** → Create.

### c. Couper la confirmation d'e-mail

https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/auth/providers

Dans la liste des fournisseurs, **cliquer sur la ligne `Email`** pour la déplier
(ce n'est pas un menu à part : c'est le premier de la liste, et il s'ouvre en
accordéon). Dedans, **désactiver `Confirm email`**, puis **Save**.

Selon la version, la case s'appelle *Confirm email* ou *Enable email
confirmations* ; si elle n'est pas là, elle est sur
https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/settings/auth

**Attention à ne pas confondre trois interrupteurs voisins** (Amaury s'est fait
avoir le 23/09) :

| Réglage | Doit être |
|---|---|
| **Enable email provider** | activé — sinon « Email signups are disabled » |
| **Allow new users to sign up** (bloc *User Signups*, au-dessus de la liste) | activé |
| **Confirm email** | **désactivé** — c'est le seul à couper |

**Pourquoi.** Par défaut, Supabase crée le compte mais n'ouvre pas de session tant
que le lien reçu par e-mail n'est pas cliqué — et son expéditeur intégré est limité
à quelques messages par heure sur un domaine partagé : le mail arrive en retard, en
spam, ou jamais. Tant que cette case est cochée, **personne** ne peut créer de
compte, pas seulement toi. On la remet dès qu'on a notre propre expéditeur
(section 3 bis) : c'est le bon réglage, mais il lui faut un vrai facteur derrière.

### d. Dire à Supabase quelles adresses de retour sont permises

https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/auth/url-configuration

- *Site URL* : `https://fight-scale.vercel.app`
- *Redirect URLs* : ajouter `https://fight-scale.vercel.app/referencer.html`
  et `https://fight-scale.vercel.app/motdepasse.html`

Sans ça, le lien « mot de passe oublié » et le retour de Google renvoient sur
`localhost`, c'est-à-dire nulle part.

### e. Créer ton compte, puis te donner les droits d'administrateur

**e.1 — Crée ton compte sur le site**, comme n'importe quel gérant.
https://fight-scale.vercel.app/clubs.html → bouton **Référencer ma salle** → nom
de ta salle, ton e-mail, un mot de passe d'au moins huit caractères → Continuer.
Après le point c, ça t'emmène directement sur le formulaire de fiche.

**e.2 — Une seule fois, donne-toi les droits du back-office.**
https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/sql/new

```sql
insert into equipe (membre_id)
select id from auth.users where email = 'ton-adresse@exemple.fr'
on conflict do nothing;
```

Ce n'est pas un bricolage de démarrage : c'est **volontairement** la seule façon
d'entrer dans `equipe`, la table des administrateurs. Aucune page, aucune
politique ne permet de s'y ajouter — sinon n'importe quel gérant de club se
donnerait accès au back-office. À refaire pour Antoine le jour où il aura son
compte, et pour personne d'autre.

Après ça, https://fight-scale.vercel.app/admin.html s'ouvre pour toi, et le menu
de ton compte, en haut à droite du site, porte un lien « Back-office ».

---

## 1 bis. Ou bien : me laisser le faire

Tout ce qui précède, je peux le faire moi-même, mais l'atelier où je tourne n'a
pas le droit de joindre Supabase — il refuse la connexion. Pour me l'ouvrir, dans
**Réglages du projet → Environnement** :

- **Accès réseau** : autoriser `*.supabase.co` et `api.supabase.com`.
- **Identifiants** : ajouter la clé `service_role` du projet Supabase
  (Settings → API) sous le nom `SUPABASE_SERVICE_ROLE`, et un jeton d'accès
  personnel (Account → Access Tokens) sous le nom `SUPABASE_ACCESS_TOKEN`.

Ces deux clés ouvrent tout le projet Supabase : elles vont là et nulle part
ailleurs — jamais dans le fil de discussion, jamais dans le dépôt. Elles sont
révocables d'un clic depuis Supabase le jour où tu veux couper.

Une fois posées, dis-le moi : je colle le schéma, je crée le bucket, je te mets
dans l'équipe, et tu n'as plus qu'à tester.

---

## 2. La connexion Google

Deux endroits : Google, puis Supabase.

### Chez Google

1. https://console.cloud.google.com → créer un projet (n'importe quel nom).
2. **APIs & Services → OAuth consent screen** : type **External**, nom de
   l'application « Mon Club Combat », adresse d'assistance, logo si tu veux.
   Laisser en mode **Testing** pour l'instant : ça suffit pour nos essais, il
   faudra passer en **Production** avant d'ouvrir aux clubs.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** :
   type **Web application**.
   - *Authorized JavaScript origins* : `https://fight-scale.vercel.app`
   - *Authorized redirect URIs* :
     `https://qhbutuhdmyajlgorbhxf.supabase.co/auth/v1/callback`
4. Garder le **Client ID** et le **Client secret** affichés à la fin.

### Chez Supabase

5. **Authentication → Sign In / Providers → Google** : activer, coller le Client ID
   et le Client secret, Save.
6. Vérifier que le point **1.d** est fait (Authentication → URL Configuration) :
   sans lui, Google renvoie sur la mauvaise page après la connexion.

Ne me donne jamais le Client secret : il n'a rien à faire dans le dépôt ni dans une
page, et le site n'en a pas besoin — c'est Supabase qui porte l'échange.

---

## 3. Vercel — fait

Le site est ouvert à tout le monde : vérifié le 23/09/2026 en navigation privée.
Rien à faire dans Deployment Protection.

Il reste invisible pour Google (balise `noindex`), et c'est volontaire : une page
d'annuaire vide indexée fait plus de mal que pas de page. À enlever quand
l'annuaire aura quelques clubs — dis-le moi, c'est une ligne à changer.

---

## 3 bis. Le domaine `monclubcombat.fr`, chez LWS

Le domaine est pris chez **LWS** (23/09/2026), donc **toute la zone DNS se
règle chez LWS** : les lignes que demandent Resend et Vercel se posent au même
endroit. Trois choses attendaient ce chaînon :

1. la confirmation d'adresse à la création de compte ;
2. la notification au gérant quand une demande de séance d'essai arrive (pour
   l'instant il doit ouvrir son espace pour la voir) ;
3. les relances par e-mail, promises dans le Pro à 39 €.

**Resend plutôt que Brevo.** Resend est fait pour les e-mails déclenchés par le
site (confirmation, notification, relance). Brevo est une plateforme marketing
dont on n'utiliserait que le SMTP, et son offre gratuite signe les e-mails de sa
marque. Resend : 3 000 e-mails par mois gratuits, 100 par jour.

**Ordre à suivre : a, b, c, d.** Garde deux onglets ouverts : LWS d'un côté,
Resend ou Vercel de l'autre.

### Où est la zone DNS chez LWS

Espace client LWS → **Mes domaines** (ou Mes services) → `monclubcombat.fr` →
**Gérer** → **Zone DNS**. Tu y vois déjà des lignes posées par LWS (A, MX,
TXT…). Pour chaque ligne à ajouter : le **type**, le **nom**, la **valeur**.

**Le piège du nom** : LWS ajoute tout seul `.monclubcombat.fr` derrière. Si
Resend affiche `send.monclubcombat.fr`, tape seulement **`send`**. Si tu tapes le
nom complet, ça devient `send.monclubcombat.fr.monclubcombat.fr` et rien ne se
vérifie. Pour le domaine nu, le nom est **`@`** (ou vide).

### a. Les e-mails : Resend

1. Compte gratuit sur https://resend.com.
2. **Domains → Add Domain** → `monclubcombat.fr`, région **EU (Ireland)**.
3. Resend affiche des enregistrements. Pose-les chez LWS un par un :

   | Type | Nom à taper chez LWS | Valeur |
   |---|---|---|
   | MX | `send` | celle de Resend (`feedback-smtp.eu-west-1…`), priorité **10** |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` (copie celle de Resend) |
   | TXT | `resend._domainkey` | la longue clé `p=…`, **copiée en entier** |
   | TXT | `_dmarc` | `v=DMARC1; p=none;` |

   La ligne DMARC n'est pas exigée par Resend mais Gmail la regarde : sans elle,
   nos e-mails finissent plus souvent en spam.
4. Ne touche pas aux MX déjà posés par LWS sur `@` : ils servent à *recevoir*
   du courrier, les nôtres sont sur `send` et servent à *envoyer*. Ils ne se
   gênent pas.
5. Retour sur Resend → **Verify**. Quelques minutes à quelques heures. Tant que
   c'est « Pending », rien ne part.

### b. Le site : Vercel

1. Vercel → projet **fight-scale** → **Settings → Domains → Add Domain** →
   `monclubcombat.fr`. Vercel propose d'ajouter aussi `www.monclubcombat.fr` qui
   redirige vers le domaine nu : **accepte cette option**.
2. Vercel affiche « Invalid Configuration » et les lignes à poser. En général :
   - un **A** sur `@` vers une adresse IP (recopie celle que Vercel affiche) ;
   - un **CNAME** sur `www` vers une adresse `…vercel-dns…`.
3. Chez LWS, **modifie** le A qui existe déjà sur `@` (LWS l'a fait pointer vers
   sa page de parking) au lieu d'en ajouter un second. Même chose pour `www` :
   s'il existe en A, supprime-le et crée le CNAME. **S'il y a une ligne AAAA sur
   `@` ou `www`, supprime-la** : sinon une partie des visiteurs tombe sur la page
   de LWS.
4. Retour sur Vercel : les deux lignes passent au vert, et le certificat HTTPS
   se fait tout seul. https://monclubcombat.fr affiche alors le site.
   `fight-scale.vercel.app` continue de marcher en parallèle.

### c. Le SMTP dans Supabase (quand Resend dit « Verified »)

1. Resend → **API Keys** → **Create API Key**, droit d'envoi. **La clé ne
   s'affiche qu'une fois.** Ne me la colle pas ici : elle va dans Supabase et
   nulle part ailleurs.
2. Supabase → **Authentication → Emails → SMTP Settings** → **Enable Custom
   SMTP** :
   - Host : `smtp.resend.com`
   - Port : `587`
   - Username : `resend`
   - Password : la clé API
   - Sender email : `contact@monclubcombat.fr`
   - Sender name : `Mon Club Combat`
3. **Save**, puis rallume **Confirm email** dans le bloc « User Signups » de la
   page Sign In / Providers (celui qu'on avait éteint le 23/09).

### d. Les adresses de retour dans Supabase (quand le site est sur le domaine)

https://supabase.com/dashboard/project/qhbutuhdmyajlgorbhxf/auth/url-configuration

- *Site URL* : `https://monclubcombat.fr`
- *Redirect URLs* : **ajoute** `https://monclubcombat.fr/referencer.html` et
  `https://monclubcombat.fr/motdepasse.html`. Garde les deux anciennes lignes
  `fight-scale.vercel.app` : elles ne gênent pas.

Puis le test : crée un compte avec une adresse à toi sur
https://monclubcombat.fr. L'e-mail de confirmation doit arriver (regarde les
spams la première fois), et son lien doit ramener sur `monclubcombat.fr`.

**Recevoir du courrier** sur `contact@monclubcombat.fr` est une autre affaire :
Resend ne fait qu'envoyer. Si des clubs répondent à nos e-mails, il faudra une
boîte ou une redirection vers ton Gmail, dans la partie e-mail de LWS. On le fera
quand on écrira les notifications.

---

## 4. Le test complet, dans l'ordre

À faire une fois les étapes 1 à 3 finies. Chaque ligne est vérifiable à l'œil.

### Le gérant

1. Ouvrir https://fight-scale.vercel.app en navigation privée. Cliquer
   « Référencer ma salle » dans le bandeau.
2. Sur la page de vente, cliquer « Référencer ma salle » au pied des trois étapes.
   → une fenêtre s'ouvre, avec **Continuer avec Google** en premier.
3. Cliquer Continuer avec Google, choisir un compte.
   → retour sur `referencer.html`, connecté, sans mot de passe à saisir.
4. Remplir la fiche : nom, adresse, ville, code postal, présentation, disciplines,
   photos, horaires d'ouverture.
5. **Ajouter deux ou trois cours** dans « Vos cours » : le jour, l'heure de début
   et de fin, la discipline, le niveau.
   → l'aperçu à droite compte les cours.
6. Envoyer. → « Votre fiche part en vérification ».
7. Aller sur `espace-club.html` : le nom du club, l'état « En vérification »,
   aucune demande, et **l'état de la fiche** poste par poste — ce qui est rempli
   en vert, ce qui manque en rouge avec le lien pour le corriger.
7 bis. En haut à droite de n'importe quelle page du site, **le bandeau porte
   maintenant ton compte** (les initiales de ta salle) et non plus le bouton
   « Référencer ma salle ». Le menu mène à l'espace club, à la fiche, à
   « Mon compte » et à la déconnexion.
7 ter. Sur `mon-compte.html` : écrire ton nom, ton téléphone, ton rôle,
   **Enregistrer**, puis recharger la page — tout doit être encore là. C'est la
   preuve que le compte existe vraiment en base et pas seulement à l'écran.
   Changer le mot de passe depuis cette page, se déconnecter, se reconnecter
   avec le nouveau.

### Nous

8. Sur `admin.html` : la fiche apparaît dans les fiches en attente.
9. Cliquer **Refuser** avec un motif, puis regarder `referencer.html` avec le
   compte du gérant : le motif s'affiche. Renvoyer la fiche.
10. Sur `admin.html`, **Publier**. → la fiche reçoit son adresse de page.

### Le pratiquant, sur une fiche gratuite

11. Chercher la ville sur le site. → la salle apparaît dans les résultats et sur la
    page de sa ville et de ses disciplines.
12. Ouvrir sa fiche. Vérifier que **rien** ne permet de la contacter : pas de
    téléphone, pas d'e-mail, pas de bouton de réservation. À la place, un pavé
    fermé « Coordonnées non communiquées ».
13. Le planning de la semaine, lui, s'affiche : c'est du contenu, pas du contact.

### Le pratiquant, sur une fiche Pro

14. Sur `admin.html`, passer le club en **Pro**.
15. Recharger la fiche. → le téléphone, l'e-mail et les boutons apparaissent, et
    le formulaire de séance d'essai aussi.
16. Dans le formulaire, le champ « Le cours qui vous intéresse » propose **tes
    cours**, dans l'ordre de la semaine. Il n'y a plus de champ de texte libre.
17. Réserver : nom, e-mail, choisir un cours, envoyer.

### Le gérant, encore

18. Sur `espace-club.html` : la demande est là, à l'état « Reçue », avec le libellé
    du cours choisi.
19. La faire avancer : Contactée → Confirmée → Venue → Adhérente. Les trois
    compteurs du haut suivent.
20. Écrire une note, poser une date de rappel à aujourd'hui, recharger la page :
    le rappel s'affiche en tête.
21. Cliquer **Exporter (CSV)** et ouvrir le fichier dans un tableur.

### Ce qui doit rater

22. Toujours en navigation privée, ouvrir la console du navigateur sur une fiche
    gratuite et taper :
    ```js
    await MCC.client.from('club').select('tel')
    ```
    → une erreur ou une liste vide. Le téléphone d'un club ne sort pas de la base
    sans abonnement, même en contournant la page.

---

## Ce qui n'existe pas encore

- **Personne n'est prévenu quand une demande arrive** : le gérant doit ouvrir son
  espace. Il faut un compte chez un expéditeur d'e-mails (Resend, Brevo, Postmark) ;
  dis-moi lequel et je branche l'envoi.
- **Les relances par e-mail**, même dépendance.
- **Le paiement Stripe** : le code est écrit, il attend ta société (Stripe exige une
  entité et un IBAN).
- **Les statistiques** et le **module d'acquisition**.
- **CGV et mentions légales** : bloquées sur ta société elles aussi.
