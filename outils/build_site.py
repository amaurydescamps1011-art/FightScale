# -*- coding: utf-8 -*-
"""Emballe les pages construites en vrai site statique déployable.

Dans un Artifact, l'hôte ajoute lui-même <!doctype>, <html>, <head> et la balise
viewport ; hors Artifact il faut les écrire, plus lang, la description et de quoi
partager proprement."""
import os, re, shutil

SORTIE = 'site'
# Depuis le 18/10/2026 le site ne porte que l'agence (Amaury : « le truc principal
# maintenant c'est vraiment l'agence »). Sa page est servie a la racine du domaine ;
# les pages legales restent, le formulaire de rappel collectant des donnees
# personnelles. Le site complet d'avant vit sur la branche
# sauvegarde-site-complet-2026-10-18.
#   page construite -> (fichier servi, titre, description)
DESCR = {
 'agence.html': ('index.html', "Mon Club Combat | L’agence qui remplit votre salle",
   "Mon Club Combat remplit votre salle de sports de combat : chaque mois, un nombre garanti "
   "de personnes réservent une séance d'essai sur un cours de votre planning. Vous n'avez plus "
   "qu'à les accueillir."),
 'confidentialite.html': ('confidentialite.html', "Politique de confidentialité | Mon Club Combat",
   "Ce que Mon Club Combat enregistre, pourquoi, qui y a accès et combien de temps."),
 'conditions.html': ('conditions.html', "Conditions d'utilisation | Mon Club Combat",
   "Les règles d'utilisation de Mon Club Combat."),
 # le lien d'annulation des e-mails de rendez-vous (monclubcombat.fr/annuler?token=...)
 'annuler.html': ('annuler.html', "Annuler mon rendez-vous | Mon Club Combat",
   "Annulez votre appel avec Mon Club Combat, ou réservez un nouveau créneau."),
}

# Les adresses de l'ancien site renvoient sur la page agence plutot que sur une
# page introuvable : des liens deja partages (pubs, e-mails aux clubs) y menent.
ANCIENNES = ['agence', 'recherche', 'salle', 'clubs', 'referencer', 'espace-club', 'admin',
             'motdepasse', 'mon-compte', 'acquisition',
             'mma', 'boxe-anglaise', 'kickboxing', 'muay-thai', 'jiu-jitsu-bresilien',
             'grappling', 'karate', 'judo', 'lutte', 'self-defense', 'sports-de-combat-:ville']

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

for nom, (servi, titre, descr) in DESCR.items():
    corps = open(nom, encoding='utf-8').read()
    assert '<!doctype' not in corps.lower()
    # le <title> de l'Artifact sert de titre de page, on le remplace par le nôtre
    corps = re.sub(r'<title>.*?</title>', '<title>' + titre + '</title>', corps, count=1)
    page = GABARIT % {'titre': titre, 'descr': descr, 'corps': corps}
    open(os.path.join(SORTIE, servi), 'w', encoding='utf-8').write(page)

# le client de la base est servi par le site, donc il vit a la racine du depot
DEPOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for f in ('sb.js',):
    shutil.copy(os.path.join(DEPOT, f), os.path.join(SORTIE, f))

# Le logo de Gota (Amaury, 08/10/2026) et la VSL de la page agence.
AGENCE = ['photos/gota-logo.webp', 'video/vsl-agence.mp4', 'video/vsl-agence-affiche.webp']
for rel in AGENCE:
    dest = os.path.join(SORTIE, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(os.path.join(DEPOT, rel), dest)

# maquette de travail : on ne veut pas qu'elle se retrouve dans Google
open(os.path.join(SORTIE, 'robots.txt'), 'w', encoding='utf-8').write(
    "# Maquette de travail : contenu fictif, pas d'indexation.\nUser-agent: *\nDisallow: /\n")

import json
REDIR = [{'source': '/' + a, 'destination': '/', 'permanent': False} for a in ANCIENNES]
REDIR += [{'source': '/' + a + '.html', 'destination': '/', 'permanent': False} for a in ANCIENNES]
open(os.path.join(SORTIE, 'vercel.json'), 'w', encoding='utf-8').write(json.dumps({
  'cleanUrls': True,
  'trailingSlash': False,
  'redirects': REDIR,
  'headers': [{'source': '/(.*)', 'headers': [{'key': 'X-Robots-Tag', 'value': 'noindex, nofollow'}]}],
}, indent=2, ensure_ascii=False) + '\n')

for f in sorted(os.listdir(SORTIE)):
    print('%-16s %8d' % (f, os.path.getsize(os.path.join(SORTIE, f))))
