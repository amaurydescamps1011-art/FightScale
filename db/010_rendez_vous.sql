-- Mon Club Combat : la prise de rendez-vous de la page d'accueil (19/10/2026).
--
-- A coller dans Supabase, SQL Editor, puis Run, apres 001_schema.sql (il lui
-- emprunte est_admin()). Rejouable : tout est en « if not exists », et les
-- politiques sont recreees.
--
-- Trois idees :
--   1. La table `rendez_vous` n'est lisible et modifiable que par la cle
--      service, c'est-a-dire par la fonction Edge `rdv`. Aucune politique pour
--      anon ni authenticated, sauf la lecture pour l'equipe (est_admin()).
--   2. Un creneau ne se reserve qu'une fois : l'index unique partiel sur
--      `debut` parmi les `confirme` tranche quand deux visiteurs cliquent au
--      meme instant ; la fonction repond alors 409 au second.
--   3. Les rappels partent par pg_cron, toutes les 5 minutes, qui appelle la
--      fonction avec un secret lu dans le coffre (Vault). Le secret ne figure
--      ni ici ni dans la table des taches.

create extension if not exists "pgcrypto";

-- la fonction est_admin() vient de 001_schema.sql : sans elle, on s'arrete net
-- avec une phrase claire plutot qu'une erreur de politique plus bas
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'est_admin') then
    raise exception 'Collez d''abord db/001_schema.sql : est_admin() manque.';
  end if;
end $$;

-- ---------------------------------------------------------- la table
create table if not exists rendez_vous (
  id               uuid primary key default gen_random_uuid(),
  cree_le          timestamptz not null default now(),
  -- l'appel : 15 minutes, en UTC ; la fonction calcule `fin`
  debut            timestamptz not null,
  fin              timestamptz not null,

  -- le gerant
  prenom           text,
  nom              text,
  email            text,
  telephone        text,
  -- les regles sur `format` et `statut` sont posees plus bas, par nom
  -- (rendez_vous_format_connu, rendez_vous_statut_connu), pour exister une
  -- seule fois, table neuve ou table deja la
  format           text,

  -- sa salle, et ce qu'il a repondu dans le tunnel
  club             text,
  ville            text,
  discipline       text,
  situation        text,
  objectif         text,
  projet           text,
  -- { "utm_source": ..., "utm_campaign": ..., "utm_content": ... }
  source           jsonb,

  -- `honore` et `absent` sont poses a la main par l'equipe, apres l'appel
  statut           text not null default 'confirme',
  -- le lien d'annulation des e-mails : /annuler?token=...
  token_annulation uuid not null default gen_random_uuid(),

  -- ce que Google Agenda a rendu, s'il est branche
  evenement_google text,
  lien_meet        text,

  rappel_envoye_le timestamptz,
  annule_le        timestamptz,
  -- SHA-256 de (sel + adresse IP), jamais l'adresse : sert a la limite de
  -- 10 reservations par adresse et par jour
  ip_hash          text
);

-- rejouable : les colonnes arrivees apres le premier collage s'ajoutent ici
alter table rendez_vous add column if not exists prenom           text;
alter table rendez_vous add column if not exists nom              text;
alter table rendez_vous add column if not exists email            text;
alter table rendez_vous add column if not exists telephone        text;
alter table rendez_vous add column if not exists format           text;
alter table rendez_vous add column if not exists club             text;
alter table rendez_vous add column if not exists ville            text;
alter table rendez_vous add column if not exists discipline       text;
alter table rendez_vous add column if not exists situation        text;
alter table rendez_vous add column if not exists objectif         text;
alter table rendez_vous add column if not exists projet           text;
alter table rendez_vous add column if not exists source           jsonb;
alter table rendez_vous add column if not exists statut           text not null default 'confirme';
alter table rendez_vous add column if not exists token_annulation uuid not null default gen_random_uuid();
alter table rendez_vous add column if not exists evenement_google text;
alter table rendez_vous add column if not exists lien_meet        text;
alter table rendez_vous add column if not exists rappel_envoye_le timestamptz;
alter table rendez_vous add column if not exists annule_le        timestamptz;
alter table rendez_vous add column if not exists ip_hash          text;

-- une table creee par une version anterieure de ce fichier portait ces deux
-- regles une seconde fois, sous les noms que Postgres invente : on les retire
alter table rendez_vous drop constraint if exists rendez_vous_format_check;
alter table rendez_vous drop constraint if exists rendez_vous_statut_check;
do $$ begin
  alter table rendez_vous add constraint rendez_vous_format_connu
    check (format in ('meet', 'telephone'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table rendez_vous add constraint rendez_vous_statut_connu
    check (statut in ('confirme', 'annule', 'honore', 'absent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table rendez_vous add constraint rendez_vous_fin_apres_debut
    check (fin > debut);
exception when duplicate_object then null; end $$;

-- Un seul rendez-vous confirme par creneau. C'est cette contrainte, et pas
-- la liste des disponibilites, qui tient quand deux personnes cliquent en meme
-- temps : la seconde insertion echoue (23505) et la fonction repond 409.
create unique index if not exists rendez_vous_creneau_unique
  on rendez_vous (debut) where statut = 'confirme';

create unique index if not exists rendez_vous_token_idx
  on rendez_vous (token_annulation);

-- les rappels : « confirme, a venir, pas encore rappele »
create index if not exists rendez_vous_rappel_idx
  on rendez_vous (debut) where statut = 'confirme' and rappel_envoye_le is null;

-- les limites par e-mail et par adresse sur 24 h. La fonction range l'e-mail
-- en minuscules avant de l'ecrire et le cherche avec `email = $1` : c'est la
-- colonne nue qu'il faut indexer, pas lower(email) (un index d'expression ne
-- servirait pas a cette requete). L'ancien index sur lower(email) est retire.
drop index if exists rendez_vous_email_idx;
create index if not exists rendez_vous_email_recents_idx on rendez_vous (email, cree_le desc);
create index if not exists rendez_vous_ip_idx      on rendez_vous (ip_hash, cree_le desc);
create index if not exists rendez_vous_cree_le_idx on rendez_vous (cree_le desc);

-- ---------------------------------------------------------- les droits
-- RLS active, et aucune politique d'ecriture pour qui que ce soit depuis le
-- site : seule la cle service (dans la fonction Edge `rdv`) ecrit, et elle
-- passe a cote du RLS. Supabase donne par defaut tous les droits a anon et
-- authenticated sur une table neuve : on les retire, puis on ne rend que la
-- lecture a l'equipe.
alter table rendez_vous enable row level security;
revoke all on rendez_vous from public, anon, authenticated;
grant select on rendez_vous to authenticated;

drop policy if exists rendez_vous_equipe on rendez_vous;
create policy rendez_vous_equipe on rendez_vous
  for select to authenticated using (est_admin());

-- ---------------------------------------------------------- les rappels
-- La fonction Edge envoie elle-meme les rappels quand on l'appelle sur
-- POST /rappels avec l'en-tete x-cron-secret. C'est pg_cron qui l'appelle,
-- toutes les 5 minutes, par pg_net. Le secret vit dans le coffre :
--
--   select vault.create_secret('<le meme secret que RDV_CRON_SECRET>', 'rdv_cron_secret');
--
-- Tant qu'il n'y est pas, la tache n'est pas creee (voir le message a la fin
-- du collage) ; une fois le secret pose, relancer :
--
--   select rdv_planifie_rappels();
--
-- La commande planifiee relit le coffre a chaque execution : le secret ne
-- figure jamais dans cron.job.
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then null; end $$;
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron n''a pas pu etre cree ici (%). Activez-le dans Database > Extensions, puis select rdv_planifie_rappels();', sqlerrm;
end $$;

create or replace function rdv_planifie_rappels(
  url text default 'https://qhbutuhdmyajlgorbhxf.supabase.co/functions/v1/rdv/rappels'
) returns boolean
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  present boolean := false;
  commande text;
begin
  -- le secret existe-t-il ? (on ne le lit pas ici : la tache le lira elle-meme)
  begin
    select exists (select 1 from vault.decrypted_secrets where name = 'rdv_cron_secret') into present;
  exception when others then
    raise notice 'Le coffre (vault) n''est pas lisible : %', sqlerrm;
    return false;
  end;
  if not present then
    raise notice 'Aucun secret « rdv_cron_secret » dans le coffre : la tache des rappels n''est pas creee. '
                 'Posez-le avec select vault.create_secret(''...'', ''rdv_cron_secret''); puis select rdv_planifie_rappels();';
    return false;
  end if;

  -- la meme tache ne doit exister qu'une fois
  begin
    perform cron.unschedule('rdv-rappels');
  exception when others then null;
  end;

  commande := format(
    $c$select net.http_post(
         url := %L,
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rdv_cron_secret' limit 1)),
         body := '{}'::jsonb,
         timeout_milliseconds := 20000)$c$, url);

  begin
    perform cron.schedule('rdv-rappels', '*/5 * * * *', commande);
  exception when others then
    raise notice 'pg_cron a refuse la tache : %. Activez l''extension pg_cron puis relancez select rdv_planifie_rappels();', sqlerrm;
    return false;
  end;
  raise notice 'Tache « rdv-rappels » planifiee toutes les 5 minutes vers %', url;
  return true;
end
$$;

-- personne ne l'appelle depuis le site : elle lit le coffre
revoke all on function rdv_planifie_rappels(text) from public, anon, authenticated;

-- on tente tout de suite : avec le secret en place, la tache nait au collage ;
-- sans lui, un message explique quoi faire
select rdv_planifie_rappels();
