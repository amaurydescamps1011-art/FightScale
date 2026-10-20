/* La fonction `rdv` : la prise de rendez-vous de monclubcombat.fr.

   Ce fichier ne contient que le branchement : Deno.serve, les secrets lus
   dans Deno.env, le client Supabase (cle service, qui passe a cote du RLS et
   ne quitte jamais cette fonction), et les appels `fetch` vers Resend et
   Google. Toute la logique est dans logique.ts, qui ne connait aucun de ces
   services et que Node eprouve (outils/tests/rdv.test.mjs).

   Secrets, deploiement, cron : voir LISEZ-MOI.md a cote. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  traite, ErreurDoublon, corpsResend, corpsEvenementGoogle, lienMeetDe, occupesDe,
  type Base, type Courriel, type Courrier, type Deps, type Env, type EvenementAgenda,
  type Google, type NouveauRdv, type Rdv,
} from './logique.ts';

const lit = (nom: string): string | undefined => Deno.env.get(nom)?.trim() || undefined;
const exige = (nom: string): string => {
  const v = lit(nom);
  if (!v) throw new Error('variable d\'environnement absente : ' + nom);
  return v;
};

const env: Env = {
  SITE_URL: lit('SITE_URL'),
  RDV_NOTIFIE: lit('RDV_NOTIFIE'),
  RDV_CRON_SECRET: lit('RDV_CRON_SECRET'),
  RDV_SEL_IP: lit('RDV_SEL_IP'),
};
// ------------------------------------------------------------ la base

const sb = createClient(exige('SUPABASE_URL'), exige('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* Le secret du cron vit dans le coffre (Vault) de la base, ou il est tire au
   hasard par db/011_rdv_secret_cron.sql : pg_cron l'y lit pour l'envoyer, la
   fonction l'y lit ici pour le verifier, et personne n'a a le recopier. La
   fonction SQL rdv_secret_cron() n'est ouverte qu'a la cle service. Un secret
   RDV_CRON_SECRET pose a la main dans le tableau de bord reste prioritaire. */
if (!env.RDV_CRON_SECRET) {
  try {
    const r = await sb.rpc('rdv_secret_cron');
    if (!r.error && typeof r.data === 'string' && r.data.trim()) env.RDV_CRON_SECRET = r.data.trim();
  } catch (_e) { /* le journal ci-dessous le dit */ }
}

/* Sans sel, logique.ts ne hache pas les adresses (un SHA-256 d'IPv4 nue se
   casse par force brute) et la limite de 10 reservations par adresse est
   inactive. On ne refuse pas de demarrer, la prise de rendez-vous vaut mieux
   que ca, mais on le dit des le premier appel, dans le journal. */
if (!env.RDV_SEL_IP && !env.RDV_CRON_SECRET) {
  console.error(JSON.stringify({ niveau: 'alerte', message: 'RDV_SEL_IP et secret du cron absents : adresses non hachees, limite par adresse inactive, rappels impossibles' }));
}
const table = () => sb.from('rendez_vous');

/* On ne remonte jamais le message de PostgREST : il peut citer la ligne, donc
   un e-mail. Le code suffit a comprendre, et 23505 est le doublon. */
function verifie<T>(r: { data: T; error: { code?: string; message?: string } | null }): T {
  if (r.error) {
    if (r.error.code === '23505') throw new ErreurDoublon();
    throw new Error('base ' + (r.error.code || 'erreur'));
  }
  return r.data;
}

const base: Base = {
  async confirmesEntre(de, a) {
    const d = verifie(await table().select('debut, fin').eq('statut', 'confirme')
      .gte('debut', de.toISOString()).lt('debut', a.toISOString()));
    return (d || []) as Array<Pick<Rdv, 'debut' | 'fin'>>;
  },
  async creer(rdv: NouveauRdv) {
    return verifie(await table().insert(rdv).select().single()) as Rdv;
  },
  async parToken(token) {
    return (verifie(await table().select().eq('token_annulation', token).maybeSingle()) || null) as Rdv | null;
  },
  async marqueAnnule(id, quand) {
    return (verifie(await table().update({ statut: 'annule', annule_le: quand.toISOString() })
      .eq('id', id).eq('statut', 'confirme').select().maybeSingle()) || null) as Rdv | null;
  },
  async aRappeler(de, a) {
    const d = verifie(await table().select().eq('statut', 'confirme').is('rappel_envoye_le', null)
      .gt('debut', de.toISOString()).lte('debut', a.toISOString()));
    return (d || []) as Rdv[];
  },
  async marqueRappel(id, quand) {
    const d = verifie(await table().update({ rappel_envoye_le: quand.toISOString() })
      .eq('id', id).is('rappel_envoye_le', null).select('id'));
    return !!(d && (d as unknown[]).length);
  },
  async libereRappel(id) {
    verifie(await table().update({ rappel_envoye_le: null }).eq('id', id));
  },
  async compteRecents(email, ipHash, depuis) {
    const d = depuis.toISOString();
    /* `eq` et pas `ilike` : logique.ts range l'e-mail en minuscules, et un
       `_` dans l'adresse serait un joker pour LIKE */
    const parEmail = await table().select('id', { count: 'exact', head: true }).gte('cree_le', d).eq('email', email.toLowerCase());
    verifie(parEmail);
    let parIp = 0;
    if (ipHash) {
      const r = await table().select('id', { count: 'exact', head: true }).gte('cree_le', d).eq('ip_hash', ipHash);
      verifie(r);
      parIp = r.count || 0;
    }
    return { parEmail: parEmail.count || 0, parIp };
  },
  async majGoogle(id, champs) {
    verifie(await table().update(champs).eq('id', id));
  },
};

// ------------------------------------------------------------ Resend

const mail: Courrier = {
  async envoie(c: Courriel) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + exige('RESEND_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsResend(c)),
    });
    if (!r.ok) throw new Error('resend ' + r.status);
  },
};

// ------------------------------------------------------------ Google Agenda

/* Facultatif : sans les quatre secrets, `google` vaut null et tout marche au
   telephone. Le jeton d'acces est garde en memoire le temps de sa validite. */
let jeton: { valeur: string; expire: number } | null = null;

async function jetonGoogle(): Promise<string> {
  if (jeton && jeton.expire > Date.now() + 60e3) return jeton.valeur;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: exige('GOOGLE_CLIENT_ID'),
      client_secret: exige('GOOGLE_CLIENT_SECRET'),
      refresh_token: exige('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('google jeton ' + r.status);
  jeton = { valeur: d.access_token, expire: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return jeton.valeur;
}

async function agenda(chemin: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch('https://www.googleapis.com/calendar/v3/' + chemin, {
    ...init,
    headers: { 'Authorization': 'Bearer ' + await jetonGoogle(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 204) return null;
  const t = await r.text();
  if (!r.ok) {
    /* un evenement deja supprime n'est pas une erreur */
    if (init.method === 'DELETE' && (r.status === 404 || r.status === 410)) return null;
    throw new Error('google ' + r.status);
  }
  return t ? JSON.parse(t) : null;
}

function googleSiConfigure(): Google | null {
  if (!lit('GOOGLE_CLIENT_ID') || !lit('GOOGLE_CLIENT_SECRET') || !lit('GOOGLE_REFRESH_TOKEN')) return null;
  const calendrier = lit('GOOGLE_CALENDAR_ID') || 'primary';
  const cal = encodeURIComponent(calendrier);
  return {
    async occupes(de, a) {
      const r = await agenda('freeBusy', {
        method: 'POST',
        body: JSON.stringify({ timeMin: de.toISOString(), timeMax: a.toISOString(), timeZone: 'UTC', items: [{ id: calendrier }] }),
      });
      return occupesDe(r);
    },
    async creeEvenement(e: EvenementAgenda) {
      /* sendUpdates=none : ce sont nos e-mails qui invitent, pas ceux de Google */
      const r = await agenda(`calendars/${cal}/events?conferenceDataVersion=1&sendUpdates=none`, {
        method: 'POST',
        body: JSON.stringify(corpsEvenementGoogle(e, crypto.randomUUID())),
      }) as { id?: string } | null;
      if (!r?.id) throw new Error('google evenement sans id');
      return { id: r.id, lien_meet: e.meet ? lienMeetDe(r) : null };
    },
    async supprimeEvenement(id) {
      await agenda(`calendars/${cal}/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: 'DELETE' });
    },
  };
}

// ------------------------------------------------------------ l'appel

const deps: Deps = {
  base, mail, google: googleSiConfigure(),
  /* le journal de la fonction : des identifiants et des codes, jamais une
     coordonnee (logique.ts n'en passe aucune) */
  journal: (niveau, message, detail) => {
    const ligne = JSON.stringify({ niveau, message, ...(detail || {}) });
    if (niveau === 'erreur') console.error(ligne); else console.log(ligne);
  },
};

Deno.serve((req) => traite(req, env, deps));
