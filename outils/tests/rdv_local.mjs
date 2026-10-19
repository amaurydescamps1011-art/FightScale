#!/usr/bin/env node
/* Un serveur de demonstration pour la prise de rendez-vous, sans Supabase,
   sans Resend, sans Google : `traite()` de logique.ts monte sur
   http://localhost:8768/functions/v1/rdv avec une base en memoire.

     node outils/tests/rdv_local.mjs            # Google absent : meet:false, telephone seul
     node outils/tests/rdv_local.mjs --meet     # Google simule : un faux lien Meet
     node outils/tests/rdv_local.mjs --port=8770

   Chaque e-mail « envoye » est ecrit dans outils/tests/sorties/mails/ :
   NN-genre.html (pour le capturer dans un navigateur), NN-genre.txt (la
   version texte) et NN-genre.ics quand une invitation est jointe, plus un
   journal.json qui les recense.

   Le front pointe ici en posant `window.MCC_RDV_API` avant sb.js (c'est ce
   que fait scratchpad/capture-rdv.cjs par page.addInitScript).

   Routes de service, pour les scripts de capture seulement :
     GET  /_test/etat          -> les lignes de la base et les e-mails ecrits
     POST /_test/reinitialise  -> vide la base et le dossier des e-mails
     POST /_test/rappels       -> declenche les rappels (comme pg_cron le ferait)
     POST /_test/horloge       -> { "quand": ISO } fige l'horloge de la logique, {} la libere
                                  (sert a produire le rappel : les creneaux commencent a +3 h) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traite } from '../../supabase/functions/rdv/logique.ts';
import { baseMemoire, googleSimule } from './rdv_memoire.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIES = path.join(ICI, 'sorties', 'mails');
const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const a = args.find((x) => x === '--' + nom || x.startsWith('--' + nom + '='));
  if (!a) return defaut;
  return a.includes('=') ? a.split('=')[1] : true;
};
const PORT = Number(option('port', 8768));
const MEET = !!option('meet', false);
const SECRET = 'secret-local';

const env = { SITE_URL: 'http://localhost:8767', RDV_CRON_SECRET: SECRET, RDV_NOTIFIE: 'contact@monclubcombat.fr' };

fs.mkdirSync(SORTIES, { recursive: true });
let base = baseMemoire();
const journal = [];
let n = 0;

function nomSur(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

const mail = {
  async envoie(c) {
    n++;
    const prefixe = String(n).padStart(2, '0') + '-' + c.genre;
    const fichiers = { html: prefixe + '.html', texte: prefixe + '.txt' };
    fs.writeFileSync(path.join(SORTIES, fichiers.html), c.html);
    fs.writeFileSync(path.join(SORTIES, fichiers.texte), c.texte);
    for (const p of c.pieces || []) {
      const f = prefixe + '-' + nomSur(p.nom.replace(/\.[^.]+$/, '')) + path.extname(p.nom);
      fs.writeFileSync(path.join(SORTIES, f), p.contenu);
      (fichiers.pieces ||= []).push(f);
    }
    journal.push({ n, genre: c.genre, a: c.a, repondre: c.repondre || null, sujet: c.sujet, fichiers, quand: new Date().toISOString() });
    fs.writeFileSync(path.join(SORTIES, 'journal.json'), JSON.stringify(journal, null, 2));
    console.log(`  mail ${prefixe}  ->  ${c.a.join(', ')}  « ${c.sujet} »`);
  },
};

const google = MEET ? googleSimule() : null;
const deps = {
  base, mail, google,
  journal: (niveau, message, detail) => console.log(`  [${niveau}] ${message}`, detail ? JSON.stringify(detail) : ''),
};

function reinitialise() {
  base = baseMemoire();
  deps.base = base;
  journal.length = 0;
  n = 0;
  for (const f of fs.readdirSync(SORTIES)) fs.rmSync(path.join(SORTIES, f));
}

const serveur = http.createServer(async (req, res) => {
  const morceaux = [];
  for await (const m of req) morceaux.push(m);
  const corps = Buffer.concat(morceaux);
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/_test/')) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (url.pathname === '/_test/etat') {
      res.end(JSON.stringify({ meet: MEET, lignes: base.lignes, mails: journal }, null, 2));
    } else if (url.pathname === '/_test/reinitialise') {
      reinitialise();
      res.end('{"ok":true}');
    } else if (url.pathname === '/_test/rappels') {
      const r = await traite(new Request(`http://localhost:${PORT}/functions/v1/rdv/rappels`, { method: 'POST', headers: { 'x-cron-secret': SECRET } }), env, deps);
      res.statusCode = r.status;
      res.end(await r.text());
    } else if (url.pathname === '/_test/horloge') {
      /* POST { "quand": "2026-10-20T07:00:00Z" } fige l'horloge de la logique
         (pour produire un rappel : les creneaux commencent a +3 h) ; {} la libere */
      let quand = null;
      try { quand = JSON.parse(corps.toString('utf8') || '{}').quand || null; } catch (e) { quand = null; }
      const d = quand ? new Date(quand) : null;
      if (d && !isNaN(d.getTime())) deps.maintenant = () => d; else delete deps.maintenant;
      res.end(JSON.stringify({ ok: true, maintenant: deps.maintenant ? deps.maintenant().toISOString() : null }));
    } else {
      res.statusCode = 404;
      res.end('{"erreur":"route_inconnue"}');
    }
    return;
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  /* comme une vraie passerelle : l'adresse vue est AJOUTEE a la fin de
     x-forwarded-for, ce que le client y a ecrit reste devant */
  if (req.socket.remoteAddress) {
    const avant = headers.get('x-forwarded-for');
    headers.set('x-forwarded-for', (avant ? avant + ', ' : '') + req.socket.remoteAddress);
  }
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD' && corps.length) init.body = corps;

  let r;
  try {
    r = await traite(new Request(url.href, init), env, deps);
  } catch (e) {
    console.error('  [erreur] ' + (e && e.message));
    res.statusCode = 500;
    res.end('{"erreur":"serveur"}');
    return;
  }
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  const texte = await r.text();
  console.log(`${req.method} ${url.pathname} -> ${r.status}${texte && r.status >= 400 ? '  ' + texte.slice(0, 120) : ''}`);
  res.end(texte);
});

serveur.listen(PORT, '127.0.0.1', () => {
  console.log(`Serveur rdv local sur http://localhost:${PORT}/functions/v1/rdv`);
  console.log(`  Google ${MEET ? 'simule (meet:true, faux lien Meet)' : 'absent (meet:false, telephone seul)'}`);
  console.log(`  e-mails ecrits dans ${SORTIES}`);
  console.log(`  secret du cron : ${SECRET} (ou POST /_test/rappels)`);
  console.log(`  dans la page : window.MCC_RDV_API = 'http://localhost:${PORT}/functions/v1/rdv'`);
});
