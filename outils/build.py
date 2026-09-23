# -*- coding: utf-8 -*-
"""page.tpl.html + defs.svg  ->  index.html (publie)  +  preview.html (local)"""
tpl  = open('page.tpl.html', encoding='utf-8').read()
defs = open('defs.svg',      encoding='utf-8').read()
page = tpl.replace('%%DEFS%%', defs)

# Les villes qui ont vraiment des salles ont leur page d'annuaire : la puce de
# l'accueil y mene directement, au lieu de relancer une recherche.
import build_annuaire as ann
for v in ann.VILLES:
    page = page.replace('href="recherche.html?ville=%s"' % v.replace(' ', '%20'),
                        'href="%s"' % ann.fichier_ville(v))
    page = page.replace('href="recherche.html?ville=%s"' % v,
                        'href="%s"' % ann.fichier_ville(v))
# Les vignettes de ville et le reseau de liens du pied de page : ils sortent des
# memes donnees que les pages d'annuaire, donc ils ne peuvent pas diverger d'elles.
echappe = ann.echappe
# Les 16 vignettes de ville, comme chez masalledesport : la case existe meme
# quand aucune salle n'y est encore referencee, sinon l'annuaire a l'air vide.
# Celles qui ont des salles ouvrent leur page d'annuaire, les autres lancent la
# recherche sur la ville, qui affiche son etat vide.
import vitrine
VITRINE = vitrine.VITRINE
import urllib.parse, tuiles
cartes = []
for v in VITRINE:
    href = (ann.fichier_ville(v) if v in ann.VILLES
            else 'recherche.html?ville=' + urllib.parse.quote(v))
    cartes.append(
      '<a class="cv" href="%s">'
        '<span class="cv-vis">%s</span>'
        '<span class="cv-nom">%s</span>'
      '</a>' % (href, tuiles.visuel(v), echappe(v)))
page = page.replace('%%VILLES_CARTES%%', ''.join(cartes))

page = ann.reseau(page)
assert '%%VILLES_CARTES%%' not in page

import compte
page = page.replace('</style>',
                    open('_auto.css', encoding='utf-8').read() + compte.css() + '</style>', 1)
outils = (open('_salles.js', encoding='utf-8').read()
          + open('_villes.js', encoding='utf-8').read()
          + open('_auto.js', encoding='utf-8').read())
page = page.replace('<script src="carte.js"></script>',
                    '<script src="carte.js"></script>\n<script>\n' + outils + '</script>', 1)
# la fenetre de creation de l'espace club, posee sur toutes les pages
page = compte.pose(page)
open('index.html', 'w', encoding='utf-8').write(page)

carte = open('carte.js', encoding='utf-8').read()
prev  = page.replace('<script src="carte.js"></script>',
                     '<script>\n' + carte + '\n</script>')
assert '<script src="carte.js"></script>' not in prev
open('preview.html', 'w', encoding='utf-8').write(prev)
print('index', len(page), '| preview', len(prev))
