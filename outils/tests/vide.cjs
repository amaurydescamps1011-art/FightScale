const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const dir = '/tmp/claude-0/-home-claude/fe1486f2-8126-5a24-9c89-ca3cc04a2b8e/scratchpad/home/site/';
  const p = await b.newPage({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR' });
  const err = []; p.on('pageerror', e => err.push(String(e)));
  await p.goto('file://' + dir + 'recherche.html?ville=Lille', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: dir + '../n-vide.png' });
  console.log('h1:', await p.textContent('#compte'));
  console.log('erreurs:', err.length ? err : 'aucune');
  await b.close();
})();
