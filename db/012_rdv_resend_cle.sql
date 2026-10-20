-- Mon Club Combat : la cle Resend des rendez-vous, lue dans le coffre (20/10/2026).
--
-- A coller apres 011_rdv_secret_cron.sql. Rejouable.
--
-- La cle d'envoi Resend est rangee dans le coffre (Vault) sous le nom
-- rdv_resend_cle. La fonction `rdv` la lit par rdv_resend_cle(), ouverte a la
-- seule cle service, quand le secret RESEND_API_KEY n'est pas pose.

create or replace function rdv_resend_cle() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select decrypted_secret from vault.decrypted_secrets where name = 'rdv_resend_cle' limit 1 $$;

revoke all on function rdv_resend_cle() from public, anon, authenticated;
grant execute on function rdv_resend_cle() to service_role;
