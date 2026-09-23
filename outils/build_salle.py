# -*- coding: utf-8 -*-
"""Assemble salle.html, la fiche d'une salle, a partir des morceaux communs."""
import re, compte

R = lambda n: open(n, encoding='utf-8').read()
ACC = R('page.tpl.html')

def entre(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i)]

def bloc(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i) + len(b)]

base   = entre('  :root{', '  /* ---------- héros ---------- */')
footc  = entre('  /* ---------- pied de page ---------- */', '  /* ---------- sections ---------- */')
sallec = R('_salle.css')
defs   = R('defs.svg')
header = bloc('<header class="site-header">', '</header>')
footer = bloc('<footer class="site-footer">', '</footer>')
body   = R('_salle.body.html')
# _villes.js porte les coordonnees des villes : un club saisit une adresse,
# pas une latitude, donc c'est sa ville qui le place sur le plan.
js     = (R('_geobase.js') + R('_salles.js') + R('_villes.js')
          + R('_minicarte.js') + R('_salle.js'))

# depuis la fiche, les ancres du menu et du pied de page renvoient a l'accueil
SYMBOLES = set(re.findall(r'<path id="([^"]+)"', R('defs.svg')))

def vers_accueil(html):
    def sub(m):
        a = m.group(1)
        if a in SYMBOLES:            # un <use> du logo pointe sur un trace, pas sur une page
            return m.group(0)
        return 'href="index.html"' if a == 'top' else 'href="index.html#' + a + '"'
    return re.sub(r'href="#([a-z0-9\-]+)"', sub, html)

# le lien « Aller au contenu » est interne a la page, il ne doit pas partir a l'accueil
header = vers_accueil(header)
footer = vers_accueil(footer)
import build_annuaire as ann
footer = ann.reseau(footer)
header = ann.reseau(header)

BOUSSOLE = ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            '<circle cx="12" cy="12" r="9"/><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8Z"/></svg>')

body = (body.replace('%%HEADER%%', header).replace('%%FOOTER%%', footer)
            .replace('%%BOUSSOLE%%', BOUSSOLE))

page = (
'''<title>Salle de sports de combat</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@500;600;700;800&display=swap">
<style>
''' + base + footc + sallec + compte.css() + '''</style>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
''' + defs + '''
</defs></svg>
''' + body + '\n<script src="geo.js"></script>\n<script>\n' + js + '\n</script>\n')

page = compte.pose(page)
open('salle.html', 'w', encoding='utf-8').write(page)
print('salle.html', len(page))
