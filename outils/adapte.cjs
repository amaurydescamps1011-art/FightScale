/* Convertit des clubs de la base en salles du site, en JSON sur la sortie.

   Le site a deja un convertisseur : MCC.enSalle, dans sb.js, qui tourne dans le
   navigateur. En ecrire un second en Python pour la reconstruction, c'est se
   garantir deux resultats differents le jour ou l'un des deux bouge. On charge
   donc le vrai, dans un faux navigateur reduit a ce dont il a besoin.

   Usage : node adapte.cjs < clubs.json  > salles.json */
const fs = require('fs'), path = require('path');
const ici = __dirname;

const ecoute = {};
global.window = global;
global.document = {
  addEventListener(){}, removeEventListener(){},
  dispatchEvent(){ return true; },
  getElementById(){ return null; }, querySelector(){ return null; },
  querySelectorAll(){ return []; }, readyState: 'complete',
  body: { classList: { add(){}, remove(){} } }
};
global.CustomEvent = function (nom, o){ this.type = nom; this.detail = o && o.detail; };
global.location = { href: '', search: '' };
void ecoute;

/* sb.js cree son client si window.supabase existe ; ici on n'en veut pas, on ne
   se sert que du convertisseur. MCC.enSalle n'a pas besoin du client. */
/* eval indirect : sans ca, les `var` des deux fichiers atterrissent dans la
   portee du module et VILLES_FR reste invisible pour sb.js. */
const global_eval = eval;
global_eval(fs.readFileSync(path.join(ici, '_villes.js'), 'utf8'));
global_eval(fs.readFileSync(path.join(ici, 'sb.js'), 'utf8'));

let entree = '';
process.stdin.on('data', d => entree += d);
process.stdin.on('end', () => {
  const clubs = JSON.parse(entree || '[]');
  const salles = clubs
    .filter(c => c.statut === 'publie' && c.slug)
    .map(c => window.MCC.enSalle(c));
  process.stdout.write(JSON.stringify(salles));
});
