#!/usr/bin/env node
/* Obtenir le « refresh token » Google Agenda de la fonction rdv, en local.

   Il faut un client OAuth de type « Application de bureau » dans Google
   Cloud (voir supabase/functions/rdv/LISEZ-MOI.md), puis :

     GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node outils/google_jeton.mjs

   Le script ouvre un petit serveur sur http://127.0.0.1:8769/, affiche
   l'adresse de consentement a ouvrir dans un navigateur connecte au compte
   Google d'Amaury, recoit le code de retour, l'echange contre les jetons et
   AFFICHE le refresh token a l'ecran. Il n'ecrit rien, nulle part : le jeton
   se colle dans les secrets de la fonction (GOOGLE_REFRESH_TOKEN) et c'est tout.

   Options : --port=8769  --scopes="..." (par defaut : evenements + disponibilites) */
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const a = args.find((x) => x.startsWith('--' + nom + '='));
  return a ? a.slice(nom.length + 3) : defaut;
};
const PORT = Number(option('port', 8769));
const SCOPES = option('scopes',
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy');

async function demande(nom, secret = false) {
  if (process.env[nom]) return process.env[nom].trim();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const v = (await rl.question(`${nom}${secret ? ' (ne s\'affiche nulle part ensuite)' : ''} : `)).trim();
  rl.close();
  if (!v) { console.error('Il faut ' + nom + '.'); process.exit(1); }
  return v;
}

const clientId = await demande('GOOGLE_CLIENT_ID');
const clientSecret = await demande('GOOGLE_CLIENT_SECRET', true);

/* PKCE et state : le code de retour ne sert a personne d'autre */
const verifieur = randomBytes(48).toString('base64url');
const defi = createHash('sha256').update(verifieur).digest('base64url');
const etat = randomBytes(16).toString('hex');
const redirection = `http://127.0.0.1:${PORT}/`;

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirection,
  response_type: 'code',
  scope: SCOPES,
  access_type: 'offline',   // c'est ce qui donne un refresh token
  prompt: 'consent',        // et ceci le garantit meme si le compte a deja consenti
  include_granted_scopes: 'true',
  state: etat,
  code_challenge: defi,
  code_challenge_method: 'S256',
}).toString();

const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirection);
  if (u.pathname !== '/') { res.statusCode = 404; res.end('non'); return; }
  const code = u.searchParams.get('code');
  const erreur = u.searchParams.get('error');
  if (erreur || !code || u.searchParams.get('state') !== etat) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p style="font-family:sans-serif">Consentement refusé ou lien invalide. Fermez cet onglet et relancez le script.</p>');
    console.error('Retour sans code : ' + (erreur || 'state invalide'));
    serveur.close();
    process.exit(1);
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirection, grant_type: 'authorization_code', code_verifier: verifieur,
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.refresh_token) {
      throw new Error('Google a répondu ' + r.status + ' : ' + (d.error_description || d.error || 'pas de refresh_token (compte déjà consenti sans prompt=consent ?)'));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p style="font-family:sans-serif">C’est fait : le jeton est affiché dans le terminal. Vous pouvez fermer cet onglet.</p>');
    console.log('\nRefresh token obtenu. Collez-le dans les secrets de la fonction, nom GOOGLE_REFRESH_TOKEN :\n');
    console.log(d.refresh_token);
    console.log('\nPortées accordées : ' + (d.scope || SCOPES));
    console.log('Rien n’a été écrit sur le disque.');
  } catch (e) {
    res.statusCode = 500;
    res.end('Erreur : ' + e.message);
    console.error(e.message);
  } finally {
    serveur.close();
    setTimeout(() => process.exit(0), 100);
  }
});

serveur.listen(PORT, '127.0.0.1', () => {
  console.log(`\nServeur de retour sur ${redirection}`);
  console.log('Ouvrez cette adresse dans un navigateur connecté au compte Google d’Amaury :\n');
  console.log(url.href + '\n');
  console.log('(si la machine n’a pas de navigateur, copiez l’adresse ailleurs : le retour doit revenir ici, sur 127.0.0.1)');
});
