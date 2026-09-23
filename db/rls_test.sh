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
insert into club (id, nom, ville, statut) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Club A', 'Marseille', 'en_attente'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Club B', 'Lyon',      'publie'),
  ('cccccccc-0000-0000-0000-000000000003', 'Club C', 'Paris',     'en_attente');
insert into club_membre (club_id, membre_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
insert into demande (club_id, nom, mail) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Jean', 'jean@ex.fr');
SQL

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
AD=33333333-3333-3333-3333-333333333333
N=44444444-4444-4444-4444-444444444444
RATES=0
ok(){ if [ "$2" = "$3" ]; then echo "  ok     $1"; else echo "  ECHEC  $1 -> [$2] au lieu de [$3]"; RATES=$((RATES+1)); fi; }
cnx(){ echo "set role authenticated; set request.jwt.claim.sub='$1';"; }

ok "le visiteur ne voit que les clubs publies" \
   "$(q "set role anon; select coalesce(string_agg(nom,', '),'(rien)') from club;")" "Club B "
ok "le gerant voit son club et les publies" \
   "$(q "$(cnx $A) select string_agg(nom,', ' order by nom) from club;")" "Club A, Club B "
ok "il ne modifie pas le club d'un autre" \
   "$(q "$(cnx $A) with u as (update club set nom='pirate' where id='cccccccc-0000-0000-0000-000000000003' returning 1) select count(*) from u;")" "0 "
ok "il ne publie pas son propre club" \
   "$(q "$(cnx $A) update club set statut='publie' where id='aaaaaaaa-0000-0000-0000-000000000001';" | cut -c1-5)" "ERROR"
ok "il modifie bien son club" \
   "$(q "$(cnx $A) with u as (update club set presentation='x' where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from u;")" "1 "
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
ok "le visiteur ne relit pas les demandes" \
   "$(q "set role anon; select count(*) from demande;")" "0 "

echo
[ $RATES -eq 0 ] && echo "tout passe" || { echo "$RATES echec(s)"; exit 1; }
