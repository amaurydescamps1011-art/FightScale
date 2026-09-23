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

-- `create table if not exists` ne touche pas a une table deja creee : les
-- colonnes arrivees apres le premier collage s'ajoutent ici, sinon le fichier
-- ne serait rejouable qu'en apparence.
alter table club add column if not exists offre text not null default 'gratuit';
do $$ begin
  alter table club add constraint club_offre_connue
    check (offre in ('gratuit', 'pro'));
exception when duplicate_object then null; end $$;

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

-- Les deux etapes que le cahier des charges ajoute au suivi : « contacte »,
-- entre la demande et la reservation, et « adherent », qui est la seule fin
-- heureuse. Elles arrivent apres coup, d'ou l'alter plutot que l'enum ci-dessus
-- -- et `if not exists` pour que le fichier reste rejouable.
-- Postgres refuse d'utiliser une valeur d'enum dans la transaction qui la cree :
-- aucune de ces deux-la n'est employee plus bas, et il ne faut pas en ajouter.
do $$ begin
  alter type statut_demande add value if not exists 'contactee' after 'recue';
  alter type statut_demande add value if not exists 'adherent'  after 'honoree';
exception when others then null; end $$;

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
  -- Du texte, pas une date. Le formulaire demande « quand vous arrange » et le
  -- pratiquant ecrit « mardi soir » ou « samedi matin » : c'est ce qu'un club
  -- veut lire. La colonne etait un timestamptz, et tout depot aurait echoue sur
  -- la vraie base -- le faux serveur des tests, lui, l'acceptait.
  creneau   text,

  -- Ce que le club ajoute ensuite, et que le pratiquant ne voit jamais. C'est
  -- le minimum d'un suivi de prospect : d'ou il vient, ce qu'on s'est dit, et
  -- quand rappeler. Le reste du CRM du cahier des charges (campagnes, tags,
  -- fusion de doublons, historique des changements) attend.
  origine   text not null default 'annuaire'
            check (origine in ('annuaire', 'acquisition', 'autre')),
  notes     text,
  -- la date de la prochaine action, pas une heure : un gerant rappelle « jeudi »
  relance   date
);

-- rejouable : ces colonnes sont arrivees apres la premiere version du fichier
do $$ begin
  alter table demande alter column creneau type text using creneau::text;
exception when others then null; end $$;
alter table demande add column if not exists origine text not null default 'annuaire';
alter table demande add column if not exists notes   text;
alter table demande add column if not exists relance date;
alter table demande add column if not exists modifie_le timestamptz not null default now();

create index if not exists demande_club_idx on demande (club_id, cree_le desc);

-- ------------------------------------------------------------ modifie_le
create or replace function touche_modifie_le() returns trigger
  language plpgsql as
$$ begin new.modifie_le = now(); return new; end $$;

drop trigger if exists club_modifie_le on club;
create trigger club_modifie_le before update on club
  for each row execute function touche_modifie_le();

drop trigger if exists demande_modifie_le on demande;
create trigger demande_modifie_le before update on demande
  for each row execute function touche_modifie_le();

-- ----------------------------------------------------- l'abonnement Stripe
-- Une table a part, et pas des colonnes sur `club` : l'annuaire lit `club` en
-- `select *` avec la cle publique, donc tout ce qui vit sur cette table est
-- public. L'identifiant Stripe d'un club n'a rien a faire dans une page. Le
-- public ne voit que `club.offre` ; le detail reste ici, ou seuls le gerant
-- concerne, l'equipe et le webhook entrent.
create table if not exists abonnement (
  club_id           uuid primary key references club (id) on delete cascade,
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now(),

  -- les identifiants que Stripe nous rend ; le client sert a rouvrir le
  -- portail ou le gerant change sa carte et resilie
  stripe_client     text unique,
  stripe_abonnement text unique,

  -- le mot de Stripe, recopie tel quel : trialing, active, past_due, canceled...
  -- On ne le traduit pas, pour qu'un doute se tranche dans le tableau de bord
  -- Stripe sans table de correspondance.
  statut            text,
  -- la fin de la periode payee. Un club qui resilie reste Pro jusque-la : c'est
  -- Stripe qui nous previendra le jour ou elle tombe, on ne coupe rien nous-memes.
  fin_periode       timestamptz,
  -- vrai des que le gerant a demande l'arret ; l'abonnement court encore
  arret_demande     boolean not null default false
);

drop trigger if exists abonnement_modifie_le on abonnement;
create trigger abonnement_modifie_le before update on abonnement
  for each row execute function touche_modifie_le();

-- =====================================================================
-- RLS. Rien n'est lisible ni modifiable par defaut : chaque acces est une
-- politique nommee ci-dessous.
-- =====================================================================
alter table club        enable row level security;
alter table club_membre enable row level security;
alter table equipe      enable row level security;
alter table demande     enable row level security;
alter table abonnement  enable row level security;

-- --- club ---
-- Il n'y a plus de lecture publique de la table. Elle rendait `select *`, donc
-- le telephone et l'e-mail de tous les clubs, gratuits compris, a qui refaisait
-- la requete depuis la console. Le public lit maintenant la vue `annuaire`
-- (plus bas), qui masque les coordonnees d'un club non abonne.
-- Cette politique existait depuis le premier jour : on la retire.
drop policy if exists club_lecture_publique on club;

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
-- Ce test passait par un `exists` sur `club`, qui tenait tant que le visiteur
-- voyait les clubs publies. Depuis que la table n'est plus lisible publiquement,
-- cette sous-requete ne verrait plus rien et refuserait tout. La garde est donc
-- une fonction `security definer`, qui repond hors RLS -- et qui, au passage,
-- ne depend plus de ce que l'appelant a le droit de voir.
create or replace function club_ouvert_aux_essais(cible uuid) returns boolean
  language sql stable security definer set search_path = public, auth as
$$ select exists (
     select 1 from club
      where id = cible and statut = 'publie' and offre = 'pro'
   ) $$;

drop policy if exists demande_depot on demande;
create policy demande_depot on demande
  for insert to anon, authenticated
  with check (statut = 'recue' and club_ouvert_aux_essais(club_id));

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

-- --- abonnement ---
-- Un gerant lit le sien, pour savoir jusqu'a quand il est Pro et rouvrir son
-- portail Stripe. Personne n'ecrit ici depuis le site : ni insert, ni update,
-- ni pour l'equipe. Seul le webhook ecrit, avec la cle `service_role`, qui
-- passe a cote du RLS -- et cette cle ne quitte jamais le serveur de la
-- fonction. Un gerant qui s'inventerait une ligne se donnerait le Pro.
drop policy if exists abonnement_lecture on abonnement;
create policy abonnement_lecture on abonnement
  for select to authenticated
  using (gere_le_club(club_id) or est_admin());

-- =====================================================================
-- L'annuaire public
-- =====================================================================
-- Amaury, 23/09/2026 : « sur le mode gratuit, il n'y a pas moyen de contacter
-- la salle ni de reserver de seances ». Les coordonnees sont le paywall : c'est
-- ce qui fait passer un club au Pro.
--
-- Les cacher dans la page ne suffirait pas. Le site lit la base directement
-- avec une cle publique : n'importe qui ouvre la console et refait la requete.
-- Il faut donc que la base elle-meme ne les rende pas. Une politique RLS ne
-- sait pas proteger une colonne, et un `revoke select (tel)` serait absolu
-- alors que la regle depend de la ligne (l'offre du club). C'est donc une vue.
--
-- Elle n'est pas en `security_invoker` : elle s'execute avec les droits de son
-- proprietaire et contourne le RLS de `club`, d'ou le `where statut = 'publie'`
-- ecrit ici -- c'est lui, desormais, qui tient la limite de l'annuaire.
-- `contact_nom` n'y figure pas du tout : le nom de la personne a joindre n'est
-- public a aucun palier.
drop view if exists annuaire;
create view annuaire as
  select
    c.id, c.cree_le, c.modifie_le, c.statut, c.publie_le,
    c.nom, c.slug, c.presentation,
    c.adresse, c.code_postal, c.ville, c.lat, c.lon,
    c.disciplines, c.horaires, c.photos, c.offre,
    -- le paywall, en six colonnes
    case when c.offre = 'pro' then c.tel       end as tel,
    case when c.offre = 'pro' then c.mail      end as mail,
    case when c.offre = 'pro' then c.site      end as site,
    case when c.offre = 'pro' then c.instagram end as instagram,
    case when c.offre = 'pro' then c.facebook  end as facebook
  from club c
  where c.statut = 'publie';

-- La vue est en lecture seule pour tout le monde : personne n'ecrit par la.
revoke all on annuaire from anon, authenticated;
grant select on annuaire to anon, authenticated;
