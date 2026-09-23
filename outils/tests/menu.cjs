const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const dir = '/tmp/claude-0/-home-claude/fe1486f2-8126-5a24-9c89-ca3cc04a2b8e/scratchpad/home/site/';
  const vu = async (p, sel) => p.evaluate(s => {
    const e = document.querySelector(s); if (!e) return 'absent';
    const c = getComputedStyle(e);
    return c.visibility + '/' + c.opacity;
  }, sel);

  for (const [page, nb] of [['index.html', 3], ['mma.html', 3], ['clubs.html', 3],
                            ['salle.html?s=fight-club-marseille', 3], ['recherche.html?ville=Paris', 2]]) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
    const err = []; p.on('pageerror', e => err.push(String(e)));
    await p.goto('file://' + dir + page, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const items = await p.$$('.nav-item');
    const liens = await p.$$eval('.nav-menu a', a => a.length);
    let etat = 'ferme:' + await vu(p, '.nav-menu');
    if (items[0]) {
      await items[0].hover(); await p.waitForTimeout(350);
      etat += ' survol:' + await vu(p, '.nav-menu');
    }
    console.log(page.padEnd(38), 'items=' + items.length + '/' + nb, 'liens=' + liens, etat,
                err.length ? 'ERREURS ' + err : '');
    await p.close();
  }

  // le pont : on descend du lien vers le menu, il doit rester ouvert
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  await p.goto('file://' + dir + 'index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const lien = await p.$('.nav-item .nav-link');
  const bb = await lien.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForTimeout(300);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height + 8, { steps: 6 });
  await p.waitForTimeout(250);
  console.log('pont (curseur dans l\'interstice) :', await vu(p, '.nav-menu'));
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height + 60, { steps: 6 });
  await p.waitForTimeout(250);
  console.log('dans le menu :', await vu(p, '.nav-menu'));
  await p.screenshot({ path: dir + '../n-menu.png' });

  // clavier
  const q = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  await q.goto('file://' + dir + 'index.html', { waitUntil: 'networkidle' });
  await q.waitForTimeout(500);
  for (let i = 0; i < 8; i++) {
    await q.keyboard.press('Tab');
    const ouvert = await q.evaluate(() => {
      const m = document.querySelector('.nav-item:focus-within .nav-menu');
      return m ? getComputedStyle(m).visibility : null;
    });
    if (ouvert) { console.log('clavier : menu ouvert apres', i + 1, 'tabulations ->', ouvert); break; }
    if (i === 7) console.log('clavier : AUCUN menu ouvert');
  }
  await b.close();
})();
