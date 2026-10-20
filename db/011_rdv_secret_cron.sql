-- Mon Club Combat : le secret des rappels, tire dans la base (20/10/2026).
--
-- A coller apres 010_rendez_vous.sql. Rejouable.
--
-- Le secret que pg_cron presente a la fonction `rdv` (en-tete x-cron-secret)
-- est tire au hasard ici et range dans le coffre (Vault) : personne ne le voit
-- ni ne le recopie. pg_cron le lit dans le coffre pour l'envoyer ; la fonction
-- le lit par rdv_secret_cron(), ouverte a la seule cle service, pour le
-- verifier. Il sert aussi de sel au hash des adresses IP, faute de RDV_SEL_IP.

create extension if not exists "pgcrypto";

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'rdv_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rdv_cron_secret',
      'Secret des rappels de la prise de rendez-vous (pg_cron vers la fonction rdv)');
  end if;
end $$;

create or replace function rdv_secret_cron() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select decrypted_secret from vault.decrypted_secrets where name = 'rdv_cron_secret' limit 1 $$;

revoke all on function rdv_secret_cron() from public, anon, authenticated;
grant execute on function rdv_secret_cron() to service_role;

-- le secret est en place : la tache des rappels peut naitre
select rdv_planifie_rappels();
