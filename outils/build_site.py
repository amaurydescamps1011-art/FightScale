# -*- coding: utf-8 -*-
"""Emballe les trois pages de l'Artifact en vrai site statique déployable.

Dans un Artifact, l'hôte ajoute lui-même <!doctype>, <html>, <head> et la balise
viewport ; hors Artifact il faut les écrire, plus lang, la description et de quoi
partager proprement."""
import os, re, shutil

SORTIE = 'site'
DESCR = {
 'index.html': ("Mon Club Combat — trouvez la salle de sports de combat près de chez vous",
   "L'annuaire des salles de sports de combat en France : MMA, boxe anglaise, "
   "kickboxing, Muay Thaï, jiu-jitsu brésilien, grappling, karaté et judo."),
 'recherche.html': ("Salles de sports de combat — Mon Club Combat",
   "Cherchez une salle de sports de combat par ville et par discipline, sur la carte."),
 'salle.html': ("Salle de sports de combat — Mon Club Combat",
   "La fiche d'une salle de sports de combat : disciplines, planning des cours, "
   "adresse, horaires et coordonnées."),
 'clubs.html': ("Référencer ma salle — Mon Club Combat",
   "Référencez gratuitement votre salle de sports de combat sur Mon Club Combat "
   "et recevez des demandes de séances d'essai."),
 # la fiche se remplit sur sa propre page, derriere la creation de l'espace club :
 # elle n'a rien a faire dans un resultat de recherche
 'referencer.html': ("La fiche de votre salle — Mon Club Combat",
   "Remplissez la fiche de votre salle de sports de combat."),
 'espace-club.html': ("Mon espace club — Mon Club Combat",
   "Suivez votre fiche et vos demandes de séance d'essai."),
 'admin.html': ("Back-office — Mon Club Combat",
   "Vérification des fiches de club."),
 'motdepasse.html': ("Nouveau mot de passe — Mon Club Combat",
   "Choisissez un nouveau mot de passe pour votre espace club."),
}

# Pages sans interet pour un moteur : un formulaire ne se lit pas dans un resultat,
# et l'espace club comme le back-office sont derriere une session. Le noindex n'est
# pas ce qui les protege — c'est le RLS ; il evite seulement qu'ils soient indexes.
SANS_INDEX = {'referencer.html', 'espace-club.html', 'admin.html', 'motdepasse.html'}

# Les pages d'annuaire (une par discipline, une par ville) sont generees a part.
import build_annuaire as ann
for d in ann.DISCIPLINES:
    DESCR[ann.fichier_disc(d)] = (
        '%s — salles et clubs en France | Mon Club Combat' % d,
        'Toutes les salles de %s référencées sur Mon Club Combat : horaires, planning '
        'des cours, adresse et contact direct.' % d)
for v in ann.VILLES:
    DESCR[ann.fichier_ville(v)] = (
        'Salles de sports de combat à %s | Mon Club Combat' % v,
        'Les salles de sports de combat à %s : MMA, boxe, kickboxing, Muay Thaï, '
        'JJB, grappling. Horaires, planning et contact direct.' % v)

GABARIT = '''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="%(descr)s">
<meta name="theme-color" content="#FFFFFF">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Mon Club Combat">
<meta property="og:title" content="%(titre)s">
<meta property="og:description" content="%(descr)s">
<meta name="twitter:card" content="summary">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>
  :root{color-scheme:light; padding-top:env(safe-area-inset-top,0px);
        padding-bottom:env(safe-area-inset-bottom,0px)}
  html{scroll-padding-top:env(safe-area-inset-top,0px)}
  body{margin:0; background:#F7F6F3}
  img{max-width:100%%}
  [hidden]{display:none !important}
</style>
%(corps)s
</body>
</html>
'''

# Le monogramme tel qu'Amaury l'a donne le 22/09/2026 : M noir, C rouge, sur
# fond clair. Il occupe 389,3 sur 370,9 ; on le centre dans un carre a peine
# plus grand, parce qu'a 16 px dans un onglet chaque pixel de marge est un pixel
# de monogramme en moins, et le fond clair disparait de toute facon dans une
# barre d'onglets claire. Le carre est calcule ici pour suivre le trace si le
# logo bouge.
COTE = 412.0
_CX, _CY = (211.6 + 600.9) / 2, (587.7 + 958.6) / 2
_X0, _Y0 = _CX - COTE / 2, _CY - COTE / 2
FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="{0:.1f} {1:.1f} {2:.0f} {2:.0f}">\n'
           '<rect x="{0:.1f}" y="{1:.1f}" width="{2:.0f}" height="{2:.0f}" rx="46" fill="#FFFFFF"/>\n'
           '%s\n</svg>\n').format(_X0, _Y0, COTE)

os.makedirs(SORTIE, exist_ok=True)

defs = open('defs.svg', encoding='utf-8').read()
def trace(ident):
    m = re.search(r'<path id="%s"[^>]*d="([^"]+)"' % ident, defs)
    return m.group(1)
open(os.path.join(SORTIE, 'favicon.svg'), 'w', encoding='utf-8').write(
    FAVICON % ('<path fill-rule="evenodd" d="%s" fill="#16160F"/>'
               '<path fill-rule="evenodd" d="%s" fill="#EC162E"/>'
               % (trace('mcc-mono-m'), trace('mcc-mono-c'))))

for nom, (titre, descr) in DESCR.items():
    corps = ann.ECRITS.get(nom) or open(nom, encoding='utf-8').read()
    assert '<!doctype' not in corps.lower()
    # le <title> de l'Artifact sert de titre de page, on le remplace par le nôtre
    corps = re.sub(r'<title>.*?</title>', '<title>' + titre + '</title>', corps, count=1)
    page = GABARIT % {'titre': titre, 'descr': descr, 'corps': corps}
    if nom in SANS_INDEX:
        page = page.replace('<meta name="description"',
                            '<meta name="robots" content="noindex, follow">\n<meta name="description"', 1)
    open(os.path.join(SORTIE, nom), 'w', encoding='utf-8').write(page)

for f in ('carte.js', 'geo.js', 'sb.js'):
    shutil.copy(f, os.path.join(SORTIE, f))

# Les photos de villes et celles de la fiche d'exemple, quand elles existent.
import tuiles, gen_salles
for rel in tuiles.photos_deposees() + [x for x in gen_salles.photos_exemple() if x]:
    dest = os.path.join(SORTIE, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(rel, dest)

# maquette de travail : on ne veut pas qu'elle se retrouve dans Google
open(os.path.join(SORTIE, 'robots.txt'), 'w', encoding='utf-8').write(
    "# Maquette de travail : contenu fictif, pas d'indexation.\nUser-agent: *\nDisallow: /\n")

open(os.path.join(SORTIE, 'vercel.json'), 'w', encoding='utf-8').write('''{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/geo.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/(.*)",
      "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
    }
  ]
}
''')

for f in sorted(os.listdir(SORTIE)):
    print('%-16s %8d' % (f, os.path.getsize(os.path.join(SORTIE, f))))
