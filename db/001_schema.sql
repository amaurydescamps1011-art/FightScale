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
  -- Le planning des cours, que le club saisit sur sa fiche :
  --   [{ "id":"k3f9", "jour":1, "de":"18:30", "a":"20:00",
  --      "quoi":"MMA", "niveau":"Tous niveaux" }, ... ]
  -- `jour` va de 0 (lundi) a 6. L'`id` est tire au sort par le formulaire et ne
  -- change plus : c'est lui qu'une demande de seance d'essai designe, pour que
  -- la reservation tombe sur un vrai cours et le reste quand le club reordonne
  -- son planning (Amaury, 23/09/2026).
  cours         jsonb  not null default '[]'::jsonb,
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
alter table club add column if not exists cours jsonb not null default '[]'::jsonb;
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

-- --------------------------------------------------------- le profil du compte
-- Amaury, 23/09/2026 : « meme le mec gratuit qui a cree un compte, il y ait un
-- minimum de data, au moins qu'il ait un profil de compte et qu'il soit
-- enregistre quelque part ». `auth.users` appartient a Supabase et ne garde
-- qu'une adresse et un mot de passe ; ce que la personne ecrit sur elle-meme
-- tient ici. Une ligne par compte, qui existe des l'inscription, meme sans
-- club et meme en gratuit.
create table if not exists profil (
  membre_id  uuid primary key references auth.users (id) on delete cascade,
  cree_le    timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  -- le nom de la personne, pas celui de la salle : c'est elle qui se connecte
  nom        text,
  tel        text,
  -- « gerant », « coach », « proprietaire »... : libre, c'est elle qui se decrit
  fonction   text
);

-- ------------------------------------------------------ l'equipe Mon Club Combat
-- Etre dans cette table, c'est etre admin. On n'y entre qu'a la main depuis
-- Supabase : aucune politique ne permet de s'y ajouter soi-meme.
create table if not exists equipe (
  membre_id uuid primary key references auth.users (id) on delete cascade,
  cree_le   timestamptz not null default now()
);

-- Le profil nait avec le compte : un compte cree et jamais revenu a quand meme
-- sa ligne. `auth.users` appartient a Supabase, donc ce trigger est le seul
-- endroit ou on s'y accroche -- et seulement en lecture de ce que l'inscription
-- a mis dans les metadonnees (le nom saisi dans la fenetre, ou celui que Google
-- renvoie). Si le projet refuse un trigger sur ce schema, on n'echoue pas : les
-- pages creent la ligne au premier passage (upsert), et le schema reste
-- rejouable.
create or replace function profil_du_nouveau_compte() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare meta jsonb;
begin
  -- `to_jsonb(new)->` et pas `new.raw_user_meta_data` : la colonne appartient a
  -- Supabase et peut manquer ailleurs (un Postgres de test, une version
  -- future). Ainsi la fonction ne casse pas l'inscription pour autant.
  meta := coalesce(to_jsonb(new) -> 'raw_user_meta_data', '{}'::jsonb);
  insert into profil (membre_id, nom)
  values (new.id, nullif(trim(coalesce(meta->>'full_name', meta->>'name', '')), ''))
  on conflict (membre_id) do nothing;
  return new;
end
$$;

do $$ begin
  drop trigger if exists profil_a_l_inscription on auth.users;
  create trigger profil_a_l_inscription after insert on auth.users
    for each row execute function profil_du_nouveau_compte();
exception when insufficient_privilege or undefined_table then null; end $$;

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
  -- L'`id` du cours choisi dans le planning du club. `creneau` en garde le
  -- libelle lisible ; cette colonne-ci est ce que la base verifie.
  cours_id  text,

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
alter table demande add column if not exists cours_id text;
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

drop trigger if exists profil_modifie_le on profil;
create trigger profil_modifie_le before update on profil
  for each row execute function touche_modifie_le();

-- ---------------------------------------- prevenir le club d'une demande
-- Sans ce mail, un gerant ne savait qu'une demande l'attendait qu'en ouvrant son
-- espace, et un pratiquant qu'on ne rappelle pas dans la journee va ailleurs.
--
-- Il n'y a pas de serveur a nous : c'est la base qui ecrit a Resend, par pg_net
-- (des requetes HTTP depuis Postgres, fournies par Supabase). La cle Resend vit
-- dans le coffre de Supabase (Vault), jamais dans ce fichier ni dans une page :
--   select vault.create_secret('re_...', 'resend_cle');
-- Tant qu'elle n'y est pas, rien ne part et la demande s'enregistre quand meme.
-- pg_net envoie apres coup, hors de la transaction : un Resend en panne ne fait
-- jamais echouer le formulaire du pratiquant.
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then null; end $$;

-- le texte d'un pratiquant entre dans du HTML : on l'echappe, sinon un nom
-- comme « <a href=...> » deviendrait un lien dans la boite du gerant
create or replace function html_sur(t text) returns text
  language sql immutable as
$$ select replace(replace(replace(replace(coalesce(t, ''),
     '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') $$;

-- Qui prevenir pour un club : les gerants, par l'adresse de leur compte ; a
-- defaut, l'adresse de la fiche.
create or replace function destinataires_du_club(cible uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as
$$
declare dest jsonb; fiche text;
begin
  select jsonb_agg(distinct u.email) into dest
    from club_membre m join auth.users u on u.id = m.membre_id
   where m.club_id = cible and coalesce(u.email, '') <> '';
  if dest is null then
    select mail into fiche from club where id = cible;
    if coalesce(fiche, '') <> '' then dest := jsonb_build_array(fiche); end if;
  end if;
  return dest;
end
$$;

-- L'habit commun des e-mails : la marque, un titre, une phrase, le contenu,
-- et le bouton vers l'espace club.
create or replace function cadre_mail(titre text, chapo text, contenu text, pied text)
  returns text language sql immutable as
$$ select
       '<div style="font-family:Arial,Helvetica,sans-serif;background:#F7F6F3;padding:24px 12px">'
    || '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E5DF;border-radius:12px;padding:28px 24px;color:#16160F">'
    || '<p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#EC162E">Mon Club Combat</p>'
    || '<h1 style="margin:0 0 8px;font-size:22px;line-height:1.25">' || titre || '</h1>'
    || '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3A3A41">' || chapo || '</p>'
    || contenu
    || '<p style="margin:24px 0 0"><a href="https://monclubcombat.fr/espace-club.html" style="display:inline-block;background:#DC1229;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Ouvrir mon espace club</a></p>'
    || coalesce('<p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6F6B66">' || pied || '</p>', '')
    || '</div></div>' $$;

-- L'envoi lui-meme. Rend vrai si la requete est partie. Ne leve jamais : un
-- e-mail rate ne doit rien empecher d'autre.
create or replace function envoie_mail(dest jsonb, sujet text, html text, texte text,
                                       repondre text default null)
  returns boolean language plpgsql security definer set search_path = public, pg_temp as
$$
declare cle text;
begin
  if dest is null or jsonb_array_length(dest) = 0 then return false; end if;
  begin
    select decrypted_secret into cle from vault.decrypted_secrets
      where name = 'resend_cle' limit 1;
  exception when others then return false;     -- pas de coffre : pas d'envoi
  end;
  if cle is null or cle = '' then return false; end if;
  begin
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || cle,
                                    'Content-Type', 'application/json'),
      body    := jsonb_strip_nulls(jsonb_build_object(
        'from',     'Mon Club Combat <contact@monclubcombat.fr>',
        'to',       dest,
        'reply_to', repondre,
        'subject',  sujet,
        'html',     html,
        'text',     texte)));
  exception when others then return false;     -- pg_net absent ou refus
  end;
  return true;
end
$$;

create or replace function ligne_mail(etiquette text, valeur text) returns text
  language sql immutable as
$$ select case when coalesce(valeur, '') = '' then '' else
     '<tr><td style="padding:6px 16px 6px 0;color:#6F6B66;vertical-align:top">' || etiquette
     || '</td><td style="padding:6px 0">' || valeur || '</td></tr>' end $$;

create or replace function previent_le_club() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  salle text;
  tel   text := nullif(regexp_replace(coalesce(new.tel, ''), '[^0-9+]', '', 'g'), '');
begin
  select nom into salle from club where id = new.club_id;
  perform envoie_mail(
    destinataires_du_club(new.club_id),
    'Demande de séance d''essai : ' || new.nom,
    cadre_mail(
      'Nouvelle demande de séance d''essai',
      html_sur(new.nom) || ' aimerait essayer ' || html_sur(salle)
        || '. Un rappel dans la journée fait souvent la différence.',
      '<table style="border-collapse:collapse;font-size:15px;line-height:1.5">'
        || ligne_mail('Nom', '<b>' || html_sur(new.nom) || '</b>')
        || ligne_mail('E-mail', '<a href="mailto:' || html_sur(new.mail) || '" style="color:#BB0F22">' || html_sur(new.mail) || '</a>')
        || ligne_mail('Téléphone', case when tel is not null then '<a href="tel:' || html_sur(tel) || '" style="color:#BB0F22">' || html_sur(new.tel) || '</a>' end)
        || ligne_mail('Discipline', html_sur(new.discipline))
        || ligne_mail('Quand', html_sur(new.creneau))
        || '</table>'
        || case when coalesce(new.message, '') <> '' then
           '<p style="margin:18px 0 0;padding:12px 14px;background:#F7F6F3;border-radius:8px;font-size:15px;line-height:1.6;white-space:pre-wrap">' || html_sur(new.message) || '</p>' else '' end,
      'Répondez directement à cet e-mail pour écrire à ' || html_sur(new.nom) || '.'),
    'Nouvelle demande de séance d''essai pour ' || coalesce(salle, 'votre salle') || E'\n\n'
      || 'Nom : ' || new.nom || E'\n'
      || 'E-mail : ' || new.mail || E'\n'
      || coalesce('Téléphone : ' || nullif(new.tel, '') || E'\n', '')
      || coalesce('Discipline : ' || nullif(new.discipline, '') || E'\n', '')
      || coalesce('Quand : ' || nullif(new.creneau, '') || E'\n', '')
      || coalesce(E'\n' || nullif(new.message, '') || E'\n', '')
      || E'\nOuvrir mon espace club : https://monclubcombat.fr/espace-club.html\n'
      || 'Répondez à cet e-mail pour écrire à ' || new.nom || '.',
    -- le gerant repond, et c'est le pratiquant qui recoit : pas d'intermediaire
    new.mail);
  return new;
end
$$;

-- personne ne les appelle a la main : elles lisent le coffre et les comptes.
-- Supabase donne par defaut l'execution de toute fonction a anon et
-- authenticated, d'ou le revoke nomme.
revoke all on function destinataires_du_club(uuid) from public, anon, authenticated;
revoke all on function envoie_mail(jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function previent_le_club() from public, anon, authenticated;

drop trigger if exists demande_previent on demande;
create trigger demande_previent after insert on demande
  for each row execute function previent_le_club();

-- ------------------------------------ les clubs qui veulent l'acquisition
-- La page acquisition.html : un club laisse ses coordonnees pour etre rappele.
-- N'importe qui peut en deposer une, personne d'autre que l'equipe ne les lit,
-- et l'equipe est prevenue par e-mail sur contact@monclubcombat.fr.
create table if not exists contact_acquisition (
  id        uuid primary key default gen_random_uuid(),
  cree_le   timestamptz not null default now(),
  club      text not null check (length(club) between 1 and 200),
  ville     text not null check (length(ville) between 1 and 120),
  nom       text not null check (length(nom) between 1 and 160),
  mail      text not null check (mail like '%_@_%' and length(mail) <= 254),
  tel       text check (length(tel) <= 40),
  pack      text check (pack in ('start', 'grow', 'boost', 'scale', 'pro', 'custom')),
  message   text check (length(message) <= 4000),
  traite_le timestamptz
);
alter table contact_acquisition enable row level security;

drop policy if exists acq_depot on contact_acquisition;
create policy acq_depot on contact_acquisition
  for insert to anon, authenticated
  with check (traite_le is null);
drop policy if exists acq_equipe on contact_acquisition;
create policy acq_equipe on contact_acquisition
  for select to authenticated using (est_admin());
drop policy if exists acq_traite on contact_acquisition;
create policy acq_traite on contact_acquisition
  for update to authenticated using (est_admin()) with check (est_admin());

create or replace function previent_l_equipe() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  perform envoie_mail(
    jsonb_build_array('contact@monclubcombat.fr'),
    'Acquisition : ' || new.club || ', ' || new.ville,
    cadre_mail(
      'Un club veut l''acquisition',
      html_sur(new.nom) || ', de ' || html_sur(new.club) || ' à ' || html_sur(new.ville)
        || ', demande à être rappelé.',
      '<table style="border-collapse:collapse;font-size:15px;line-height:1.5">'
        || ligne_mail('Club', '<b>' || html_sur(new.club) || '</b>')
        || ligne_mail('Ville', html_sur(new.ville))
        || ligne_mail('Contact', html_sur(new.nom))
        || ligne_mail('E-mail', '<a href="mailto:' || html_sur(new.mail) || '" style="color:#BB0F22">' || html_sur(new.mail) || '</a>')
        || ligne_mail('Téléphone', html_sur(new.tel))
        || ligne_mail('Offre', html_sur(initcap(new.pack)))
        || '</table>'
        || case when coalesce(new.message, '') <> '' then
           '<p style="margin:18px 0 0;padding:12px 14px;background:#F7F6F3;border-radius:8px;font-size:15px;line-height:1.6;white-space:pre-wrap">' || html_sur(new.message) || '</p>' else '' end,
      'Répondez à cet e-mail pour lui écrire.'),
    'Un club veut l''acquisition' || E'\n\n'
      || 'Club : ' || new.club || E'\n' || 'Ville : ' || new.ville || E'\n'
      || 'Contact : ' || new.nom || E'\n' || 'E-mail : ' || new.mail || E'\n'
      || coalesce('Téléphone : ' || nullif(new.tel, '') || E'\n', '')
      || coalesce('Offre : ' || new.pack || E'\n', '')
      || coalesce(E'\n' || nullif(new.message, '') || E'\n', ''),
    new.mail);
  return new;
end
$$;
revoke all on function previent_l_equipe() from public, anon, authenticated;
drop trigger if exists acquisition_previent on contact_acquisition;
create trigger acquisition_previent after insert on contact_acquisition
  for each row execute function previent_l_equipe();

-- Un envoi quotidien aux clubs (« prospects a rappeler aujourd'hui ») a existe
-- quelques minutes le 24/09/2026. Amaury n'en veut pas : des e-mails pour rien.
-- Les relances qu'il veut vont au pratiquant, avant sa seance. On retire la
-- tache et la fonction pour qui aurait deja colle cette version.
do $$ begin
  perform cron.unschedule('relances-du-jour');
exception when others then null; end $$;
drop function if exists relances_du_jour();

-- --------------------------------------------- les vues d'une fiche de club
-- Amaury, 23/09/2026 : « dans l'espace club, il n'y a rien, donc faut le build.
-- Faut mettre le max de data. » Le premier chiffre qu'un gerant veut voir, c'est
-- combien de gens ont regarde sa salle -- et c'est aussi celui qui vend le Pro :
-- tant de personnes ont vu la fiche, aucune n'a pu appeler.
--
-- Un compteur par club et par jour, pas une ligne par visite : on n'a besoin ni
-- de qui a regarde ni de quand exactement, et ne pas le stocker est plus simple
-- que de le proteger. Rien la-dedans ne designe une personne.
create table if not exists vue_fiche (
  club_id uuid not null references club (id) on delete cascade,
  jour    date not null default current_date,
  n       integer not null default 0,
  primary key (club_id, jour)
);

-- Le comptage passe par une fonction, jamais par un insert direct : sans elle il
-- faudrait une politique d'ecriture ouverte a tous sur la table, donc n'importe
-- qui pourrait ecrire n'importe quel chiffre sur n'importe quel club. Ici le
-- visiteur ne peut qu'ajouter un a un club publie, et ne relit rien.
-- La page, de son cote, ne compte qu'une fois par navigateur et par jour : ca ne
-- resiste pas a quelqu'un de determine, et ce n'est pas le but -- le but est un
-- chiffre honnete pour le gerant, pas une mesure d'audience opposable.
create or replace function compte_vue(cible uuid) returns void
  language plpgsql security definer set search_path = public as
$$
begin
  if not exists (select 1 from club where id = cible and statut = 'publie') then
    return;
  end if;
  insert into vue_fiche (club_id, jour, n) values (cible, current_date, 1)
  on conflict (club_id, jour) do update set n = vue_fiche.n + 1;
end
$$;

revoke all on function compte_vue(uuid) from public;
grant execute on function compte_vue(uuid) to anon, authenticated;

-- ------------------------------------------------- vouloir passer au Pro
-- Stripe n'est pas branche (il faut une societe et un IBAN). En attendant, un
-- gerant qui veut le Pro le dit d'un bouton, et c'est le back-office qui ouvre
-- l'abonnement a la main. Le jour ou le paiement existe, ce bouton devient le
-- passage en caisse et cette table garde son sens : elle dit qui a demande et
-- quand, ce qu'un paiement ne dit pas quand il echoue.
--
-- Une ligne par club, pas une par clic : le gerant qui appuie trois fois ne
-- fait pas trois demandes. `repondu_le` est pose par l'equipe quand elle a
-- traite -- on ne supprime pas la ligne, pour garder la trace.
create table if not exists interet_pro (
  club_id    uuid primary key references club (id) on delete cascade,
  membre_id  uuid references auth.users (id) on delete set null,
  cree_le    timestamptz not null default now(),
  repondu_le timestamptz
);

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
alter table profil      enable row level security;
alter table vue_fiche   enable row level security;
alter table demande     enable row level security;
alter table abonnement  enable row level security;
alter table interet_pro enable row level security;

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

-- --- profil ---
-- Chacun ne voit et n'ecrit que le sien. Le `membre_id = auth.uid()` en
-- `with check` est ce qui empeche d'ecrire la ligne de quelqu'un d'autre : sans
-- lui, la politique de lecture ne protegerait rien a l'ecriture.
drop policy if exists profil_lecture on profil;
create policy profil_lecture on profil
  for select to authenticated using (membre_id = auth.uid());

drop policy if exists profil_creation on profil;
create policy profil_creation on profil
  for insert to authenticated with check (membre_id = auth.uid());

drop policy if exists profil_edition on profil;
create policy profil_edition on profil
  for update to authenticated
  using (membre_id = auth.uid()) with check (membre_id = auth.uid());

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

-- Amaury, 23/09/2026 : une seance d'essai doit tomber sur un horaire de cours.
-- Ce serait facile a tenir dans le formulaire, et ne tiendrait rien : la page
-- parle a la base avec une cle publique. La regle est donc ici. Un club qui n'a
-- pas encore saisi son planning accepte le texte libre d'avant ; des qu'il en a
-- un, seul un de ses cours passe.
create or replace function club_a_ce_cours(cible uuid, choisi text) returns boolean
  language sql stable security definer set search_path = public, auth as
$$ select case
     when choisi is null or choisi = '' then not exists (
       select 1 from club
        where id = cible and jsonb_array_length(coalesce(cours, '[]'::jsonb)) > 0)
     else exists (
       select 1 from club c, jsonb_array_elements(c.cours) e
        where c.id = cible and e->>'id' = choisi)
   end $$;

drop policy if exists demande_depot on demande;
create policy demande_depot on demande
  for insert to anon, authenticated
  with check (statut = 'recue'
              and club_ouvert_aux_essais(club_id)
              and club_a_ce_cours(club_id, cours_id));

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

-- --- vue_fiche ---
-- Les chiffres d'un club ne regardent que lui. Aucune politique d'ecriture : on
-- ecrit par `compte_vue()`, qui passe au-dessus du RLS et n'accepte qu'un club
-- publie.
drop policy if exists vue_lecture on vue_fiche;
create policy vue_lecture on vue_fiche
  for select to authenticated using (gere_le_club(club_id) or est_admin());

-- --- interet_pro ---
-- Un gerant dit qu'il veut le Pro, pour son club et sous son nom : `membre_id`
-- est force a `auth.uid()` par le `with check`, sinon il pourrait signer la
-- demande d'un autre. Il relit la sienne (la page affiche « c'est note ») et
-- peut la retirer. Il ne pose pas `repondu_le` : c'est le mot de l'equipe, et
-- l'`update` ne lui est pas ouvert.
drop policy if exists interet_lecture on interet_pro;
create policy interet_lecture on interet_pro
  for select to authenticated using (gere_le_club(club_id) or est_admin());

drop policy if exists interet_creation on interet_pro;
create policy interet_creation on interet_pro
  for insert to authenticated
  with check (gere_le_club(club_id) and membre_id = auth.uid());

drop policy if exists interet_retrait on interet_pro;
create policy interet_retrait on interet_pro
  for delete to authenticated using (gere_le_club(club_id) or est_admin());

drop policy if exists interet_reponse on interet_pro;
create policy interet_reponse on interet_pro
  for update to authenticated using (est_admin()) with check (est_admin());

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
    c.disciplines, c.horaires, c.cours, c.photos, c.offre,
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
