const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
// les pages testees sont celles qui partent en ligne, dans site/ ;
// les captures vont dans captures/, qui n'est pas deploye
const D = require('path').join(__dirname, '..', 'site');
const OUT = require('path').join(__dirname, '..', 'captures');

// une vraie image PNG minuscule, pour eprouver le televersement pour de bon
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAIklEQVQI12P8//8/AzbAxMDAwMDA' +
  'yIAKGBkZGRgYGBgYAAB2BQMB0z0CqAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const erreurs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
  // le client Supabase vient de jsdelivr, injoignable ici ; les pages marchent sans lui
  p.on('console', m => { if (m.type() === 'error' && !/jsdelivr|net::ERR|Failed to load resource/.test(m.text())) erreurs.push('[console] ' + m.text()); });
  p.on('pageerror', e => erreurs.push('[page] ' + e.message));

  // Depuis le 22/09/2026 le formulaire de la fiche n'est plus sur la page de vente :
  // il vit sur referencer.html, derriere la creation de l'espace club.
  await p.goto('file://' + path.join(D, 'referencer.html'));
  await p.waitForTimeout(500);

  // l'apercu part bien de l'etat vide
  const vide = await p.textContent('#ap-nom');
  console.log('apercu vide :', vide);

  // --- on remplit la fiche comme le ferait un gerant ---
  await p.fill('#c-nom', 'Team Ouragan Boxe');
  await p.fill('#c-adresse', '24 rue des Chartreux');
  await p.fill('#c-ville', 'Marseille');
  await p.fill('#c-cp', '13004');
  await p.check('input[name="disciplines"][value="Boxe anglaise"]');
  await p.check('input[name="disciplines"][value="Kickboxing"]');
  await p.fill('#c-mot', 'Une salle de quartier ouverte en 2019, deux coachs diplomes, ' +
                         'et un creneau du midi pour ceux qui travaillent.');
  await p.fill('#c-contact', 'Nadia Belkacem');
  await p.fill('#c-tel', '06 12 34 56 78');
  await p.fill('#c-mail', 'contact@teamouragan.fr');
  await p.fill('#c-web', 'teamouragan.fr');
  await p.fill('#c-insta', 'teamouragan');

  // dimanche ferme par defaut ; on ferme aussi le samedi
  await p.uncheck('[data-jour="5"]');

  // --- les photos ---
  const f1 = path.join(OUT, '_t1.png'), f2 = path.join(OUT, '_t2.png');
  fs.writeFileSync(f1, PNG); fs.writeFileSync(f2, PNG);
  await p.setInputFiles('#c-photos', [f1, f2]);
  await p.waitForTimeout(350);

  const bilan = await p.evaluate(() => ({
    vignettes: document.querySelectorAll('#photo-liste li').length,
    principale: !!document.querySelector('#photo-liste .photo-tag'),
    apVisuelImg: !!document.querySelector('#ap-visuel img'),
    apNom: document.getElementById('ap-nom').textContent,
    apLieu: document.getElementById('ap-lieu').textContent,
    apChips: [...document.querySelectorAll('#ap-chips li')].map(l => l.textContent),
    apCoord: [...document.querySelectorAll('#ap-coord li')].map(l => l.textContent),
    apJours: document.getElementById('ap-jours').textContent,
    compteur: document.getElementById('c-mot-n').textContent,
    joursFermes: document.querySelectorAll('.jour-ligne.ferme').length,
  }));
  console.log('apres saisie:', JSON.stringify(bilan, null, 0));

  if (bilan.vignettes !== 2) erreurs.push('photos : ' + bilan.vignettes + ' vignettes, attendu 2');
  if (!bilan.principale) erreurs.push('la premiere photo n\'est pas marquee principale');
  if (!bilan.apVisuelImg) erreurs.push('la photo n\'apparait pas dans l\'apercu');
  if (bilan.apNom !== 'Team Ouragan Boxe') erreurs.push('apercu : nom = ' + bilan.apNom);
  if (!bilan.apLieu.includes('13004 Marseille')) erreurs.push('apercu : lieu = ' + bilan.apLieu);
  if (bilan.apChips.length !== 2) erreurs.push('apercu : ' + bilan.apChips.length + ' disciplines');
  if (bilan.apCoord.length !== 4) erreurs.push('apercu : ' + bilan.apCoord.length + ' coordonnees');
  if (bilan.apJours !== 'Ouvert 5 jours sur 7') erreurs.push('apercu : ' + bilan.apJours);
  if (bilan.joursFermes !== 2) erreurs.push('horaires : ' + bilan.joursFermes + ' jours fermes');
  if (bilan.compteur === '0') erreurs.push('le compteur de caracteres ne bouge pas');

  await p.screenshot({ path: path.join(OUT, 'cl-rempli2.png'), fullPage: true });

  // --- on retire une photo ---
  await p.click('#photo-liste .photo-x');
  await p.waitForTimeout(250);
  const restantes = await p.locator('#photo-liste li').count();
  console.log('apres retrait:', restantes, 'photo(s)');
  if (restantes !== 1) erreurs.push('le retrait de photo ne marche pas');

  // --- envoi ---
  await p.click('button[type="submit"]');
  await p.waitForTimeout(700);
  const merci = await p.isVisible('#merci.on');
  const recap = await p.textContent('#merci-recap');
  console.log('envoi       :', merci, '|', recap.trim());
  if (!merci) erreurs.push('l\'ecran de confirmation ne s\'affiche pas');
  if (!recap.includes('Team Ouragan Boxe')) erreurs.push('le recapitulatif est vide');
  await p.screenshot({ path: path.join(OUT, 'cl-merci2.png'), fullPage: true });

  // --- un formulaire vide ne part pas ---
  const q = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  q.on('pageerror', e => erreurs.push('[vide] ' + e.message));
  await q.goto('file://' + path.join(D, 'referencer.html'));
  await q.click('button[type="submit"]');
  await q.waitForTimeout(300);
  const partiQuandMeme = await q.isVisible('#merci.on');
  console.log('vide        : envoye =', partiQuandMeme);
  if (partiQuandMeme) erreurs.push('un formulaire vide est accepte');

  // --- mobile ---
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', e => erreurs.push('[mobile] ' + e.message));
  await m.goto('file://' + path.join(D, 'referencer.html'));
  await m.waitForTimeout(400);
  const debord = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('mobile      : debordement =', debord);
  if (debord) erreurs.push('debordement horizontal en 390');
  await m.screenshot({ path: path.join(OUT, 'cl-mob2.png'), fullPage: true });

  fs.unlinkSync(f1); fs.unlinkSync(f2);
  console.log(erreurs.length ? '\nPROBLEMES:\n- ' + erreurs.join('\n- ') : '\nOK, aucun probleme');
  await b.close();
  process.exit(erreurs.length ? 1 : 0);
})();
