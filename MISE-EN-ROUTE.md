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
| La page de vente, avec les deux formules | https://fight-scale.vercel.app/clubs.html |
| À quoi ressemble une fiche complète | https://fight-scale.vercel.app/salle.html?demo=1 |

Le back-office ne s'ouvre qu'aux comptes inscrits dans la table `equipe` : un
gérant qui tombe dessus ne voit rien. L'espace club ne montre que le club dont on
est gérant.

Ces pages ne font rien tant que l'étape 1 n'est pas faite.

---

## 1. Supabase — quatre gestes, dix minutes

Sur https://supabase.com/dashboard, projet `qhbutuhdmyajlgorbhxf`.

1. **Coller le schéma.** SQL Editor → nouvelle requête → coller tout le contenu de
   `db/001_schema.sql` → Run. Le fichier est rejouable : on peut le recoller à
   chaque changement sans rien casser. **Il a changé aujourd'hui, donc il faut le
   recoller même s'il avait déjà été passé.**
2. **Créer le bucket des photos.** Storage → New bucket → nom `photos-clubs` →
   cocher **Public bucket** → Create.
3. **Couper la confirmation d'e-mail, le temps des essais.** Authentication →
   Sign In / Providers → **Email** → décocher **Confirm email** → Save.
   Sans ça, Supabase crée bien le compte mais n'ouvre pas de session tant que le
   lien reçu par e-mail n'est pas cliqué — et son expéditeur intégré est limité à
   quelques messages par heure, donc le mail arrive en retard, en spam, ou pas du
   tout. C'est ce qui donne l'impression que la création de compte ne marche pas.
   À remettre avant d'ouvrir aux clubs, avec un vrai expéditeur (Resend, Brevo)
   dans Authentication → Emails → SMTP Settings.
4. **Se mettre dans l'équipe.** Il faut d'abord un compte : aller sur
   https://fight-scale.vercel.app/clubs.html, cliquer « Référencer ma salle » et
   créer le compte. Puis, dans le SQL Editor :

   ```sql
   insert into equipe (membre_id)
   select id from auth.users where email = 'ton-adresse@exemple.fr';
   ```

   Après ça, `admin.html` s'ouvre.

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
6. **Authentication → URL Configuration** :
   - *Site URL* : `https://fight-scale.vercel.app`
   - *Redirect URLs* : ajouter `https://fight-scale.vercel.app/referencer.html`
     et `https://fight-scale.vercel.app/motdepasse.html`

Sans le point 6, Google renvoie sur la mauvaise page après la connexion.

Ne me donne jamais le Client secret : il n'a rien à faire dans le dépôt ni dans une
page, et le site n'en a pas besoin — c'est Supabase qui porte l'échange.

---

## 3. Vercel — ouvrir le site

Aujourd'hui le site est protégé : seuls les comptes de ton équipe Vercel y entrent.
Tant que c'est le cas, un club à qui tu envoies le lien tombe sur un écran de
connexion Vercel.

Vercel → projet `fight-scale` → **Settings → Deployment Protection → Vercel
Authentication** → désactiver.

Le site reste invisible pour Google (balise `noindex`) tant que tu ne me dis pas de
l'enlever. À faire quand l'annuaire aura quelques clubs : une page vide indexée est
pire que pas de page.

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
   aucune demande.

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
