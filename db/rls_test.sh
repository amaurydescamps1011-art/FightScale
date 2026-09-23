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

$P -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null
$P -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
SQL
$P -v ON_ERROR_STOP=1 -f "$ICI/001_schema.sql" >/dev/null 2>&1 || { echo "le schema ne s'applique pas"; exit 1; }
# rejouable : le meme fichier passe deux fois sans erreur
$P -v ON_ERROR_STOP=1 -f "$ICI/001_schema.sql" >/dev/null 2>&1 || { echo "le schema n'est pas rejouable"; exit 1; }

$P -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444');
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
ok "et la demande passe alors" \
   "$(q "set role anon; with i as (insert into demande (club_id,nom,mail) values ('dddddddd-0000-0000-0000-000000000004','P','p@ex.fr') returning 1) select count(*) from i;")" "1 "
ok "le visiteur ne relit pas les demandes" \
   "$(q "set role anon; select count(*) from demande;")" "0 "
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

echo
[ $RATES -eq 0 ] && echo "tout passe" || { echo "$RATES echec(s)"; exit 1; }
