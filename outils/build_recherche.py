# -*- coding: utf-8 -*-
"""Assemble recherche.html a partir des morceaux communs a la page d'accueil."""
import re, compte

R = lambda n: open(n, encoding='utf-8').read()
ACC = R('page.tpl.html')

def entre(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i)]

def bloc(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i) + len(b)]

base  = entre('  :root{', '  /* ---------- héros ---------- */')
footc = entre('  /* ---------- pied de page ---------- */', '  /* ---------- sections ---------- */')
rechc = R('_recherche.css') + R('_auto.css')
defs  = R('defs.svg')
footer = bloc('<footer class="site-footer">', '</footer>')
body   = R('_recherche.body.html')
js     = (R('_geobase.js') + R('_salles.js') + R('_villes.js') + R('_auto.js')
          + R('_recherche.js'))

SYMBOLES = set(re.findall(r'<path id="([^"]+)"', R('defs.svg')))

def vers_accueil(html):
    def sub(m):
        a = m.group(1)
        if a in SYMBOLES:            # un <use> du logo pointe sur un trace, pas sur une page
            return m.group(0)
        return 'href="index.html"' if a == 'top' else 'href="index.html#' + a + '"'
    return re.sub(r'href="#([a-z0-9\-]+)"', sub, html)

footer = vers_accueil(footer)
import build_annuaire as ann
footer = ann.reseau(footer)

PIN = ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
       'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
       '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/>'
       '<circle cx="12" cy="10" r="2.6"/></svg>')

body = ann.reseau(body.replace('%%FOOTER%%', footer).replace('%%PIN%%', PIN))

page = (
'''<title>Salles de sports de combat</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@500;600;700;800&display=swap">
<style>
''' + base + footc + rechc + compte.css() + '''</style>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
''' + defs + '''
</defs></svg>
''' + body + '\n<script src="geo.js"></script>\n<script>\n' + js + '\n</script>\n')

page = compte.pose(page)
open('recherche.html', 'w', encoding='utf-8').write(page)
print('recherche.html', len(page))
