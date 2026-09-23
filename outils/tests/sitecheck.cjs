const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const base = 'file://' + process.cwd() + '/site/';
const e = [];
async function go(f, w, h, tag, wait) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', x => e.push(tag + ': ' + x));
  // le client Supabase vient de jsdelivr, injoignable ici ; les pages marchent sans lui
  p.on('console', m => { if (m.type()==='error' && !/jsdelivr|net::ERR|Failed to load resource/.test(m.text())) e.push(tag + ' console: ' + m.text()); });
  await p.goto(base + f, { waitUntil: 'networkidle' });
  await p.waitForTimeout(wait || 1800);
  console.log(tag, '| titre:', await p.title(),
    '| overflow', await p.evaluate(()=>document.documentElement.scrollWidth),
    '| viewport', await p.evaluate(()=>!!document.querySelector('meta[name=viewport]')));
  await p.screenshot({ path: tag + '.png' });
  return p;
}
await (await go('index.html', 1440, 900, 's-accueil')).close();
await (await go('referencer.html', 1440, 900, 's-referencer')).close();
const r = await go('recherche.html?ville=Lyon', 1440, 900, 's-recherche');
console.log('  résultats:', await r.evaluate(()=>document.getElementById('compte').textContent));
await r.close();
await (await go('clubs.html', 1440, 900, 's-clubs')).close();
await (await go('index.html', 390, 844, 's-mob')).close();
console.log(e.length ? 'ERREURS ' + e.join(' | ') : 'aucune erreur');
await b.close(); })();
