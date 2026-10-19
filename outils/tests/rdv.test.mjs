/* Les tests de la prise de rendez-vous, sur `logique.ts` avec des services en
   memoire. Lancer :  node --test outils/tests/rdv.test.mjs
   (Node 22 lit le TypeScript directement, sans build.) */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../supabase/functions/rdv/logique.ts';
import { baseMemoire, courrierMemoire, googleSimule, journalMemoire } from './rdv_memoire.mjs';

const API = 'http://localhost:8768/functions/v1/rdv';
const ORIGINE = 'https://monclubcombat.fr';

/* lundi 12 janvier 2026, 9:00 a Paris (heure d'hiver, UTC+1) */
const HIVER = new Date('2026-01-12T08:00:00Z');
/* lundi 6 juillet 2026, 8:00 a Paris (heure d'ete, UTC+2) */
const ETE = new Date('2026-07-06T06:00:00Z');

const ENV = { RDV_CRON_SECRET: 'secret-de-test', SITE_URL: 'https://monclubcombat.fr' };

function monde({ maintenant = HIVER, google = null, env = ENV, courrier } = {}) {
  const base = baseMemoire();
  const mail = courrier || courrierMemoire();
  const journal = journalMemoire();
  const deps = { base, mail, google, maintenant: () => maintenant, journal };
  const appelle = (chemin, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('origin')) headers.set('origin', ORIGINE);
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return L.traite(new Request(API + chemin, { ...init, headers }), env, deps);
  };
  return { base, mail, journal, deps, appelle, env };
}

const demande = (sur = {}) => ({
  debut: '2026-01-13T08:30:00.000Z', // mardi 13 janvier, 9:30 Paris
  prenom: 'Karim', nom: 'Benali', email: 'karim@salle-test.fr', telephone: '06 12 34 56 78',
  format: 'telephone', club: 'Team Ouragan', ville: 'Lyon', discipline: 'mma',
  situation: 'Ouverte, des cours à remplir', objectif: 'Remplir mes cours',
  projet: 'Lancer un cours enfants', source: { utm_source: 'meta', utm_campaign: 'oct', utm_content: 'v1' },
  ...sur,
});

const post = (chemin, corps, headers = {}) => ({ chemin, init: { method: 'POST', body: JSON.stringify(corps), headers } });

async function reserve(m, sur = {}, headers = {}) {
  const r = await m.appelle('/reserver', { method: 'POST', body: JSON.stringify(demande(sur)), headers });
  return { r, j: await r.json() };
}

// ------------------------------------------------------------ les creneaux

describe('creneaux', () => {
  test('un jour d\'hiver : 9:30 Paris = 08:30Z, dernier creneau 18:00 Paris = 17:00Z', () => {
    const c = L.creneauxTheoriques(HIVER).map((d) => d.toISOString());
    const mardi = c.filter((x) => x.startsWith('2026-01-13'));
    assert.equal(mardi[0], '2026-01-13T08:30:00.000Z');
    assert.equal(mardi.at(-1), '2026-01-13T17:00:00.000Z');
    /* 12:30 (11:30Z) et 18:30 (17:30Z) finiraient hors plage : absents */
    assert.ok(mardi.includes('2026-01-13T11:00:00.000Z'));
    assert.ok(!mardi.includes('2026-01-13T11:30:00.000Z'));
    assert.ok(!mardi.includes('2026-01-13T17:30:00.000Z'));
    /* 6 le matin (9:30 a 12:00), 9 l'apres-midi (14:00 a 18:00) */
    assert.equal(mardi.length, 15);
    /* la pause de midi : rien entre 12:00 et 14:00 Paris */
    assert.ok(!mardi.some((x) => x > '2026-01-13T11:00:00.000Z' && x < '2026-01-13T13:00:00.000Z'));
  });

  test('un jour d\'ete : 9:30 Paris = 07:30Z, dernier creneau 16:00Z', () => {
    const c = L.creneauxTheoriques(ETE).map((d) => d.toISOString());
    const mardi = c.filter((x) => x.startsWith('2026-07-07'));
    assert.equal(mardi[0], '2026-07-07T07:30:00.000Z');
    assert.equal(mardi.at(-1), '2026-07-07T16:00:00.000Z');
    assert.equal(mardi.length, 15);
  });

  test('le passage a l\'heure d\'ete (29 mars 2026) decale les creneaux d\'une heure', () => {
    /* vendredi 27 mars, 5:00 a Paris */
    const c = L.creneauxTheoriques(new Date('2026-03-27T04:00:00Z')).map((d) => d.toISOString());
    assert.ok(c.includes('2026-03-27T08:30:00.000Z'), 'vendredi 27 : encore l\'hiver, 9:30 = 08:30Z');
    assert.ok(!c.includes('2026-03-27T07:30:00.000Z'));
    assert.ok(c.includes('2026-03-30T07:30:00.000Z'), 'lundi 30 : l\'ete, 9:30 = 07:30Z');
    assert.ok(c.includes('2026-03-30T16:00:00.000Z'), 'lundi 30 : 18:00 = 16:00Z');
    assert.ok(!c.includes('2026-03-30T17:00:00.000Z'));
    assert.equal(L.decalageParis(new Date('2026-03-29T00:30:00Z')), 60);
    assert.equal(L.decalageParis(new Date('2026-03-29T01:30:00Z')), 120);
    assert.equal(L.decalageParis(new Date('2026-10-25T00:30:00Z')), 120);
    assert.equal(L.decalageParis(new Date('2026-10-25T01:30:00Z')), 60);
  });

  test('le passage a l\'heure d\'hiver (25 octobre 2026) : vendredi 23 en heure d\'ete, lundi 26 en heure d\'hiver, 15 creneaux chaque jour', () => {
    /* jeudi 22 octobre 2026, 7:00 a Paris (heure d'ete, UTC+2) */
    const c = L.creneauxTheoriques(new Date('2026-10-22T05:00:00Z')).map((d) => d.toISOString());
    const vendredi = c.filter((x) => x.startsWith('2026-10-23'));
    const lundi = c.filter((x) => x.startsWith('2026-10-26'));
    assert.equal(vendredi[0], '2026-10-23T07:30:00.000Z', 'vendredi 23 : 9:30 = 07:30Z');
    assert.equal(vendredi.at(-1), '2026-10-23T16:00:00.000Z', 'vendredi 23 : 18:00 = 16:00Z');
    assert.equal(vendredi.length, 15);
    assert.equal(lundi[0], '2026-10-26T08:30:00.000Z', 'lundi 26 : 9:30 = 08:30Z');
    assert.equal(lundi.at(-1), '2026-10-26T17:00:00.000Z', 'lundi 26 : 18:00 = 17:00Z');
    assert.equal(lundi.length, 15);
    assert.ok(!c.some((x) => x.startsWith('2026-10-24') || x.startsWith('2026-10-25')), 'le week-end du changement d\'heure est vide');
    /* en heure de Paris, chaque creneau tombe bien sur xx:00 ou xx:30 entre 9:30 et 18:00 */
    for (const x of c) {
      const p = L.partiesParis(new Date(x));
      assert.ok(p.minute === 0 || p.minute === 30, x);
      assert.ok(p.heure * 60 + p.minute >= 9 * 60 + 30 && p.heure * 60 + p.minute <= 18 * 60, x);
      assert.ok(!(p.heure === 12 && p.minute === 30) && p.heure !== 13, 'pause de midi : ' + x);
    }
  });

  test('le week-end est exclu et l\'horizon est de 14 jours', () => {
    const c = L.creneauxTheoriques(HIVER);
    for (const d of c) {
      const p = L.partiesParis(d);
      assert.ok(p.jourSemaine >= 1 && p.jourSemaine <= 5, 'un creneau tombe un ' + p.jourSemaine);
      assert.ok(d.getTime() <= HIVER.getTime() + 14 * 86400e3);
    }
    const jours = new Set(c.map((d) => d.toISOString().slice(0, 10)));
    assert.equal(jours.size, 10, 'dix jours ouvres sur deux semaines');
    assert.ok(!jours.has('2026-01-17') && !jours.has('2026-01-18'));
  });

  test('rien a moins de 3 h', () => {
    /* mardi 13 janvier, 9:00 Paris : les creneaux avant 12:00 Paris sautent */
    const c = L.creneauxTheoriques(new Date('2026-01-13T08:00:00Z')).map((d) => d.toISOString());
    assert.equal(c[0], '2026-01-13T11:00:00.000Z');
    assert.ok(!c.includes('2026-01-13T10:30:00.000Z'));
    /* a 8:59 Paris, 12:00 Paris est a 3 h 01 : il passe */
    const c2 = L.creneauxTheoriques(new Date('2026-01-13T07:59:00Z')).map((d) => d.toISOString());
    assert.equal(c2[0], '2026-01-13T11:00:00.000Z');
  });

  test('GET /disponibilites : tries, duree 15, fuseau Paris, meet selon Google', async () => {
    const m = monde();
    const r = await m.appelle('/disponibilites');
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.duree_min, 15);
    assert.equal(j.meet, false);
    assert.equal(j.fuseau, 'Europe/Paris');
    assert.ok(j.creneaux.length > 100);
    assert.deepEqual(j.creneaux, [...j.creneaux].sort());
    assert.match(j.creneaux[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);

    const m2 = monde({ google: googleSimule() });
    const j2 = await (await m2.appelle('/disponibilites')).json();
    assert.equal(j2.meet, true);
  });

  test('un creneau reserve (confirme) disparait ; un annule revient', async () => {
    const m = monde();
    const { r } = await reserve(m);
    assert.equal(r.status, 201);
    let j = await (await m.appelle('/disponibilites')).json();
    assert.ok(!j.creneaux.includes('2026-01-13T08:30:00.000Z'));
    assert.ok(j.creneaux.includes('2026-01-13T09:00:00.000Z'));

    const token = m.base.lignes[0].token_annulation;
    await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token }) });
    j = await (await m.appelle('/disponibilites')).json();
    assert.ok(j.creneaux.includes('2026-01-13T08:30:00.000Z'));
  });

  test('les plages occupees de Google Agenda sont retirees ; un freeBusy en panne ne vide pas la liste', async () => {
    const g = googleSimule({ occupes: [{ debut: new Date('2026-01-13T09:00:00Z'), fin: new Date('2026-01-13T10:10:00Z') }] });
    const m = monde({ google: g });
    let j = await (await m.appelle('/disponibilites')).json();
    assert.ok(j.creneaux.includes('2026-01-13T08:30:00.000Z'));
    assert.ok(!j.creneaux.includes('2026-01-13T09:00:00.000Z'));
    assert.ok(!j.creneaux.includes('2026-01-13T09:30:00.000Z'));
    assert.ok(!j.creneaux.includes('2026-01-13T10:00:00.000Z'), '10:00 a 10:15 chevauche 10:10');
    assert.ok(j.creneaux.includes('2026-01-13T10:30:00.000Z'));

    g.panneOccupes = true;
    const r = await m.appelle('/disponibilites');
    assert.equal(r.status, 200);
    j = await r.json();
    assert.ok(j.creneaux.includes('2026-01-13T09:00:00.000Z'));
    assert.ok(m.journal.entrees.some((e) => e.niveau === 'alerte'));
  });
});

// ------------------------------------------------------------ reserver

describe('POST /reserver', () => {
  test('201 : la ligne est en base, deux e-mails partent, le .ics est joint', async () => {
    const m = monde();
    const { r, j } = await reserve(m);
    assert.equal(r.status, 201);
    assert.match(j.id, /^[0-9a-f-]{36}$/);
    assert.equal(j.debut, '2026-01-13T08:30:00.000Z');
    assert.equal(j.fin, '2026-01-13T08:45:00.000Z');
    assert.equal(j.lien_meet, null);

    assert.equal(m.base.lignes.length, 1);
    const l = m.base.lignes[0];
    assert.equal(l.statut, 'confirme');
    assert.equal(l.format, 'telephone');
    assert.equal(l.email, 'karim@salle-test.fr');
    assert.deepEqual(l.source, { utm_source: 'meta', utm_campaign: 'oct', utm_content: 'v1' });
    assert.equal(l.ip_hash, null, 'pas d\'adresse transmise : pas de hash');

    assert.equal(m.mail.envoyes.length, 2);
    const [conf, resa] = m.mail.envoyes;
    assert.equal(conf.genre, 'confirmation');
    assert.deepEqual(conf.a, ['karim@salle-test.fr']);
    assert.equal(conf.sujet, 'RDV confirmé · mardi 13 janvier à 09:30');
    assert.match(conf.html, /Nous vous appelons au 06 12 34 56 78\./);
    assert.match(conf.html, /annuler\?token=/);
    assert.match(conf.texte, /Annuler le rendez-vous : https:\/\/monclubcombat\.fr\/annuler\?token=/);
    assert.equal(conf.pieces.length, 1);
    assert.equal(conf.pieces[0].nom, 'rendez-vous.ics');

    assert.equal(resa.genre, 'nouvelle_resa');
    assert.deepEqual(resa.a, ['contact@monclubcombat.fr']);
    assert.equal(resa.repondre, 'karim@salle-test.fr');
    assert.equal(resa.sujet, '📅 Nouvelle résa · Karim Benali · mardi 13 janvier à 09:30');
    assert.match(resa.texte, /Club : Team Ouragan/);
    assert.match(resa.texte, /Source : meta \/ oct \/ v1/);
    assert.ok(!resa.html.includes('Lien Meet non créé'));
  });

  test('400 : champ manquant, nomme ; e-mail invalide ; telephone exige au format telephone', async () => {
    const m = monde();
    let { r, j } = await reserve(m, { prenom: '' });
    assert.equal(r.status, 400);
    assert.deepEqual(j, { erreur: 'champ_manquant', champ: 'prenom' });

    ({ r, j } = await reserve(m, { club: undefined }));
    assert.deepEqual(j, { erreur: 'champ_manquant', champ: 'club' });

    ({ r, j } = await reserve(m, { email: 'pas-un-mail' }));
    assert.equal(r.status, 400);
    assert.deepEqual(j, { erreur: 'email_invalide' });

    ({ r, j } = await reserve(m, { telephone: '' }));
    assert.deepEqual(j, { erreur: 'champ_manquant', champ: 'telephone' });

    ({ r, j } = await reserve(m, { debut: 'hier' }));
    assert.deepEqual(j, { erreur: 'champ_manquant', champ: 'debut' });

    ({ r, j } = await reserve(m, { format: 'fax' }));
    assert.deepEqual(j, { erreur: 'format_invalide' });

    /* sans Google, le format meet n'existe pas */
    ({ r, j } = await reserve(m, { format: 'meet' }));
    assert.deepEqual(j, { erreur: 'format_indisponible' });

    const r2 = await m.appelle('/reserver', { method: 'POST', body: 'pas du json', headers: { 'content-type': 'text/plain' } });
    assert.equal(r2.status, 400);
    assert.equal(m.base.lignes.length, 0);
    assert.equal(m.mail.envoyes.length, 0);
  });

  test('le champ piege : 201 et rien ne se passe', async () => {
    const m = monde();
    const { r, j } = await reserve(m, { site_web: 'http://spam.example' });
    assert.equal(r.status, 201);
    assert.ok(j.id && j.debut && j.fin);
    assert.equal(j.lien_meet, null);
    assert.equal(m.base.lignes.length, 0);
    assert.equal(m.mail.envoyes.length, 0);
  });

  test('409 : creneau hors liste (week-end, trop tot), ou deja pris (contrainte d\'unicite)', async () => {
    const m = monde();
    let { r, j } = await reserve(m, { debut: '2026-01-17T09:00:00.000Z' }); // samedi
    assert.equal(r.status, 409);
    assert.deepEqual(j, { erreur: 'creneau_pris' });

    ({ r } = await reserve(m, { debut: '2026-01-12T09:00:00.000Z' })); // dans 1 h
    assert.equal(r.status, 409);

    ({ r } = await reserve(m, { debut: '2026-01-13T08:45:00.000Z' })); // pas sur la demi-heure
    assert.equal(r.status, 409);

    ({ r } = await reserve(m));
    assert.equal(r.status, 201);
    ({ r, j } = await reserve(m, { email: 'autre@salle.fr' }));
    assert.equal(r.status, 409);
    assert.deepEqual(j, { erreur: 'creneau_pris' });
    assert.equal(m.base.lignes.length, 1);
    assert.equal(m.mail.envoyes.length, 2, 'le refus n\'envoie rien');

    /* le doublon qui passe la liste (deux requetes au meme instant) : la base
       leve ErreurDoublon, la logique repond 409 */
    const m2 = monde();
    const creer = m2.base.creer;
    let n = 0;
    m2.base.creer = async (x) => { n++; if (n === 1) throw new L.ErreurDoublon(); return creer.call(m2.base, x); };
    ({ r, j } = await reserve(m2));
    assert.equal(r.status, 409);
    assert.deepEqual(j, { erreur: 'creneau_pris' });
  });

  test('429 : 3 par e-mail, 10 par adresse (hachee avec le secret) sur 24 h', async () => {
    const m = monde();
    const heures = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
    const debut = (i) => `2026-01-13T${heures[i]}:00.000Z`;
    for (let i = 0; i < 3; i++) {
      const { r } = await reserve(m, { debut: debut(i) });
      assert.equal(r.status, 201, 'reservation ' + (i + 1));
    }
    let { r, j } = await reserve(m, { debut: debut(3) });
    assert.equal(r.status, 429);
    assert.deepEqual(j, { erreur: 'trop_de_demandes' });
    /* la casse de l'e-mail ne contourne rien */
    ({ r } = await reserve(m, { debut: debut(3), email: 'KARIM@Salle-Test.fr' }));
    assert.equal(r.status, 429);

    /* la meme adresse IP, dix e-mails differents. La passerelle AJOUTE
       l'adresse vue a la fin de x-forwarded-for : c'est la derniere entree
       qui compte, pas ce que le client a mis devant. */
    const m2 = monde();
    const ip = { 'x-forwarded-for': '10.0.0.1, 203.0.113.9' };
    for (let i = 0; i < 10; i++) {
      const { r } = await reserve(m2, { debut: debut(i), email: `g${i}@salle.fr` }, ip);
      assert.equal(r.status, 201, 'ip ' + (i + 1));
    }
    ({ r, j } = await reserve(m2, { debut: debut(10), email: 'g10@salle.fr' }, ip));
    assert.equal(r.status, 429);
    /* une autre adresse passe */
    ({ r } = await reserve(m2, { debut: debut(10), email: 'g11@salle.fr' }, { 'x-forwarded-for': '198.51.100.2' }));
    assert.equal(r.status, 201);

    /* le hash : 64 hex, depend du sel, jamais l'adresse en clair */
    const h = m2.base.lignes[0].ip_hash;
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(h, await L.hacheIp('203.0.113.9', ENV));
    assert.notEqual(h, await L.hacheIp('203.0.113.9', { RDV_CRON_SECRET: 'autre' }));
    assert.ok(!JSON.stringify(m2.base.lignes).includes('203.0.113.9'));

    /* 24 h plus tard, le compteur est vide */
    const demain = new Date(HIVER.getTime() + 25 * 3600e3);
    m.deps.maintenant = () => demain;
    ({ r } = await reserve(m, { debut: '2026-01-14T08:30:00.000Z' }));
    assert.equal(r.status, 201);
  });

  test('un x-forwarded-for forge ne contourne pas la limite par adresse', async () => {
    const heures = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
    const debut = (i) => `2026-01-13T${heures[i]}:00.000Z`;
    const req = new Request(API + '/reserver', { headers: { 'x-forwarded-for': 'forge, 203.0.113.9' } });
    assert.equal(L.ipDe(req), '203.0.113.9', 'la DERNIERE entree, celle que la passerelle a ajoutee');
    assert.equal(L.ipDe(new Request(API, { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': 'forge, 198.51.100.7' } })), '203.0.113.9', 'cf-connecting-ip gagne');
    assert.equal(L.ipDe(new Request(API, { headers: { 'x-real-ip': '203.0.113.9' } })), '203.0.113.9');
    assert.equal(L.ipDe(new Request(API)), null);

    /* douze reservations depuis la meme adresse reelle, chacune avec un XFF
       forge different en tete (et douze e-mails jetables) : la 11e est refusee */
    const m = monde();
    let refus = 0;
    for (let i = 0; i < 12; i++) {
      const { r } = await reserve(m, { debut: debut(i), email: `jetable${i}@spam.example` },
        { 'x-forwarded-for': `10.${i}.${i}.${i}, 203.0.113.9` });
      if (i < 10) assert.equal(r.status, 201, 'reservation ' + (i + 1));
      else { assert.equal(r.status, 429, 'reservation ' + (i + 1)); refus++; }
    }
    assert.equal(refus, 2);
    assert.equal(m.base.lignes.length, 10);
    /* la meme chose derriere Cloudflare : cf-connecting-ip tranche */
    const m2 = monde();
    for (let i = 0; i < 11; i++) {
      const { r } = await reserve(m2, { debut: debut(i), email: `j${i}@spam.example` },
        { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': `10.${i}.0.1` });
      assert.equal(r.status, i < 10 ? 201 : 429, 'cf ' + (i + 1));
    }
  });

  test('sans sel (ni RDV_SEL_IP ni RDV_CRON_SECRET) : l\'adresse n\'est pas hachee, ip_hash reste nul, le journal le dit', async () => {
    assert.equal(await L.hacheIp('203.0.113.9', {}), null);
    assert.equal(await L.hacheIp('203.0.113.9', { RDV_SEL_IP: '  ' }), null);
    assert.match(await L.hacheIp('203.0.113.9', { RDV_SEL_IP: 'sel' }), /^[0-9a-f]{64}$/);
    assert.notEqual(await L.hacheIp('203.0.113.9', { RDV_SEL_IP: 'sel' }), await L.hacheIp('203.0.113.9', { RDV_CRON_SECRET: 'sel2' }));
    const m = monde({ env: { SITE_URL: 'https://monclubcombat.fr' } });
    const { r } = await reserve(m, {}, { 'x-forwarded-for': '203.0.113.9' });
    assert.equal(r.status, 201);
    assert.equal(m.base.lignes[0].ip_hash, null);
    assert.ok(m.journal.entrees.some((e) => e.niveau === 'alerte' && /sel/i.test(e.message)));
    assert.ok(!JSON.stringify(m.journal.entrees).includes('203.0.113.9'));
  });

  test('400 : les adresses e-mail que Resend, Google ou le .ics refuseraient sont refusees ici', async () => {
    const m = monde();
    for (const email of ['a;b@x.fr', 'a,b@x.fr', '"a"@x.fr', 'a<b>@x.fr', 'a(b)@x.fr', 'a@x.f', 'a@x', 'a b@x.fr', 'a@-x.fr', 'a@x..fr', 'a@x.fr\nbcc: y@z.fr', 'a\\b@x.fr', 'a:b@x.fr', 'a[b]@x.fr']) {
      const { r, j } = await reserve(m, { email });
      assert.equal(r.status, 400, email);
      assert.deepEqual(j, { erreur: 'email_invalide' }, email);
    }
    assert.equal(m.base.lignes.length, 0);
    /* les adresses ordinaires passent, y compris avec + . - _ et une apostrophe */
    const ok = ['karim.benali+resa@salle-test.fr', "o'brien@exemple.co.uk", 'K_B@SALLE.FR', 'a@xn--bcher-kva.example'];
    const heures = ['08:30', '09:00', '09:30', '10:00'];
    for (const [i, email] of ok.entries()) {
      const { r } = await reserve(m, { email, debut: `2026-01-13T${heures[i]}:00.000Z` });
      assert.equal(r.status, 201, email);
    }
    assert.equal(m.base.lignes[2].email, 'k_b@salle.fr');
  });

  test('un saut de ligne dans un champ ne fabrique ni sujet casse ni fausse ligne dans le mail d\'Amaury', async () => {
    const m = monde();
    const { r } = await reserve(m, {
      prenom: 'Karim\nE-mail : faux@evil.example', nom: 'Ben\tali\r\n\u0000x', club: 'Team\rOuragan',
      projet: 'ok\nTéléphone : 01 00 00 00 00\r\nE-mail : pirate@evil.example\n\n\n\nfin',
    });
    assert.equal(r.status, 201);
    const l = m.base.lignes[0];
    assert.equal(l.prenom, 'Karim E-mail : faux@evil.example');
    assert.equal(l.nom, 'Ben ali x');
    assert.equal(l.club, 'Team Ouragan');
    assert.equal(l.projet, 'ok\nTéléphone : 01 00 00 00 00\nE-mail : pirate@evil.example\n\nfin', 'projet garde ses lignes, sans \\r ni rafale de lignes vides');
    const [conf, resa] = m.mail.envoyes;
    for (const c of [conf, resa]) assert.ok(!/[\r\n]/.test(c.sujet), 'saut de ligne dans le sujet : ' + JSON.stringify(c.sujet));
    assert.equal(resa.sujet, '📅 Nouvelle résa · Karim E-mail : faux@evil.example Ben ali x · mardi 13 janvier à 09:30');
    /* le tableau HTML : une seule ligne « E-mail », la vraie, et une seule « Téléphone » */
    const cellules = [...resa.html.matchAll(/<td[^>]*white-space:nowrap">([^<]*)<\/td><td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => [x[1], x[2]]);
    assert.equal(cellules.filter(([k]) => k === 'E-mail').length, 1);
    assert.equal(cellules.find(([k]) => k === 'E-mail')[1], 'karim@salle-test.fr');
    assert.equal(cellules.filter(([k]) => k === 'Téléphone').length, 1);
    assert.equal(cellules.find(([k]) => k === 'Téléphone')[1], '06 12 34 56 78');
    assert.equal(cellules.find(([k]) => k === 'Précisions')[1], 'ok<br>Téléphone : 01 00 00 00 00<br>E-mail : pirate@evil.example<br><br>fin');
    assert.equal(cellules.length, 12, 'les douze lignes du plan de textes, pas une de plus');
    /* la version texte : les lignes du projet sont en retrait, elles ne commencent pas la ligne */
    assert.match(resa.texte, /\nPrécisions : ok\n    Téléphone : 01 00 00 00 00\n    E-mail : pirate@evil\.example\n    \n    fin\n/);
    assert.equal((resa.texte.match(/^E-mail : /gm) || []).length, 1);
    assert.equal((resa.texte.match(/^Téléphone : /gm) || []).length, 1);
    /* l'annulation aussi */
    await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: l.token_annulation }) });
    const ama = m.mail.envoyes.at(-1);
    assert.equal(ama.genre, 'annulation_amaury');
    assert.ok(!/[\r\n]/.test(ama.sujet));
    assert.equal((ama.texte.match(/^E-mail : /gm) || []).length, 1);
    /* et l'agenda : la description met les lignes du projet en retrait */
    assert.match(L.descriptionAgenda(l), /\nPrécisions : ok\n    Téléphone : 01 00 00 00 00\n/);
  });

  test('Google en panne apres l\'evenement (ecriture en base refusee) : le lien Meet reste coherent partout', async () => {
    const g = googleSimule();
    const m = monde({ google: g });
    m.base.majGoogle = async () => { throw new Error('base 57P01'); };
    const { r, j } = await reserve(m, { format: 'meet', telephone: undefined });
    assert.equal(r.status, 201);
    assert.equal(g.crees.length, 1);
    assert.equal(j.lien_meet, g.crees[0].lien_meet, 'l\'evenement existe, son lien marche : on le donne');
    const [conf, resa] = m.mail.envoyes;
    assert.match(conf.html, /Rejoindre l’appel/);
    assert.ok(resa.texte.includes('Lien visio : ' + j.lien_meet));
    assert.ok(!resa.html.includes('Lien Meet non créé'), 'pas de « non cree » quand le lien est bien la');
    assert.ok(m.journal.entrees.some((e) => e.niveau === 'erreur' && e.message === 'google maj en base en echec' && e.detail.evenement === g.crees[0].id));
    assert.equal(m.base.lignes[0].evenement_google, null);
  });

  test('avec Google : evenement cree, lien Meet rendu et en base, invite = prospect', async () => {
    const g = googleSimule();
    const m = monde({ google: g });
    const { r, j } = await reserve(m, { format: 'meet', telephone: undefined });
    assert.equal(r.status, 201);
    assert.match(j.lien_meet, /^https:\/\/meet\.google\.com\//);
    assert.equal(g.crees.length, 1);
    assert.equal(g.crees[0].invite, 'karim@salle-test.fr');
    assert.equal(g.crees[0].meet, true);
    assert.equal(g.crees[0].resume, 'Appel Mon Club Combat');
    const l = m.base.lignes[0];
    assert.equal(l.lien_meet, j.lien_meet);
    assert.equal(l.evenement_google, g.crees[0].id);
    assert.equal(l.telephone, null);

    const [conf, resa] = m.mail.envoyes;
    assert.match(conf.html, new RegExp('href="' + j.lien_meet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.match(conf.html, /Rejoindre l’appel/);
    assert.match(conf.pieces[0].contenu, new RegExp('LOCATION:' + j.lien_meet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(resa.texte, /Format : Google Meet/);
    assert.match(resa.texte, /Lien visio : https:\/\/meet\.google\.com\//);

    /* au telephone, l'agenda est bloque sans visio */
    const { j: j2 } = await reserve(m, { debut: '2026-01-13T09:00:00.000Z', email: 'b@salle.fr' });
    assert.equal(j2.lien_meet, null);
    assert.equal(g.crees[1].meet, false);
  });

  test('Google en panne : la reservation est prise, lien null, Amaury prevenu', async () => {
    const g = googleSimule({ panneCreation: true });
    const m = monde({ google: g });
    const { r, j } = await reserve(m, { format: 'meet', telephone: undefined });
    assert.equal(r.status, 201);
    assert.equal(j.lien_meet, null);
    assert.equal(m.base.lignes[0].statut, 'confirme');
    assert.equal(m.base.lignes[0].format, 'meet');
    const [conf, resa] = m.mail.envoyes;
    assert.match(conf.html, /Nous vous envoyons le lien de visio avant l’appel\./);
    assert.match(resa.html, /Lien Meet non créé/);
    assert.match(resa.texte, /Lien Meet non créé/);
    assert.ok(m.journal.entrees.some((e) => e.niveau === 'erreur' && e.message.includes('google')));
  });

  test('Resend en panne : la reservation est prise quand meme', async () => {
    const m = monde({ courrier: courrierMemoire({ panne: true }) });
    const { r } = await reserve(m);
    assert.equal(r.status, 201);
    assert.equal(m.base.lignes.length, 1);
    assert.equal(m.journal.entrees.filter((e) => e.message.includes('e-mail')).length, 2);
  });
});

// ------------------------------------------------------------ le .ics

describe('iCalendar', () => {
  test('conforme : VCALENDAR, METHOD:REQUEST, UID = id, dates UTC, CRLF, lignes de 75 octets', async () => {
    const m = monde();
    const { j } = await reserve(m, { nom: 'Benali-Dupont de la Villardière', projet: 'x' });
    const ics = m.mail.envoyes[0].pieces[0].contenu;
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(ics), 'toutes les fins de ligne sont CRLF');
    const lignes = ics.split('\r\n');
    for (const l of lignes) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, 'ligne trop longue : ' + l);
    const deplie = ics.replace(/\r\n[ \t]/g, '');
    assert.match(deplie, /\r\nVERSION:2\.0\r\n/);
    assert.match(deplie, /\r\nMETHOD:REQUEST\r\n/);
    assert.match(deplie, /\r\nPRODID:/);
    assert.match(deplie, new RegExp('\r\nUID:' + j.id + '\r\n'));
    assert.match(deplie, /\r\nDTSTAMP:20260112T080000Z\r\n/);
    assert.match(deplie, /\r\nDTSTART:20260113T083000Z\r\n/);
    assert.match(deplie, /\r\nDTEND:20260113T084500Z\r\n/);
    assert.match(deplie, /\r\nSUMMARY:Appel Mon Club Combat\r\n/);
    assert.match(deplie, /\r\nLOCATION:Téléphone\r\n/);
    assert.match(deplie, /\r\nDESCRIPTION:Appel de 15 min avec Mon Club Combat : votre salle\\, votre planning\\, votre secteur\. Un imprévu \? Annulez ici : https:\/\/monclubcombat\.fr\/annuler\?token=[0-9a-f-]{36}\r\n/);
    assert.match(deplie, /\r\nORGANIZER;CN="Mon Club Combat":mailto:rdv@monclubcombat\.fr\r\n/);
    assert.match(deplie, /\r\nATTENDEE;CN="Karim Benali-Dupont de la Villardière";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:karim@salle-test\.fr\r\n/);
    assert.match(deplie, /\r\nBEGIN:VEVENT\r\n[\s\S]*\r\nEND:VEVENT\r\n/);
    assert.equal((deplie.match(/BEGIN:VEVENT/g) || []).length, 1);
  });

  test('un nom avec , ; " ou : donne un parametre CN entre guillemets, sans ces caracteres', async () => {
    const m = monde();
    await reserve(m, { prenom: 'Jean "JJ"', nom: 'Dupont, de la Tour; fils: Jr' });
    const ics = m.mail.envoyes[0].pieces[0].contenu.replace(/\r\n[ \t]/g, '');
    const attendee = ics.split('\r\n').find((l) => l.startsWith('ATTENDEE'));
    assert.equal(attendee, 'ATTENDEE;CN="Jean JJ Dupont de la Tour fils Jr";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:karim@salle-test.fr');
    /* la valeur du parametre : un seul couple de guillemets, puis les autres parametres */
    const cn = attendee.match(/;CN=("[^"]*")(;|:)/);
    assert.ok(cn, 'CN entre guillemets');
    assert.ok(!/[;:,\\]/.test(cn[1].slice(1, -1)));
  });

  test('pliage : une longue ligne se replie sans perdre de caractere', () => {
    const longue = 'DESCRIPTION:' + 'é'.repeat(120) + ' fin';
    const pliee = L.plieIcs(longue);
    for (const l of pliee.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75);
    assert.equal(pliee.replace(/\r\n /g, ''), longue);
    assert.equal(L.plieIcs('UID:court'), 'UID:court');
  });
});

// ------------------------------------------------------------ rappels

describe('POST /rappels', () => {
  test('refuse sans le bon secret', async () => {
    const m = monde();
    let r = await m.appelle('/rappels', { method: 'POST' });
    assert.equal(r.status, 401);
    r = await m.appelle('/rappels', { method: 'POST', headers: { 'x-cron-secret': 'faux' } });
    assert.equal(r.status, 401);
    const sans = monde({ env: { SITE_URL: 'https://monclubcombat.fr' } });
    r = await sans.appelle('/rappels', { method: 'POST', headers: { 'x-cron-secret': '' } });
    assert.equal(r.status, 401, 'sans secret configure, personne ne passe');
  });

  test('un rappel par rendez-vous a moins d\'une heure, une seule fois', async () => {
    const m = monde();
    /* trois rendez-vous le mardi 13 : 9:30, 10:30, et un annule a 10:00 (Paris) */
    for (const [debut, email] of [['2026-01-13T08:30:00.000Z', 'a@salle.fr'], ['2026-01-13T09:30:00.000Z', 'b@salle.fr'], ['2026-01-13T09:00:00.000Z', 'c@salle.fr']]) {
      const { r } = await reserve(m, { debut, email });
      assert.equal(r.status, 201, email);
    }
    await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: m.base.lignes[2].token_annulation }) });
    const avant = m.mail.envoyes.length;

    /* mardi 13 janvier, 9:00 Paris = 08:00Z : a est a 30 min, c (annule) a 60 min, b a 90 min */
    m.deps.maintenant = () => new Date('2026-01-13T08:00:00Z');
    const cron = { method: 'POST', headers: { 'x-cron-secret': 'secret-de-test' } };
    let r = await m.appelle('/rappels', cron);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { envoyes: 1 });
    const rappel = m.mail.envoyes[avant];
    assert.equal(rappel.genre, 'rappel');
    assert.deepEqual(rappel.a, ['a@salle.fr']);
    assert.equal(rappel.sujet, '⏰ Rappel : votre appel Mon Club Combat dans 1 h (mardi 13 janvier à 09:30)');
    assert.match(rappel.html, /Nous vous appelons au 06 12 34 56 78\./);
    assert.ok(m.base.lignes[0].rappel_envoye_le);
    assert.equal(m.base.lignes[1].rappel_envoye_le, null);
    assert.equal(m.base.lignes[2].rappel_envoye_le, null, 'un rendez-vous annule n\'a pas de rappel');

    /* le cron repasse cinq minutes plus tard : rien de neuf */
    m.deps.maintenant = () => new Date('2026-01-13T08:05:00Z');
    r = await m.appelle('/rappels', cron);
    assert.deepEqual(await r.json(), { envoyes: 0 });
    assert.equal(m.mail.envoyes.length, avant + 1);

    /* a 8:45Z (9:45 Paris) : le premier est passe, le second est a 45 min */
    m.deps.maintenant = () => new Date('2026-01-13T08:45:00Z');
    r = await m.appelle('/rappels', cron);
    assert.deepEqual(await r.json(), { envoyes: 1 });
    assert.deepEqual(m.mail.envoyes.at(-1).a, ['b@salle.fr']);

    /* un rendez-vous deja commence n'a plus de rappel */
    const m2 = monde();
    await reserve(m2, { debut: '2026-01-13T08:30:00.000Z' });
    m2.deps.maintenant = () => new Date('2026-01-13T08:31:00Z');
    r = await m2.appelle('/rappels', cron);
    assert.deepEqual(await r.json(), { envoyes: 0 });
    assert.equal(m2.base.lignes[0].rappel_envoye_le, null);
  });

  test('si l\'envoi rate, le rappel est libere pour le passage suivant', async () => {
    const m = monde();
    await reserve(m);
    m.deps.maintenant = () => new Date('2026-01-13T07:45:00Z');
    m.mail.panne = true;
    const cron = { method: 'POST', headers: { 'x-cron-secret': 'secret-de-test' } };
    assert.deepEqual(await (await m.appelle('/rappels', cron)).json(), { envoyes: 0 });
    assert.equal(m.base.lignes[0].rappel_envoye_le, null);
    m.mail.panne = false;
    assert.deepEqual(await (await m.appelle('/rappels', cron)).json(), { envoyes: 1 });
    assert.deepEqual(await (await m.appelle('/rappels', cron)).json(), { envoyes: 0 });
  });
});

// ------------------------------------------------------------ annuler

describe('annuler', () => {
  test('idempotent : 200, puis 200 deja:true, et 404 pour un token inconnu', async () => {
    const g = googleSimule();
    const m = monde({ google: g });
    await reserve(m, { format: 'meet', telephone: undefined });
    const token = m.base.lignes[0].token_annulation;
    const avant = m.mail.envoyes.length;

    let r = await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, debut: '2026-01-13T08:30:00.000Z' });
    assert.equal(m.base.lignes[0].statut, 'annule');
    assert.ok(m.base.lignes[0].annule_le);
    assert.deepEqual(g.supprimes, [g.crees[0].id]);
    assert.equal(m.mail.envoyes.length, avant + 2);
    const [pro, ama] = m.mail.envoyes.slice(avant);
    assert.equal(pro.genre, 'annule_prospect');
    assert.equal(pro.sujet, 'RDV annulé · mardi 13 janvier à 09:30');
    assert.match(pro.html, /href="https:\/\/monclubcombat\.fr\/#appel"/);
    assert.equal(ama.genre, 'annulation_amaury');
    assert.equal(ama.sujet, '❌ Annulation · Karim Benali · mardi 13 janvier à 09:30');
    assert.match(ama.texte, /Le créneau du mardi 13 janvier à 09:30 est de nouveau libre\./);

    /* deuxieme fois : rien ne repart */
    r = await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, deja: true, debut: '2026-01-13T08:30:00.000Z' });
    assert.equal(m.mail.envoyes.length, avant + 2);
    assert.equal(g.supprimes.length, 1);

    /* en GET aussi */
    r = await m.appelle('/annuler?token=' + token);
    assert.equal((await r.json()).deja, true);

    r = await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: '00000000-0000-4000-8000-000000000000' }) });
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { erreur: 'inconnu' });
    r = await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: 'n\'importe quoi' }) });
    assert.equal(r.status, 404);
    r = await m.appelle('/annuler', { method: 'POST', body: '{}' });
    assert.equal(r.status, 404);
  });

  test('Google en panne a la suppression : l\'annulation tient quand meme', async () => {
    const g = googleSimule({ panneSuppression: true });
    const m = monde({ google: g });
    await reserve(m, { format: 'meet', telephone: undefined });
    const r = await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: m.base.lignes[0].token_annulation }) });
    assert.equal(r.status, 200);
    assert.equal(m.base.lignes[0].statut, 'annule');
  });
});

// ------------------------------------------------------------ CORS et routage

describe('CORS et routage', () => {
  test('les origines du site et localhost passent, les autres non', async () => {
    const m = monde();
    for (const o of ['https://monclubcombat.fr', 'https://www.monclubcombat.fr', 'https://fight-scale.vercel.app', 'http://localhost:8767', 'http://localhost', 'http://127.0.0.1:3000']) {
      const r = await m.appelle('/disponibilites', { method: 'OPTIONS', headers: { origin: o, 'access-control-request-method': 'GET' } });
      assert.equal(r.status, 204, o);
      assert.equal(r.headers.get('access-control-allow-origin'), o);
      assert.match(r.headers.get('access-control-allow-headers'), /apikey/);
      assert.match(r.headers.get('access-control-allow-headers'), /x-cron-secret/);
      assert.match(r.headers.get('access-control-allow-methods'), /GET, POST/);
      assert.equal(r.headers.get('vary'), 'Origin');
    }
    for (const o of ['https://evil.example', 'http://monclubcombat.fr', 'https://monclubcombat.fr.evil.example', 'http://localhost.evil.example']) {
      const r = await m.appelle('/disponibilites', { headers: { origin: o } });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('access-control-allow-origin'), null, o);
    }
    /* une vraie reponse porte aussi l'en-tete */
    const r = await m.appelle('/disponibilites', { headers: { origin: 'https://monclubcombat.fr' } });
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://monclubcombat.fr');
    assert.match(r.headers.get('content-type'), /application\/json/);
  });

  test('route inconnue 404, mauvaise methode 405, prefixe /functions/v1 ou non', async () => {
    const m = monde();
    let r = await m.appelle('/ailleurs');
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { erreur: 'route_inconnue' });
    r = await m.appelle('');
    assert.equal(r.status, 404);
    r = await m.appelle('/reserver');
    assert.equal(r.status, 405);
    r = await m.appelle('/disponibilites', { method: 'POST', body: '{}' });
    assert.equal(r.status, 405);

    const direct = await L.traite(new Request('http://x/rdv/disponibilites'), ENV, m.deps);
    assert.equal(direct.status, 200);
    assert.equal(L.cheminRdv('/functions/v1/rdv/reserver'), '/reserver');
    assert.equal(L.cheminRdv('/rdv'), '/');
  });

  test('une base en panne repond 500 { erreur: "serveur" } sans fuite', async () => {
    const m = monde();
    m.base.confirmesEntre = async () => { throw new Error('connexion refusee'); };
    const r = await m.appelle('/disponibilites');
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { erreur: 'serveur' });
    assert.ok(m.journal.entrees.some((e) => e.niveau === 'erreur' && e.message === 'serveur'));
  });
});

// ------------------------------------------------------------ textes et journal

describe('textes et journal', () => {
  test('dates en francais, heure de Paris', () => {
    assert.equal(L.dateFr(new Date('2026-09-25T08:00:00Z')), 'vendredi 25 septembre à 10:00');
    assert.equal(L.dateFr(new Date('2026-01-12T09:00:00Z')), 'lundi 12 janvier à 10:00');
    assert.equal(L.dateFr(new Date('2026-12-31T23:30:00Z')), 'vendredi 1 janvier à 00:30');
    assert.equal(L.dateFr(new Date('2026-08-03T12:05:00Z')), 'lundi 3 août à 14:05');
  });

  test('aucun tiret long, au plus un emoji par sujet, HTML echappe', async () => {
    const g = googleSimule();
    const m = monde({ google: g });
    await reserve(m, { format: 'meet', telephone: undefined, prenom: 'Jean <b>', club: 'Salle "Ouragan" & fils' });
    await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: m.base.lignes[0].token_annulation }) });
    await reserve(m, { debut: '2026-01-13T09:00:00.000Z' });
    m.deps.maintenant = () => new Date('2026-01-13T08:15:00Z');
    await m.appelle('/rappels', { method: 'POST', headers: { 'x-cron-secret': 'secret-de-test' } });
    const genres = new Set(m.mail.envoyes.map((c) => c.genre));
    assert.deepEqual([...genres].sort(), ['annulation_amaury', 'annule_prospect', 'confirmation', 'nouvelle_resa', 'rappel']);
    for (const c of m.mail.envoyes) {
      const tout = c.sujet + c.html + c.texte + (c.pieces || []).map((p) => p.contenu).join('');
      assert.ok(!tout.includes('—'), 'tiret long dans ' + c.genre);
      assert.ok(!c.html.includes('<b>'.replace('<b>', 'Jean <b>')), 'HTML non echappe dans ' + c.genre);
      assert.ok(!c.html.includes('& fils'), 'esperluette non echappee dans ' + c.genre);
      const emojis = (c.sujet.match(/\p{Extended_Pictographic}/gu) || []).length;
      assert.ok(emojis <= 1, 'trop d\'emojis dans ' + c.sujet);
      assert.match(c.html, /Mon Club Combat · monclubcombat\.fr/);
      assert.match(c.texte, /Mon Club Combat · monclubcombat\.fr/);
      assert.match(c.html, /<!doctype html>/i);
    }
  });

  test('le journal ne porte ni e-mail, ni nom, ni telephone, ni adresse IP', async () => {
    const g = googleSimule({ panneCreation: true });
    const m = monde({ google: g, courrier: courrierMemoire({ panne: true }) });
    await reserve(m, { format: 'meet', telephone: '06 99 88 77 66' }, { 'x-forwarded-for': '203.0.113.77' });
    m.base.parToken = async () => { throw new Error('boum'); };
    await m.appelle('/annuler', { method: 'POST', body: JSON.stringify({ token: '00000000-0000-4000-8000-000000000000' }) });
    assert.ok(m.journal.entrees.length >= 3);
    const tout = JSON.stringify(m.journal.entrees);
    for (const interdit of ['karim', 'salle-test', 'Benali', '06 99', '203.0.113.77', 'Team Ouragan']) {
      assert.ok(!tout.includes(interdit), interdit + ' dans le journal');
    }
  });

  test('les corps Resend et Google sont bien formes', async () => {
    const m = monde();
    await reserve(m);
    const corps = L.corpsResend(m.mail.envoyes[0]);
    assert.equal(corps.from, 'Mon Club Combat <rdv@monclubcombat.fr>');
    assert.deepEqual(corps.to, ['karim@salle-test.fr']);
    assert.equal(corps.reply_to, 'contact@monclubcombat.fr');
    assert.equal(corps.attachments[0].filename, 'rendez-vous.ics');
    assert.equal(Buffer.from(corps.attachments[0].content, 'base64').toString('utf8'), m.mail.envoyes[0].pieces[0].contenu);
    assert.match(corps.attachments[0].content_type, /text\/calendar/);

    const ev = L.corpsEvenementGoogle({ debut: new Date('2026-01-13T08:30:00Z'), fin: new Date('2026-01-13T08:45:00Z'), resume: 'Appel', description: 'd', invite: 'x@y.fr', meet: true }, 'req-1');
    assert.equal(ev.start.dateTime, '2026-01-13T08:30:00.000Z');
    assert.equal(ev.start.timeZone, 'Europe/Paris');
    assert.deepEqual(ev.attendees, [{ email: 'x@y.fr' }]);
    assert.equal(ev.conferenceData.createRequest.requestId, 'req-1');
    assert.equal(ev.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    const sans = L.corpsEvenementGoogle({ ...ev, debut: new Date(), fin: new Date(), resume: '', description: '', invite: 'a@b.fr', meet: false }, 'r');
    assert.equal(sans.conferenceData, undefined);

    assert.equal(L.lienMeetDe({ hangoutLink: 'https://meet.google.com/aaa' }), 'https://meet.google.com/aaa');
    assert.equal(L.lienMeetDe({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://meet.google.com/bbb' }] } }), 'https://meet.google.com/bbb');
    assert.equal(L.lienMeetDe({}), null);
    const occ = L.occupesDe({ calendars: { primary: { busy: [{ start: '2026-01-13T09:00:00Z', end: '2026-01-13T10:00:00Z' }] } } });
    assert.equal(occ.length, 1);
    assert.equal(occ[0].debut.toISOString(), '2026-01-13T09:00:00.000Z');
    assert.deepEqual(L.occupesDe({}), []);
  });
});
