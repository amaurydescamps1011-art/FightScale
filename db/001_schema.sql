-- Mon Club Combat — schema de depart.
--
-- A coller tel quel dans Supabase, SQL Editor, puis Run. Il est rejouable :
-- tout est en « if not exists » ou en « drop policy if exists ».
--
-- Trois idees seulement :
--   1. auth.users appartient a Supabase, on n'y touche pas. Un gerant s'y inscrit,
--      et `club_membre` relie son compte a son club.
--   2. Un club a un `statut`. Rien n'est public avant `publie` : c'est la
--      validation d'Amaury qui fait paraitre une fiche, jamais l'inscription.
--   3. Le RLS (Row Level Security) est ce qui protege reellement les donnees.
--      La cle « anon » du site est publique par construction ; ce sont ces
--      politiques, pas le secret de la cle, qui empechent un gerant de lire ou
--      de modifier le club d'un autre.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- les clubs
do $$ begin
  create type statut_club as enum ('brouillon', 'en_attente', 'publie', 'refuse', 'suspendu');
exception when duplicate_object then null; end $$;

create table if not exists club (
  id            uuid primary key default gen_random_uuid(),
  cree_le       timestamptz not null default now(),
  modifie_le    timestamptz not null default now(),

  statut        statut_club not null default 'brouillon',
  -- le motif d'un refus, montre au gerant dans son espace
  motif_refus   text,
  publie_le     timestamptz,

  -- identite
  nom           text not null,
  -- l'URL de la fiche : /salle/fight-club-marseille. Unique, pose a la publication.
  slug          text unique,
  presentation  text,

  -- adresse
  adresse       text,
  code_postal   text,
  ville         text,
  -- posees par le geocodage, pas saisies par le gerant
  lat           double precision,
  lon           double precision,

  -- contact
  tel           text,
  mail          text,
  site          text,
  instagram     text,
  facebook      text,
  -- le nom de la personne a joindre, jamais affiche publiquement
  contact_nom   text,

  -- le reste
  disciplines   text[] not null default '{}',
  -- { "lundi": ["18:00","21:00"], ... } ; un jour absent = ferme
  horaires      jsonb  not null default '{}'::jsonb,
  -- chemins dans le bucket « photos-clubs », dans l'ordre de la galerie
  photos        text[] not null default '{}',

  -- l'abonnement : 'gratuit' ou 'pro'. C'est lui qui ouvre la reservation en
  -- ligne, donc un gerant ne doit jamais pouvoir se le donner (voir le trigger
  -- club_offre_figee plus bas). Seuls l'equipe et le service_role l'ecrivent.
  offre         text not null default 'gratuit'
                check (offre in ('gratuit', 'pro'))
);

create index if not exists club_statut_idx on club (statut);
create index if not exists club_ville_idx  on club (lower(ville));
create index if not exists club_disc_idx   on club using gin (disciplines);

-- ------------------------------------------------- qui gere quel club
-- Une table de liaison plutot qu'une colonne `proprietaire` sur club : un club
-- pourra avoir plusieurs gerants sans rien changer au schema.
create table if not exists club_membre (
  club_id   uuid not null references club (id) on delete cascade,
  membre_id uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'gerant',
  cree_le   timestamptz not null default now(),
  primary key (club_id, membre_id)
);

create index if not exists club_membre_membre_idx on club_membre (membre_id);

-- ------------------------------------------------------ l'equipe Mon Club Combat
-- Etre dans cette table, c'est etre admin. On n'y entre qu'a la main depuis
-- Supabase : aucune politique ne permet de s'y ajouter soi-meme.
create table if not exists equipe (
  membre_id uuid primary key references auth.users (id) on delete cascade,
  cree_le   timestamptz not null default now()
);

create or replace function est_admin() returns boolean
  language sql stable security definer set search_path = public, auth as
$$ select exists (select 1 from equipe where membre_id = auth.uid()) $$;

create or replace function gere_le_club(cible uuid) returns boolean
  language sql stable security definer set search_path = public, auth as
$$ select exists (
     select 1 from club_membre where club_id = cible and membre_id = auth.uid()
   ) $$;

-- ------------------------------------------------------ creer son club
-- security definer : la fonction ecrit les deux lignes hors RLS, donc il n'existe
-- aucun instant ou le club est cree sans gerant. Elle refuse un compte qui gere
-- deja un club : un gerant, un club, tant qu'on n'a pas besoin du contraire.
create or replace function creer_mon_club(nom_salle text)
  returns uuid
  language plpgsql security definer set search_path = public, auth as
$$
declare nouveau uuid;
begin
  if auth.uid() is null then
    raise exception 'Il faut etre connecte pour creer un club.';
  end if;
  if exists (select 1 from club_membre where membre_id = auth.uid()) then
    raise exception 'Ce compte gere deja un club.';
  end if;
  if coalesce(trim(nom_salle), '') = '' then
    raise exception 'Le nom de la salle est obligatoire.';
  end if;

  insert into club (nom, statut) values (trim(nom_salle), 'brouillon')
    returning id into nouveau;
  insert into club_membre (club_id, membre_id) values (nouveau, auth.uid());
  return nouveau;
end
$$;

revoke all on function creer_mon_club(text) from public, anon;
grant execute on function creer_mon_club(text) to authenticated;

-- -------------------------------------------- les demandes de seance d'essai
-- La regle metier d'Amaury : un lead n'est compte que si la reservation est
-- confirmee. Le statut porte donc cette distinction des maintenant.
do $$ begin
  create type statut_demande as enum ('recue', 'confirmee', 'honoree', 'absente', 'annulee');
exception when duplicate_object then null; end $$;

create table if not exists demande (
  id        uuid primary key default gen_random_uuid(),
  cree_le   timestamptz not null default now(),
  club_id   uuid not null references club (id) on delete cascade,
  statut    statut_demande not null default 'recue',

  -- le pratiquant n'a pas de compte dans le MVP : il laisse ses coordonnees
  nom       text not null,
  mail      text not null,
  tel       text,
  message   text,
  discipline text,
  creneau   timestamptz
);

create index if not exists demande_club_idx on demande (club_id, cree_le desc);

-- ------------------------------------------------------------ modifie_le
create or replace function touche_modifie_le() returns trigger
  language plpgsql as
$$ begin new.modifie_le = now(); return new; end $$;

drop trigger if exists club_modifie_le on club;
create trigger club_modifie_le before update on club
  for each row execute function touche_modifie_le();

-- =====================================================================
-- RLS. Rien n'est lisible ni modifiable par defaut : chaque acces est une
-- politique nommee ci-dessous.
-- =====================================================================
alter table club        enable row level security;
alter table club_membre enable row level security;
alter table equipe      enable row level security;
alter table demande     enable row level security;

-- --- club ---
-- Tout le monde, connecte ou non, lit les clubs publies. C'est l'annuaire.
drop policy if exists club_lecture_publique on club;
create policy club_lecture_publique on club
  for select using (statut = 'publie');

-- Un gerant lit son club quel que soit son statut : il doit voir son brouillon
-- et le motif d'un refus.
drop policy if exists club_lecture_gerant on club;
create policy club_lecture_gerant on club
  for select to authenticated using (gere_le_club(id) or est_admin());

-- Creer un club passe par creer_mon_club() (plus bas), jamais par un insert
-- direct : il faut creer la fiche ET le rattachement en une seule fois, sinon il
-- existe un instant ou le club n'a pas de gerant et ou n'importe qui peut s'y
-- rattacher.

-- Modifier son club, sans pouvoir se publier ni se sortir d'un refus tout seul.
drop policy if exists club_edition_gerant on club;
create policy club_edition_gerant on club
  for update to authenticated
  using (gere_le_club(id))
  with check (gere_le_club(id) and statut in ('brouillon', 'en_attente'));

-- L'offre ne s'achete pas en modifiant sa fiche. Le RLS ne sait pas proteger une
-- colonne : un gerant qui edite son club passe la politique ci-dessus et pourrait
-- y glisser offre = 'pro'. Ce trigger remet l'ancienne valeur pour tout le monde
-- sauf l'equipe ; le service_role (le webhook de paiement) ne passe pas par la
-- puisqu'il contourne le RLS, mais il contourne aussi ce trigger seulement s'il
-- est admin -- donc on le laisse passer explicitement quand auth.uid() est nul.
create or replace function club_offre_figee() returns trigger
  language plpgsql security definer set search_path = public, auth as
$$
begin
  if new.offre is distinct from old.offre
     and auth.uid() is not null and not est_admin() then
    new.offre := old.offre;
  end if;
  return new;
end
$$;

drop trigger if exists club_offre_figee_t on club;
create trigger club_offre_figee_t before update on club
  for each row execute function club_offre_figee();

-- L'equipe fait tout le reste : publier, refuser, suspendre.
drop policy if exists club_edition_admin on club;
create policy club_edition_admin on club
  for all to authenticated using (est_admin()) with check (est_admin());

-- --- club_membre ---
drop policy if exists membre_lecture on club_membre;
create policy membre_lecture on club_membre
  for select to authenticated
  using (membre_id = auth.uid() or est_admin());

-- Aucune politique d'insertion pour un gerant : on ne se rattache pas a un club
-- a la main. Le premier essai ecrivait « et seulement si le club n'a pas deja un
-- gerant », ce qui ne tenait pas : cette sous-requete lit club_membre, donc elle
-- passe elle-meme par le RLS, donc un gerant n'y voit que ses propres lignes et
-- tout club lui semble libre. Un gerant pouvait ainsi s'inviter sur le club d'un
-- autre. C'est creer_mon_club() qui pose le rattachement, hors RLS.

drop policy if exists membre_admin on club_membre;
create policy membre_admin on club_membre
  for all to authenticated using (est_admin()) with check (est_admin());

-- --- equipe ---
-- Lisible par soi seulement, et jamais modifiable depuis le site.
drop policy if exists equipe_lecture on equipe;
create policy equipe_lecture on equipe
  for select to authenticated using (membre_id = auth.uid());

-- --- demande ---
-- Un pratiquant depose une demande sans compte, sur un club publie ET abonne Pro.
-- La reservation en ligne est ce que le club achete : la cacher dans la page ne
-- suffit pas, sinon une requete a la main donnerait le lead gratuitement. Le
-- sous-select lit une ligne que tout le monde voit deja (club publie), donc il
-- protege vraiment -- contrairement au piege decrit plus haut sur club_membre.
drop policy if exists demande_depot on demande;
create policy demande_depot on demande
  for insert to anon, authenticated
  with check (
    statut = 'recue'
    and exists (select 1 from club c
                 where c.id = club_id and c.statut = 'publie' and c.offre = 'pro')
  );

-- Personne ne relit les demandes sauf le club concerne et l'equipe : ce sont des
-- coordonnees personnelles.
drop policy if exists demande_lecture on demande;
create policy demande_lecture on demande
  for select to authenticated using (gere_le_club(club_id) or est_admin());

drop policy if exists demande_suivi on demande;
create policy demande_suivi on demande
  for update to authenticated
  using (gere_le_club(club_id) or est_admin())
  with check (gere_le_club(club_id) or est_admin());
