# -*- coding: utf-8 -*-
"""Les pages d'annuaire : une par discipline, une par ville.

C'est la structure de masalledesport.com, reprise le 22/09/2026 : chaque entree
de l'annuaire a sa propre page, ecrite en dur dans le HTML. La page de recherche
reste l'outil interactif ; ces pages-la sont ce qu'un moteur peut lire, et ce
qu'on peut envoyer en lien.
"""
import json, re, unicodedata, compte

R = lambda n: open(n, encoding='utf-8').read()
ACC = R('page.tpl.html')

def entre(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i)]
def bloc(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i) + len(b)]

base   = entre('  :root{', '  /* ---------- héros ---------- */')
footc  = entre('  /* ---------- pied de page ---------- */', '  /* ---------- sections ---------- */')
rechc  = R('_recherche.css')
defs   = R('defs.svg')
header = bloc('<header class="site-header">', '</header>')
footer = bloc('<footer class="site-footer">', '</footer>')

SYMBOLES = set(re.findall(r'<path id="([^"]+)"', R('defs.svg')))

def vers_accueil(html):
    def sub(m):
        a = m.group(1)
        if a in SYMBOLES:            # un <use> du logo pointe sur un trace, pas sur une page
            return m.group(0)
        return 'href="index.html"' if a == 'top' else 'href="index.html#' + a + '"'
    return re.sub(r'href="#([a-z0-9\-]+)"', sub, html)

header = vers_accueil(header)
footer = vers_accueil(footer)

# l'en-tete du site flotte au-dessus du heros de l'accueil ; ici il lui faut sa place
SUPP = '''
  .site-header{position:relative; inset:auto; background:var(--fond);
    border-bottom:1px solid var(--bord)}
  .ann-tete{padding-block:clamp(26px,3.4vw,40px) 0}
  .ann-h1{margin-top:14px; font-size:clamp(25px,3.6vw,42px); line-height:1.03;
    letter-spacing:.012em; color:var(--texte)}
  .ann-h1 b{color:var(--rouge-500)}
  .ann-intro{margin-top:16px; max-width:70ch; font-size:15px; line-height:1.7;
    color:var(--texte-3)}
  .ann-intro b{color:var(--texte); font-weight:800}
  .ann-actions{margin-top:22px; padding-bottom:26px; display:flex; flex-wrap:wrap; gap:10px}
  /* le bouton secondaire vit dans la bande club de l'accueil, qu'on n'extrait pas */
  .btn-ligne{background:transparent; color:var(--texte);
    border:1px solid var(--bord-3); box-shadow:none}
  .btn-ligne:hover{border-color:var(--texte-3); color:var(--texte); background:transparent}
  .fond-seo .seo-sous:first-of-type{margin-top:0}
'''

PIN = ('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
       'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
       '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/>'
       '<circle cx="12" cy="10" r="2.6"/></svg>')
ETOILE = ('<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
          '<path d="m12 3.6 2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7Z"/></svg>')

# ---------- les salles, lues dans le meme fichier que le site ----------
src = R('_salles.js')
def tableau(nom):
    """Lit un tableau JS ecrit par gen_salles.py. Trois formes possibles :
    `= [];` (annuaire vide), `= SALLES_DEMO.slice();` (l'interrupteur
    MCC_SALLES), ou `= [` suivi d'une salle par ligne."""
    i = src.index('var %s = ' % nom) + len('var %s = ' % nom)
    if src.startswith('[];', i):
        return []
    if src.startswith('SALLES_DEMO.slice();', i):
        return tableau('SALLES_DEMO')
    return json.loads(src[i:src.index('\n];', i) + 2])

SALLES = tableau('SALLES')

# Le cahier des charges du 22/09/2026 en compte dix. Le formulaire de
# referencement les proposait deja toutes les dix, mais l'annuaire n'en
# connaissait que huit : un club qui cochait « Lutte » n'etait trouvable nulle
# part. Les deux listes doivent rester identiques.
DISCIPLINES = ['MMA', 'Boxe anglaise', 'Kickboxing', 'Muay Thaï', 'Jiu-jitsu brésilien',
               'Grappling', 'Karaté', 'Judo', 'Lutte', 'Self-défense']
# l'article et le nom tels qu'on les ecrit dans une phrase : « le judo », « de
# boxe anglaise », mais « le MMA » et « de Muay Thai » gardent leur casse.
ART = {'MMA': 'le MMA', 'Boxe anglaise': 'la boxe anglaise', 'Kickboxing': 'le kickboxing',
       'Muay Thaï': 'le Muay Thaï', 'Jiu-jitsu brésilien': 'le jiu-jitsu brésilien',
       'Grappling': 'le grappling', 'Karaté': 'le karaté', 'Judo': 'le judo',
       'Lutte': 'la lutte', 'Self-défense': 'la self-défense'}
NOM = {d: ART[d].split(' ', 1)[1] for d in ART}

def ardoise(t):
    t = unicodedata.normalize('NFD', t)
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')

# Toutes les villes couvertes ont leur page, salle ou pas : une page vide qui
# dit « pas encore de salle ici, soyez le premier » vaut mieux qu'une page
# absente, pour le gerant comme pour un moteur.
import vitrine
VILLES = list(vitrine.VILLES)

fichier_disc = lambda d: ardoise(d) + '.html'
fichier_ville = lambda v: 'sports-de-combat-' + ardoise(v) + '.html'

def echappe(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def reseau(html):
    """Remplit les liens generes : le reseau du pied de page et les menus du
    bandeau. Les deux sortent des memes listes que les pages d'annuaire, donc
    un menu ne peut pas pointer vers une page qui n'existe pas."""
    lis = lambda paires: ''.join('<li><a href="%s">%s</a></li>' % (h, echappe(t))
                                 for h, t in paires)
    html = html.replace('%%FOOTER_VILLES%%',
        lis((fichier_ville(v), 'Sports de combat à ' + v) for v in VILLES))
    html = html.replace('%%FOOTER_DISC%%',
        lis((fichier_disc(d), d) for d in DISCIPLINES))
    html = html.replace('%%MENU_VILLES%%',
        lis((fichier_ville(v), v) for v in VILLES))
    # deux colonnes de meme hauteur, comme les deux groupes titres de
    # masalledesport ; la coupe suit la liste, pas un nombre fixe
    coupe = (len(DISCIPLINES) + 1) // 2
    html = html.replace('%%MENU_DISC_A%%',
        lis((fichier_disc(d), d) for d in DISCIPLINES[:coupe]))
    html = html.replace('%%MENU_DISC_B%%',
        lis((fichier_disc(d), d) for d in DISCIPLINES[coupe:]))
    for reste in ('%%FOOTER_', '%%MENU_'):
        assert reste not in html, reste
    return html

header = reseau(header)   # le bandeau porte ses menus deroulants
footer = reseau(footer)   # et le pied de page son reseau de liens

def carte_salle(s, i):
    d = s[11]
    mot = (d.get('presentation') or [''])[0]
    if len(mot) > 190:
        mot = re.sub(r'\s+\S*$', '', mot[:188]) + '…'
    return (
      '<article class="res">'
        '<div class="res-vignette">'
          '<span class="res-num">%d</span>'
          '<span class="res-init" aria-hidden="true">%s</span>'
        '</div>'
        '<div class="res-corps">'
          '<div class="res-tete">'
            '<h2 class="res-nom"><a href="salle.html?s=%s">%s</a></h2>'
            '%s'
          '</div>'
          '<div class="res-chips">%s</div>'
          '<p class="res-adresse">%s%s</p>'
          '%s'
          '<div class="res-bas">%s%s'
          '</div>'
        '</div>'
      '</article>'
    ) % (i, s[1], d['slug'], s[0],
         # un vrai club n'a ni note ni avis : on n'affiche pas une etoile vide
         ('<span class="note">%s%s <small>(%d avis)</small></span>'
          % (ETOILE, s[6], s[7])) if s[6] else '',
         ''.join('<span class="mini-chip">%s</span>' % x for x in s[5]),
         PIN, ', '.join(x for x in [d.get('adresse'),
                                    ' '.join(y for y in [d.get('cp'), s[2]] if y)] if x),
         '<p class="res-mot">%s</p>' % mot if mot else '',
         '' if not s[9] else
         ('<span class="paire res-ouvert">Ouvert aujourd\'hui · %s</span>' % s[9]) if s[10]
           else '<span class="paire">Fermé aujourd\'hui</span>',
         # la réservation en ligne est ce que le club achète : sans Pro, la carte
         # renvoie à la fiche, où le pratiquant trouve le téléphone
         ('<a class="btn btn-rouge res-essai" href="salle.html?s=%s#essai">'
          'Séance d\'essai</a>' % d['slug']) if s[8] else
         ('<a class="btn btn-ligne res-essai" href="salle.html?s=%s">'
          'Voir la salle</a>' % d['slug']))

def vide(titre, phrase, sous, puces):
    """Ce qu'on affiche a la place de la liste quand rien n'est reference.
    Une page d'annuaire vide n'est pas une page ratee : c'est la premiere fois
    qu'un gerant voit le trou que sa salle pourrait combler, donc on le dit
    franchement et on lui tend le formulaire."""
    return ('<div class="vide">'
            '<h2 class="display">%s</h2>'
            '<p>%s</p>'
            '<button class="btn btn-rouge vide-cta" type="button" data-compte>Référencer ma salle</button>'
            '<p class="vide-sous">%s</p>'
            '<div class="vide-villes">%s</div>'
            '</div>') % (titre, phrase, sous, puces)


def liens(paires):
    return ''.join('<a class="puce" href="%s">%s</a>' % (h, t) for h, t in paires)

GABARIT = '''<title>%(titre)s</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@500;600;700;800&display=swap">
<style>
%(css)s</style>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
%(defs)s
</defs></svg>

<a class="skip" href="#resultats">Aller aux salles</a>
%(header)s
<main id="contenu">
  <div class="filtres-bloc">
    <div class="wrap ann-tete">
      <nav class="fil" aria-label="Fil d'Ariane">%(fil)s</nav>
      <h1 class="ann-h1 display">%(h1)s</h1>
      <p class="ann-intro">%(intro)s</p>
      <div class="ann-actions">%(actions)s</div>
    </div>
  </div>

  <section class="colonne-liste" id="resultats" aria-label="Salles"%(filtre)s>
    <div class="wrap"><div class="liste">%(salles)s</div></div>
  </section>

  <section class="fond-seo">
    <div class="wrap">
      <h2 class="seo-sous">%(t1)s</h2>
      <div class="seo-liens">%(l1)s</div>
      <h2 class="seo-sous">%(t2)s</h2>
      <div class="seo-liens">%(l2)s</div>
    </div>
  </section>
</main>
%(footer)s
'''

ANNJS = open('_annuaire.js', encoding='utf-8').read()

def page(titre, fil, h1, intro, actions, salles, t1, l1, t2, l2, filtre=''):
    # chaque page d'annuaire porte la fenetre de creation de l'espace club :
    # ses boutons « Referencer ma salle » l'ouvrent au lieu d'aller a clubs.html
    # `filtre` dit a _annuaire.js quelle ville ou quelle discipline cette page montre
    return compte.pose(
        GABARIT % dict(titre=titre, css=base + footc + rechc + SUPP + compte.css(), defs=defs,
                       header=header, footer=footer, fil=fil, h1=h1, intro=intro,
                       actions=actions, salles=salles, t1=t1, l1=l1, t2=t2, l2=l2,
                       filtre=filtre)) + '\n<script>\n' + ANNJS + '</script>\n'


def att(cle, valeur):
    return ' data-%s="%s"' % (cle, valeur.replace('"', '&quot;'))

FIL = '<a href="index.html">Accueil</a><i aria-hidden="true">›</i>'
ECRITS = {}

# ---------- une page par discipline ----------
for d in DISCIPLINES:
    lot = [s for s in SALLES if d in s[5]]
    lot.sort(key=lambda s: (not s[8], s[2], s[0]))
    villes = sorted({s[2] for s in lot})
    n = len(lot)
    ou = ''
    if len(villes) > 1:
        ou = ', dans %d villes' % len(villes)
    elif villes:
        ou = ', à %s' % villes[0]
    intro = ('Mon Club Combat référence <b>%d salle%s</b> où pratiquer %s en France%s. '
             'Chaque fiche donne les horaires, le planning de la semaine, l’adresse et le '
             'contact direct de la salle.' % (n, 's' if n > 1 else '', ART[d], ou))
    corps = ''.join(carte_salle(s, i + 1) for i, s in enumerate(lot))
    if not n:
        intro = ('Aucune salle de %s n’est encore référencée sur Mon Club Combat. '
                 'Nous ouvrons l’annuaire aux clubs en ce moment : si vous en dirigez '
                 'une, la fiche est gratuite et prend cinq minutes.' % NOM[d])
        corps = vide('Pas encore de salle de %s' % NOM[d],
                     'Il n’y a pas encore de salle de %s référencée sur Mon Club Combat. '
                     'Vous en dirigez une&nbsp;? Soyez le premier, c’est gratuit.' % NOM[d],
                     'Ou regardez par ville&nbsp;:',
                     liens([(fichier_ville(v), v) for v in VILLES[:8]]))
    ECRITS[fichier_disc(d)] = page(
        titre='%s : salles et clubs en France' % d,
        fil=FIL + '<a href="recherche.html">Salles de sports de combat</a>'
                  '<i aria-hidden="true">›</i><span aria-current="page">%s</span>' % d,
        h1='Salles de <b>%s</b> en France' % NOM[d],
        intro=intro,
        actions=(('<button class="btn btn-rouge" type="button" data-compte>Référencer ma salle</button>'
                  '<a class="btn btn-ligne" href="index.html#villes">Voir les villes couvertes</a>')
                 if not n else
                 ('<a class="btn btn-rouge" href="recherche.html?discipline=%s">Voir sur la carte</a>'
                  '<button class="btn btn-ligne" type="button" data-compte>Référencer ma salle</button>'
                  % d.replace(' ', '%20'))),
        salles=corps,
        t1='%s par ville' % d,
        l1=liens([('recherche.html?ville=%s&discipline=%s' % (v.replace(' ', '%20'),
                                                             d.replace(' ', '%20')),
                   '%s à %s' % (d, v)) for v in villes]) or
           liens([(fichier_ville(v), 'Sports de combat à %s' % v) for v in VILLES]),
        t2='Les autres disciplines',
        l2=liens([(fichier_disc(x), x) for x in DISCIPLINES if x != d]),
        filtre=att('discipline', d))

# ---------- une page par ville ----------
for v in VILLES:
    lot = [s for s in SALLES if s[2] == v]
    lot.sort(key=lambda s: (not s[8], s[0]))
    discs = []
    for s in lot:
        for x in s[5]:
            if x not in discs:
                discs.append(x)
    n = len(lot)
    ouverts = sum(1 for s in lot if s[10])
    intro = ('Mon Club Combat référence <b>%d salle%s</b> de sports de combat à %s, sur '
             '%d discipline%s : %s. <b>%d</b> %s ouverte%s aujourd’hui.' % (
        n, 's' if n > 1 else '', v, len(discs), 's' if len(discs) > 1 else '',
        ', '.join(discs), ouverts, 'sont' if ouverts > 1 else 'est',
        's' if ouverts > 1 else ''))
    corps = ''.join(carte_salle(s, i + 1) for i, s in enumerate(lot))
    if not n:
        intro = ('Il n’y a pas encore de salle de sports de combat référencée à %s. '
                 'Nous ouvrons l’annuaire aux clubs en ce moment : si vous dirigez une '
                 'salle à %s, la fiche est gratuite et prend cinq minutes.' % (v, v))
        corps = vide('Pas encore de salle à %s' % v,
                     'Il n’y a pas encore de salle référencée dans cette ville. '
                     'Vous dirigez un club à %s&nbsp;? Soyez le premier, c’est gratuit '
                     'et votre fiche apparaît ici.' % v,
                     'Ou regardez par discipline&nbsp;:',
                     liens([(fichier_disc(x), x) for x in DISCIPLINES]))
    ECRITS[fichier_ville(v)] = page(
        titre='Salles de sports de combat à %s' % v,
        fil=FIL + '<a href="recherche.html">Salles de sports de combat</a>'
                  '<i aria-hidden="true">›</i><span aria-current="page">%s</span>' % v,
        h1='Salles de sports de combat à <b>%s</b>' % v,
        intro=intro,
        actions=(('<button class="btn btn-rouge" type="button" data-compte>Référencer ma salle</button>'
                  '<a class="btn btn-ligne" href="index.html#villes">Voir les villes couvertes</a>')
                 if not n else
                 ('<a class="btn btn-rouge" href="recherche.html?ville=%s">Voir sur la carte</a>'
                  '<button class="btn btn-ligne" type="button" data-compte>Référencer ma salle</button>'
                  % v.replace(' ', '%20'))),
        salles=corps,
        t1='Par discipline à %s' % v,
        l1=liens([('recherche.html?ville=%s&discipline=%s' % (v.replace(' ', '%20'),
                                                             d.replace(' ', '%20')),
                   '%s à %s' % (d, v)) for d in (discs or DISCIPLINES)]),
        t2='Les sports de combat dans d’autres villes',
        l2=liens([(fichier_ville(x), 'Sports de combat à %s' % x) for x in VILLES if x != v]),
        filtre=att('ville', v))

if __name__ == '__main__':
    import os
    for nom, html in ECRITS.items():
        open(nom, 'w', encoding='utf-8').write(html)
    print('%d pages d\'annuaire' % len(ECRITS),
          '(%d disciplines + %d villes)' % (len(DISCIPLINES), len(VILLES)))
