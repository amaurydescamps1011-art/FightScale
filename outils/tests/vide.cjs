const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const dir = require('path').join(__dirname, '..', 'site') + '/';
  const p = await b.newPage({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR' });
  const err = []; p.on('pageerror', e => err.push(String(e)));
  await p.goto('file://' + dir + 'recherche.html?ville=Lille', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: require('path').join(__dirname, '..', 'captures', 'n-vide.png') });
  console.log('h1:', await p.textContent('#compte'));
  console.log('erreurs:', err.length ? err : 'aucune');
  await b.close();
})();
