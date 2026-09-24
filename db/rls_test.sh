#!/bin/bash
# Eprouve les politiques RLS de 001_schema.sql sur un Postgres local.
#
# Pourquoi local : depuis le bac a sable, supabase.com n'est pas joignable. Or le
# RLS est la seule chose qui empeche un gerant de lire le club d'un autre, donc il
# doit etre teste. On imite ce que Supabase pose deja (le schema auth, les roles
# anon et authenticated, auth.uid()) et on rejoue le schema par-dessus.
#
#   bash rls_test.sh
set -u
D=${PGDIR:-/var/tmp/mccpg}
export PATH=/usr/lib/postgresql/16/bin:$PATH
ICI=$(cd "$(dirname "$0")" && pwd)

if [ ! -d "$D/data" ]; then
  mkdir -p "$D"; chown postgres:postgres "$D"; chmod 700 "$D"
  su postgres -s /bin/bash -c "PATH=$PATH; initdb -D $D/data -U postgres --auth=trust" >/dev/null
fi
pg_isready -h "$D" -p 5433 -q 2>/dev/null || \
  su postgres -s /bin/bash -c "PATH=$PATH; pg_ctl -D $D/data -l $D/log.txt -o '-k $D -p 5433 -c listen_addresses=' start" >/dev/null

P="psql -h $D -p 5433 -U postgres -q"
q(){ psql -h "$D" -p 5433 -U postgres -tAq -c "$1" 2>&1 | tr '\n' ' ' | sed 's/  */ /g'; }

$P -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists net cascade; drop schema if exists vault cascade;" >/dev/null 2>&1
$P -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb, email text);
-- ce que Supabase fournit pour l'e-mail au club : pg_net (qui ici ne fait que
-- noter l'appel) et le coffre, vide au depart
create schema net;
create table net.envois (url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
  language sql as $$ insert into net.envois values (url, headers, body); select 1::bigint $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
SQL
# Ce que Supabase donne par defaut a anon et authenticated sur tout objet cree
# dans public : pose AVANT le schema, pour que ses revoke comptent comme la-bas.
$P -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
SQL
$P -v ON_ERROR_STOP=1 -f "$ICI/001_schema.sql" >/dev/null 2>&1 || { echo "le schema ne s'applique pas"; exit 1; }
# rejouable : le meme fichier passe deux fois sans erreur
$P -v ON_ERROR_STOP=1 -f "$ICI/001_schema.sql" >/dev/null 2>&1 || { echo "le schema n'est pas rejouable"; exit 1; }

$P -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into auth.users (id, raw_user_meta_data, email) values
  ('11111111-1111-1111-1111-111111111111', '{"full_name":"Alain"}'::jsonb, 'alain@ex.fr'),
  ('22222222-2222-2222-2222-222222222222', '{}'::jsonb, 'gerant-b@ex.fr'),
  ('33333333-3333-3333-3333-333333333333', '{}'::jsonb, null),
  ('44444444-4444-4444-4444-444444444444', '{}'::jsonb, null);
insert into equipe (membre_id) values ('33333333-3333-3333-3333-333333333333');
insert into club (id, nom, ville, statut, offre, tel, mail, instagram) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Club A', 'Marseille', 'en_attente', 'gratuit', '0491000001', 'a@ex.fr', 'club_a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Club B', 'Lyon',      'publie',     'pro',     '0472000002', 'b@ex.fr', 'club_b'),
  ('cccccccc-0000-0000-0000-000000000003', 'Club C', 'Paris',     'en_attente', 'gratuit', '0142000003', 'c@ex.fr', 'club_c'),
  ('dddddddd-0000-0000-0000-000000000004', 'Club D', 'Nice',      'publie',     'gratuit', '0493000004', 'd@ex.fr', 'club_d');
insert into club_membre (club_id, membre_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
insert into demande (club_id, nom, mail) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Jean', 'jean@ex.fr');
-- ce que le webhook Stripe ecrit, avec la cle service_role (donc hors RLS,
-- comme postgres ici) : le detail de l'abonnement du club B
insert into abonnement (club_id, stripe_client, stripe_abonnement, statut, fin_periode) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cus_B', 'sub_B', 'active', now() + interval '30 days');
SQL

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
AD=33333333-3333-3333-3333-333333333333
N=44444444-4444-4444-4444-444444444444
RATES=0
ok(){ if [ "$2" = "$3" ]; then echo "  ok     $1"; else echo "  ECHEC  $1 -> [$2] au lieu de [$3]"; RATES=$((RATES+1)); fi; }
cnx(){ echo "set role authenticated; set request.jwt.claim.sub='$1';"; }

# L'annuaire public est une vue, plus la table : la table rendait `select *`,
# donc le telephone de tous les clubs a qui refaisait la requete a la main.
ok "le visiteur ne lit plus la table des clubs" \
   "$(q "set role anon; select coalesce(string_agg(nom,', ' order by nom),'(rien)') from club;")" "(rien) "
ok "il lit l'annuaire, et seulement les publies" \
   "$(q "set role anon; select string_agg(nom,', ' order by nom) from annuaire;")" "Club B, Club D "
# le paywall d'Amaury (23/09/2026) : pas de coordonnees sans abonnement
ok "un club gratuit ne rend ni tel ni mail ni reseaux" \
   "$(q "set role anon; select coalesce(tel,'-')||coalesce(mail,'-')||coalesce(instagram,'-') from annuaire where nom='Club D';")" "--- "
ok "un club Pro les rend" \
   "$(q "set role anon; select tel||' '||mail from annuaire where nom='Club B';")" "0472000002 b@ex.fr "
ok "et personne n'ecrit dans l'annuaire" \
   "$(q "set role anon; update annuaire set tel='0600000000' where nom='Club D';" | cut -c1-5)" "ERROR"
ok "le gerant ne voit que son club dans la table" \
   "$(q "$(cnx $A) select string_agg(nom,', ' order by nom) from club;")" "Club A "
ok "il ne modifie pas le club d'un autre" \
   "$(q "$(cnx $A) with u as (update club set nom='pirate' where id='cccccccc-0000-0000-0000-000000000003' returning 1) select count(*) from u;")" "0 "
ok "il ne publie pas son propre club" \
   "$(q "$(cnx $A) update club set statut='publie' where id='aaaaaaaa-0000-0000-0000-000000000001';" | cut -c1-5)" "ERROR"
ok "il modifie bien son club" \
   "$(q "$(cnx $A) with u as (update club set presentation='x' where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from u;")" "1 "
# le RLS ne sait pas proteger une colonne : c'est le trigger club_offre_figee qui
# remet l'ancienne valeur, donc l'update reussit mais l'offre ne bouge pas
ok "un gerant ne s'offre pas le Pro" \
   "$(q "$(cnx $A) with u as (update club set offre='pro' where id='aaaaaaaa-0000-0000-0000-000000000001' returning offre) select * from u;")" "gratuit "
ok "il ne lit pas les demandes d'un autre club" \
   "$(q "$(cnx $A) select count(*) from demande;")" "0 "
ok "chaque club lit ses propres demandes" \
   "$(q "$(cnx $B) select count(*) from demande;")" "1 "
ok "il ne s'invite pas sur le club d'un autre" \
   "$(q "$(cnx $A) insert into club_membre (club_id, membre_id) values ('bbbbbbbb-0000-0000-0000-000000000002','$A');" | cut -c1-5)" "ERROR"
ok "il ne se fait pas admin" \
   "$(q "$(cnx $A) insert into equipe (membre_id) values ('$A');" | cut -c1-5)" "ERROR"
ok "il n'insere pas un club directement" \
   "$(q "$(cnx $A) insert into club (nom, statut) values ('Direct','publie');" | cut -c1-5)" "ERROR"
ok "un nouveau compte cree son club" \
   "$(q "$(cnx $N) select creer_mon_club('Ma Nouvelle Salle') is not null;")" "t "
ok "et en est le gerant" \
   "$(q "$(cnx $N) select count(*) from club_membre where membre_id='$N';")" "1 "
ok "mais pas un deuxieme" \
   "$(q "$(cnx $N) select creer_mon_club('Une Deuxieme');" | cut -c1-5)" "ERROR"
ok "un visiteur ne cree pas de club" \
   "$(q "set role anon; select creer_mon_club('Anonyme');" | cut -c1-5)" "ERROR"
ok "l'equipe publie une fiche" \
   "$(q "$(cnx $AD) with u as (update club set statut='publie' where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from u;")" "1 "
ok "une demande d'essai passe sur un club publie" \
   "$(q "set role anon; with i as (insert into demande (club_id,nom,mail) values ('bbbbbbbb-0000-0000-0000-000000000002','Lea','lea@ex.fr') returning 1) select count(*) from i;")" "1 "
ok "mais pas sur un club non publie" \
   "$(q "set role anon; insert into demande (club_id,nom,mail) values ('cccccccc-0000-0000-0000-000000000003','P','p@ex.fr');" | cut -c1-5)" "ERROR"
# la reservation en ligne est ce que le club achete : la cacher dans la page ne
# suffit pas, c'est la politique qui doit refuser le depot
ok "ni sur une fiche gratuite" \
   "$(q "set role anon; insert into demande (club_id,nom,mail) values ('dddddddd-0000-0000-0000-000000000004','P','p@ex.fr');" | cut -c1-5)" "ERROR"
ok "l'equipe ouvre le Pro" \
   "$(q "$(cnx $AD) with u as (update club set offre='pro' where id='dddddddd-0000-0000-0000-000000000004' returning offre) select * from u;")" "pro "
# Le formulaire demande « quand vous arrange » en toutes lettres : la colonne
# etait un timestamptz, et ce depot-la echouait sur la vraie base.
# Le visiteur depose sans rien relire -- il n'a aucune politique de lecture sur
# `demande`, donc un `returning` sur une colonne echouerait ici comme il
# echouerait dans le navigateur. C'est le club qui verifie.
q "set role anon; insert into demande (club_id,nom,mail,creneau) values ('bbbbbbbb-0000-0000-0000-000000000002','Nadia','n@ex.fr','Mardi soir');" >/dev/null
ok "un creneau en toutes lettres est accepte" \
   "$(q "$(cnx $B) select creneau from demande where nom='Nadia';")" "Mardi soir "
# un visiteur ne relit jamais ce qu'il vient de deposer : `returning` sur une
# colonne passe par la politique de lecture, qu'anon n'a pas
ok "le visiteur ne relit pas son propre depot" \
   "$(q "set role anon; insert into demande (club_id,nom,mail) values ('bbbbbbbb-0000-0000-0000-000000000002','Zoe','z@ex.fr') returning nom;" | cut -c1-5)" "ERROR"
ok "et la demande passe alors" \
   "$(q "set role anon; with i as (insert into demande (club_id,nom,mail) values ('dddddddd-0000-0000-0000-000000000004','P','p@ex.fr') returning 1) select count(*) from i;")" "1 "
# Amaury, 23/09/2026 : une seance d'essai doit tomber sur un horaire de cours.
# Tant que le club n'a pas de planning, le texte libre reste accepte (ci-dessus).
# Des qu'il en a un, la base n'accepte plus qu'un de ses cours -- sinon la regle
# ne tiendrait que dans le formulaire, et un depot a la main passerait a cote.
q "$(cnx $AD) update club set cours='[{\"id\":\"k3f9\",\"jour\":1,\"de\":\"18:30\",\"a\":\"20:00\",\"quoi\":\"MMA\"}]'::jsonb where id='dddddddd-0000-0000-0000-000000000004';" >/dev/null
ok "un cours du planning est accepte" \
   "$(q "set role anon; with i as (insert into demande (club_id,nom,mail,cours_id,creneau) values ('dddddddd-0000-0000-0000-000000000004','Ines','i@ex.fr','k3f9','Mardi 18h30 - 20h00 - MMA') returning 1) select count(*) from i;")" "1 "
ok "un cours invente est refuse" \
   "$(q "set role anon; insert into demande (club_id,nom,mail,cours_id) values ('dddddddd-0000-0000-0000-000000000004','Max','m@ex.fr','zzzz');" | cut -c1-5)" "ERROR"
ok "et le texte libre ne passe plus sur ce club" \
   "$(q "set role anon; insert into demande (club_id,nom,mail,creneau) values ('dddddddd-0000-0000-0000-000000000004','Max','m@ex.fr','quand je veux');" | cut -c1-5)" "ERROR"
ok "le cours d'un club ne sert pas a un autre" \
   "$(q "set role anon; insert into demande (club_id,nom,mail,cours_id) values ('bbbbbbbb-0000-0000-0000-000000000002','Max','m@ex.fr','k3f9');" | cut -c1-5)" "ERROR"
ok "le planning sort cote public" \
   "$(q "set role anon; select cours->0->>'quoi' from annuaire where id='dddddddd-0000-0000-0000-000000000004';")" "MMA "
ok "le visiteur ne relit pas les demandes" \
   "$(q "set role anon; select count(*) from demande;")" "0 "
# le suivi de prospect : le club annote et reclasse les siens, personne d'autre
ok "le club suit son prospect" \
   "$(q "$(cnx $B) with u as (update demande set statut='contactee', notes='rappele jeudi', relance='2026-10-01' where club_id='bbbbbbbb-0000-0000-0000-000000000002' and nom='Jean' returning 1) select count(*) from u;")" "1 "
ok "les notes ne sortent pas cote public" \
   "$(q "set role anon; select coalesce(string_agg(notes,','),'(rien)') from demande;")" "(rien) "
ok "un autre gerant n'y touche pas" \
   "$(q "$(cnx $A) with u as (update demande set notes='pirate' returning 1) select count(*) from u;")" "0 "
# Le profil du compte (Amaury, 23/09/2026 : « au moins qu'il ait un profil de
# compte et qu'il soit enregistre quelque part »). Il existe des l'inscription,
# meme sans club, et chacun ne voit que le sien.
ok "le profil nait avec le compte" \
   "$(q "select count(*) from profil;")" "4 "
ok "et il porte le nom donne a l'inscription" \
   "$(q "select nom from profil where membre_id='$A';")" "Alain "
ok "un compte ecrit son profil" \
   "$(q "$(cnx $N) with i as (insert into profil (membre_id, nom, tel, fonction) values ('$N','Nadia','0600000000','Coach') on conflict (membre_id) do update set nom=excluded.nom, tel=excluded.tel, fonction=excluded.fonction returning 1) select count(*) from i;")" "1 "
ok "il le relit" \
   "$(q "$(cnx $N) select nom||' / '||fonction from profil;")" "Nadia / Coach "
ok "il ne lit que le sien" \
   "$(q "$(cnx $A) select count(*) from profil;")" "1 "
ok "il n'ecrit pas celui d'un autre" \
   "$(q "$(cnx $A) insert into profil (membre_id, nom) values ('$N','pirate');" | cut -c1-5)" "ERROR"
ok "ni ne renomme la ligne d'un autre" \
   "$(q "$(cnx $A) with u as (update profil set nom='pirate' where membre_id='$N' returning 1) select count(*) from u;")" "0 "
ok "le visiteur anonyme ne voit aucun profil" \
   "$(q "set role anon; select count(*) from profil;")" "0 "
# Les vues d'une fiche : un visiteur en ajoute une par la fonction, et ne lit
# rien ; le club lit les siennes, personne d'autre. (Club C est reste en
# attente ; les autres ont ete publies par les tests precedents.)
q "set role anon; select compte_vue('bbbbbbbb-0000-0000-0000-000000000002');" >/dev/null
ok "un visiteur compte une vue sur un club publie" \
   "$(q "select n from vue_fiche where club_id='bbbbbbbb-0000-0000-0000-000000000002';")" "1 "
q "set role anon; select compte_vue('cccccccc-0000-0000-0000-000000000003');" >/dev/null
ok "il ne compte rien sur un club qui n'est pas publie" \
   "$(q "select count(*) from vue_fiche where club_id='cccccccc-0000-0000-0000-000000000003';")" "0 "
ok "il ne relit pas les chiffres" \
   "$(q "set role anon; select count(*) from vue_fiche;")" "0 "
ok "ni n'ecrit dans la table a la main" \
   "$(q "set role anon; insert into vue_fiche (club_id, n) values ('bbbbbbbb-0000-0000-0000-000000000002', 9999);" | cut -c1-5)" "ERROR"
ok "le club lit les siennes" \
   "$(q "$(cnx $B) select n from vue_fiche where club_id='bbbbbbbb-0000-0000-0000-000000000002';")" "1 "
ok "un autre gerant ne voit pas celles-la" \
   "$(q "$(cnx $A) select count(*) from vue_fiche where club_id='bbbbbbbb-0000-0000-0000-000000000002';")" "0 "

# vouloir passer au Pro : le gerant le dit pour son club, sous son nom, et c'est
# l'equipe seule qui repond. Tant que Stripe n'est pas branche, c'est ce bouton
# qui remplace le passage en caisse.
ok "un gerant demande le Pro pour son club" \
   "$(q "$(cnx $A) with i as (insert into interet_pro (club_id, membre_id) values ('aaaaaaaa-0000-0000-0000-000000000001','$A') returning 1) select count(*) from i;")" "1 "
ok "mais pas pour celui d'un autre" \
   "$(q "$(cnx $A) insert into interet_pro (club_id, membre_id) values ('bbbbbbbb-0000-0000-0000-000000000002','$A');" | cut -c1-5)" "ERROR"
ok "ni sous le nom d'un autre" \
   "$(q "$(cnx $A) insert into interet_pro (club_id, membre_id) values ('aaaaaaaa-0000-0000-0000-000000000001','$B');" | cut -c1-5)" "ERROR"
ok "il relit la sienne" \
   "$(q "$(cnx $A) select count(*) from interet_pro;")" "1 "
ok "un autre gerant ne la voit pas" \
   "$(q "$(cnx $B) select count(*) from interet_pro;")" "0 "
ok "le visiteur anonyme n'en voit aucune" \
   "$(q "set role anon; select count(*) from interet_pro;")" "0 "
ok "et ne s'en invente pas" \
   "$(q "set role anon; insert into interet_pro (club_id) values ('aaaaaaaa-0000-0000-0000-000000000001');" | cut -c1-5)" "ERROR"
ok "le gerant ne se repond pas a lui-meme" \
   "$(q "$(cnx $A) with u as (update interet_pro set repondu_le = now() where club_id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from u;")" "0 "
ok "il peut retirer sa demande" \
   "$(q "$(cnx $A) with d as (delete from interet_pro where club_id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from d;")" "1 "

# l'identifiant Stripe d'un club vit dans `abonnement` et pas sur `club`, parce
# que l'annuaire lit `club` en select * avec la cle publique
ok "l'abonnement ne sort pas cote public" \
   "$(q "set role anon; select count(*) from abonnement;")" "0 "
ok "un gerant ne lit pas l'abonnement d'un autre" \
   "$(q "$(cnx $A) select count(*) from abonnement;")" "0 "
ok "il lit le sien" \
   "$(q "$(cnx $B) select stripe_client from abonnement;")" "cus_B "
ok "et ne se l'invente pas" \
   "$(q "$(cnx $A) insert into abonnement (club_id, statut) values ('aaaaaaaa-0000-0000-0000-000000000001','active');" | cut -c1-5)" "ERROR"
ok "ni ne prolonge le sien" \
   "$(q "$(cnx $B) with u as (update abonnement set fin_periode = now() + interval '9 years' where club_id='bbbbbbbb-0000-0000-0000-000000000002' returning 1) select count(*) from u;")" "0 "

# L'e-mail au club quand une demande arrive (24/09/2026). La base ecrit a Resend
# par pg_net ; ici pg_net ne fait que noter l'appel dans net.envois.
ok "sans cle Resend dans le coffre, rien ne part" \
   "$(q "select count(*) from net.envois;")" "0 "
q "insert into vault.decrypted_secrets values ('resend_cle', 're_test');" >/dev/null
q "set role anon; insert into demande (club_id,nom,mail,tel,message) values ('bbbbbbbb-0000-0000-0000-000000000002','<b>Zoé</b>','zoe@ex.fr','06 12 34 56 78','Débutante <script>x</script>');" >/dev/null
ok "avec la cle, une demande anonyme part en un e-mail" \
   "$(q "select count(*) from net.envois;")" "1 "
ok "vers Resend, avec la cle du coffre" \
   "$(q "select url||' '||(headers->>'Authorization') from net.envois;")" "https://api.resend.com/emails Bearer re_test "
ok "au gerant du club, et a lui seul" \
   "$(q "select body->'to' from net.envois;")" "[\"gerant-b@ex.fr\"] "
ok "le gerant qui repond ecrit au pratiquant" \
   "$(q "select body->>'reply_to' from net.envois;")" "zoe@ex.fr "
ok "le nom du pratiquant est echappe dans le HTML" \
   "$(q "select (body->>'html') like '%&lt;b&gt;Zoé&lt;/b&gt;%' and (body->>'html') not like '%<b>Zoé%' from net.envois;")" "t "
ok "son message aussi" \
   "$(q "select (body->>'html') not like '%<script>%' from net.envois;")" "t "
ok "le texte brut accompagne le HTML" \
   "$(q "select (body->>'text') like '%06 12 34 56 78%' from net.envois;")" "t "
# un club sans compte de gerant : l'adresse de sa fiche prend le relais
q "insert into demande (club_id,nom,mail) values ('cccccccc-0000-0000-0000-000000000003','Paul','paul@ex.fr');" >/dev/null
ok "sans gerant, l'adresse de la fiche recoit" \
   "$(q "select body->'to' from net.envois where body->>'reply_to'='paul@ex.fr';")" "[\"c@ex.fr\"] "
# un Resend en panne ne doit jamais faire echouer le formulaire du pratiquant
q "create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'panne'; end \$\$;" >/dev/null
ok "si l'envoi echoue, la demande s'enregistre quand meme" \
   "$(q "set role anon; with i as (insert into demande (club_id,nom,mail) values ('bbbbbbbb-0000-0000-0000-000000000002','Ines','ines@ex.fr') returning 1) select count(*) from i;")" "1 "
ok "personne n'appelle l'envoi a la main" \
   "$(q "set role anon; select previent_le_club();" | cut -c1-5)" "ERROR"

ok "la creation de club reste fermee au visiteur" \
   "$(q "set role anon; select creer_mon_club('X');" | cut -c1-5)" "ERROR"

# La page acquisition (24/09/2026) : un club laisse ses coordonnees, l'equipe
# seule les lit, et recoit un e-mail.
q "create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as \$\$ insert into net.envois values (url, headers, body); select 1::bigint \$\$; delete from net.envois;" >/dev/null
ok "un visiteur depose une demande d'acquisition" \
   "$(q "set role anon; insert into contact_acquisition (club,ville,nom,mail,pack) values ('Fight Club','Lyon','Sam','sam@ex.fr','boost'); select 1;")" "1 "
ok "l'equipe est prevenue sur contact@, et repond au club" \
   "$(q "select (body->'to')::text || ' ' || (body->>'reply_to') from net.envois;")" "[\"contact@monclubcombat.fr\"] sam@ex.fr "
ok "le visiteur ne relit pas les demandes" \
   "$(q "set role anon; select count(*) from contact_acquisition;")" "0 "
ok "un gerant non plus" \
   "$(q "$(cnx $A) select count(*) from contact_acquisition;")" "0 "
ok "l'equipe les lit" \
   "$(q "$(cnx $AD) select count(*) from contact_acquisition;")" "1 "
ok "un visiteur ne se marque pas deja traite" \
   "$(q "set role anon; insert into contact_acquisition (club,ville,nom,mail,traite_le) values ('X','Y','Z','z@ex.fr',now());" | cut -c1-5)" "ERROR"
ok "une offre inventee est refusee" \
   "$(q "set role anon; insert into contact_acquisition (club,ville,nom,mail,pack) values ('X','Y','Z','z@ex.fr','gratuit');" | cut -c1-5)" "ERROR"

# Les packs achetes en ligne (24/09/2026). La fonction achat-pack et le webhook
# ecrivent avec la cle service_role (ici postgres, hors RLS) ; depuis le site,
# personne n'ecrit, et seule l'equipe lit.
q "delete from net.envois; insert into commande_pack (id,pack,duree,montant_centimes,club,ville,nom,mail,tel,stripe_session) values ('eeeeeeee-0000-0000-0000-000000000001','grow',3,51000,'<b>Iron</b> Gym','Lyon','Sam','sam@ex.fr','06 00 00 00 00','cs_test_1');" >/dev/null
ok "une commande nait en attente, sans mail" \
   "$(q "select statut || ' ' || (payee_le is null) || ' ' || (select count(*) from net.envois) from commande_pack;")" "en_attente true 0 "
ok "le visiteur ne lit pas les commandes" \
   "$(q "set role anon; select count(*) from commande_pack;" | cut -c1-5)" "ERROR"
ok "un gerant non plus" \
   "$(q "$(cnx $A) select count(*) from commande_pack;")" "0 "
ok "l'equipe les lit" \
   "$(q "$(cnx $AD) select pack || ' ' || montant_centimes from commande_pack;")" "grow 51000 "
ok "le visiteur ne passe pas de commande a la main" \
   "$(q "set role anon; insert into commande_pack (pack,duree,montant_centimes,club,ville,nom,mail) values ('grow',0,1,'X','Y','Z','z@ex.fr');" | cut -c1-5)" "ERROR"
ok "un compte connecte non plus" \
   "$(q "$(cnx $A) insert into commande_pack (pack,duree,montant_centimes,club,ville,nom,mail) values ('grow',0,1,'X','Y','Z','z@ex.fr');" | cut -c1-5)" "ERROR"
ok "personne ne se declare paye depuis le site" \
   "$(q "set role anon; update commande_pack set statut='payee';" | cut -c1-5)" "ERROR"
ok "ni un gerant, ni meme l'equipe" \
   "$(q "$(cnx $AD) update commande_pack set statut='payee';" | cut -c1-5)" "ERROR"
q "update commande_pack set statut='payee', stripe_client='cus_P', stripe_abonnement='sub_P' where id='eeeeeeee-0000-0000-0000-000000000001';" >/dev/null
ok "payee par le webhook, la date du paiement se pose" \
   "$(q "select statut || ' ' || (payee_le is not null) from commande_pack;")" "payee true "
ok "et l'equipe recoit un e-mail, un seul" \
   "$(q "select count(*) from net.envois;")" "1 "
ok "sur contact@, avec le club en reponse" \
   "$(q "select (body->'to')::text || ' ' || (body->>'reply_to') from net.envois;")" "[\"contact@monclubcombat.fr\"] sam@ex.fr "
ok "le sujet dit le pack et le club" \
   "$(q "select body->>'subject' from net.envois;")" "Pack Grow payé : <b>Iron</b> Gym "
ok "le nom du club est echappe dans le HTML" \
   "$(q "select (body->>'html') like '%&lt;b&gt;Iron%' and (body->>'html') not like '%<b>Iron%' from net.envois;")" "t "
ok "le montant se lit en euros" \
   "$(q "select (body->>'text') like '%510,00 € HT / mois%' from net.envois;")" "t "
# Stripe rejoue ses evenements : un deuxieme « payee » n'envoie rien de plus, et
# ne deplace pas la date du premier paiement
AVANT=$(q "select payee_le from commande_pack;")
q "update commande_pack set statut='payee', stripe_client='cus_P';" >/dev/null
ok "un evenement rejoue ne renvoie pas de mail" \
   "$(q "select count(*) from net.envois;")" "1 "
ok "un impaye se note" \
   "$(q "with u as (update commande_pack set statut='impayee' returning statut) select * from u;")" "impayee "
ok "un statut invente est refuse" \
   "$(q "update commande_pack set statut='offerte';" | cut -c1-5)" "ERROR"
ok "un pack invente aussi" \
   "$(q "insert into commande_pack (pack,duree,montant_centimes,club,ville,nom,mail) values ('gratuit',0,100,'X','Y','Z','z@ex.fr');" | cut -c1-5)" "ERROR"
ok "et une duree hors grille" \
   "$(q "insert into commande_pack (pack,duree,montant_centimes,club,ville,nom,mail) values ('grow',12,100,'X','Y','Z','z@ex.fr');" | cut -c1-5)" "ERROR"
ok "ou une adresse sans arobase" \
   "$(q "insert into commande_pack (pack,duree,montant_centimes,club,ville,nom,mail) values ('grow',0,100,'X','Y','Z','pas-une-adresse');" | cut -c1-5)" "ERROR"
# un Resend en panne ne doit jamais faire echouer le webhook
q "create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'panne'; end \$\$;" >/dev/null
ok "si l'envoi echoue, la commande passe payee quand meme" \
   "$(q "with u as (update commande_pack set statut='payee' returning statut) select * from u;")" "payee "
ok "et le premier paiement garde sa date" \
   "$(q "select payee_le from commande_pack;")" "$AVANT"
ok "personne n'appelle le mail des packs a la main" \
   "$(q "set role anon; select previent_pack_paye();" | cut -c1-5)" "ERROR"

echo
[ $RATES -eq 0 ] && echo "tout passe" || { echo "$RATES echec(s)"; exit 1; }
