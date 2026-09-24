# -*- coding: utf-8 -*-
"""Assemble clubs.html a partir des morceaux communs a la page d'accueil."""
import re

R = lambda n: open(n, encoding='utf-8').read()

# on extrait l'en-tete, le pied de page et les CSS communs de la page d'accueil,
# pour qu'ils ne divergent jamais entre les deux pages
ACC = R('page.tpl.html')

def entre(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i)]

def bloc(a, b):
    i = ACC.index(a); return ACC[i:ACC.index(b, i) + len(b)]

base   = entre('  :root{', '  /* ---------- héros ---------- */')
eyeb   = entre('  .eyebrow{', '  .hero h1{')
footc  = entre('  /* ---------- pied de page ---------- */', '  /* ---------- sections ---------- */')
clubc  = R('_clubs.css')
defs   = R('defs.svg')
header = bloc('<header class="site-header">', '</header>')
footer = bloc('<footer class="site-footer">', '</footer>')
import sys, compte
# Huit pages sortent du meme assemblage : la page de vente, le formulaire de la
# fiche, l'espace club, le back-office, le nouveau mot de passe, la page du
# compte, et les deux pages legales (Google les exige pour la connexion). Elles partagent en-tete, pied de page et CSS, donc elles ne peuvent pas
# diverger de l'accueil.
PAGES = ['clubs', 'referencer', 'espace-club', 'admin', 'motdepasse', 'mon-compte',
         'confidentialite', 'conditions', 'acquisition']
QUI = 'clubs'
for _p in PAGES:
    if '--' + _p in sys.argv: QUI = _p
CORPS = {'clubs': '_clubs.body.html', 'referencer': '_referencer.body.html',
         'espace-club': '_espace.body.html', 'admin': '_admin.body.html',
         'motdepasse': '_motdepasse.body.html',
         'mon-compte': '_mon_compte.body.html',
         'confidentialite': '_confidentialite.body.html',
         'conditions': '_conditions.body.html',
         'acquisition': '_acquisition.body.html'}
body   = R(CORPS[QUI])

# depuis la page clubs, les liens du menu et du pied de page renvoient a l'accueil
SYMBOLES = set(re.findall(r'<path id="([^"]+)"', R('defs.svg')))

def vers_accueil(html, local):
    def sub(m):
        a = m.group(1)
        if a in SYMBOLES:            # un <use> du logo pointe sur un trace, pas sur une page
            return m.group(0)
        return 'href="%s"' % (local[a] if a in local else 'index.html#' + a)
    return re.sub(r'href="#([a-z0-9\-]+)"', sub, html)

header = vers_accueil(header, {'top': 'index.html'})
# on est deja sur la page clubs : le bouton du menu descend au bloc de creation
# sur la page de vente le bouton descend au bloc de creation ; sur la page de la fiche
# il ramene a la page de vente, ou le parcours commence
ANCRE = '#creer' if QUI == 'clubs' else 'clubs.html'
header = header.replace('href="clubs.html"', 'href="%s"' % ANCRE)
footer = vers_accueil(footer, {'top': 'index.html'})
footer = footer.replace('href="clubs.html"', 'href="%s"' % ANCRE)
import build_annuaire as ann
footer = ann.reseau(footer)
header = ann.reseau(header)

CHECK = ('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         '<path d="M4.5 12.6 9.6 17.7 19.5 6.9"/></svg>')
CHECKBIG = CHECK.replace('width="15" height="15"', 'width="26" height="26"')

CROIX = ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
         '<path d="M6 6 18 18M18 6 6 18"/></svg>')

APPAREIL = ('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            '<path d="M3.6 8.4h3.2l1.4-2.3h7.6l1.4 2.3h3.2a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 '
            '1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 17.4V10a1.6 1.6 0 0 1 1.6-1.6Z"/>'
            '<circle cx="12" cy="13.4" r="3.4"/></svg>')

# La maquette de fiche montre une vraie photo de salle quand elle est deposee, et
# retombe sur la bande dessinee sinon : le gerant voit ce qu'il obtiendra, pas un
# rectangle gris qui se lit comme une image cassee (Amaury, 22/09/2026).
import gen_salles
_ph = [x for x in gen_salles.photos_exemple() if x]
OB_VISUEL = ('<img class="ob-photo" src="%s" alt="" width="1600" height="800" loading="lazy" '
             'decoding="async">' % _ph[0] if _ph
             else APPAREIL + '<span>Votre photo</span>')

# ---- l'espace pro ----
# Amaury, 23/09/2026 : « c'est comme si c'etait un peu deux sites differents (...)
# ca doit etre comme un logiciel, avec sur le cote : l'espace club, modifie ma
# fiche, mon compte, back-office ». Quatre pages portent donc une autre coque :
# un rail a gauche au lieu du bandeau public, et pas de pied de page a liens de
# villes -- il s'adresse aux pratiquants.
PRO = {'referencer', 'espace-club', 'admin', 'mon-compte'}

def icone(d, w=18):
    return ('<svg viewBox="0 0 24 24" width="%d" height="%d" fill="none" stroke="currentColor" '
            'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" '
            'aria-hidden="true">%s</svg>' % (w, w, d))

ICONES = {
    # un tableau de bord : quatre pave
    'I_BORD': icone('<rect x="3.4" y="3.4" width="7.4" height="7.4" rx="1.6"/>'
                    '<rect x="13.2" y="3.4" width="7.4" height="7.4" rx="1.6"/>'
                    '<rect x="3.4" y="13.2" width="7.4" height="7.4" rx="1.6"/>'
                    '<rect x="13.2" y="13.2" width="7.4" height="7.4" rx="1.6"/>'),
    # une fiche : une feuille avec ses lignes
    'I_FICHE': icone('<path d="M14 2.8H6.6A1.8 1.8 0 0 0 4.8 4.6v14.8a1.8 1.8 0 0 0 1.8 1.8h10.8a1.8 '
                     '1.8 0 0 0 1.8-1.8V7.6Z"/><path d="M14 2.8v4.8h5.2"/>'
                     '<path d="M8.4 12.6h7.2M8.4 16.6h7.2"/>'),
    # un compte : une personne
    'I_COMPTE': icone('<circle cx="12" cy="8" r="3.6"/>'
                      '<path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0"/>'),
    # le back-office : un trousseau de reglages
    'I_ADMIN': icone('<path d="M4 7.2h10M18 7.2h2M4 16.8h2M10 16.8h10"/>'
                     '<circle cx="16" cy="7.2" r="2.2"/><circle cx="8" cy="16.8" r="2.2"/>'),
    # sortir : une porte avec la fleche dehors
    'I_SORTIE': icone('<path d="M9.6 20.4H5.8A1.8 1.8 0 0 1 4 18.6V5.4a1.8 1.8 0 0 1 1.8-1.8h3.8"/>'
                      '<path d="M15.2 16.4 19.6 12l-4.4-4.4"/><path d="M19.6 12H9.6"/>'),
}

# L'espace agence a son bandeau et son pied a lui (Amaury, 24/09/2026 : « c'est
# encore un autre espace, c'est l'espace agence »)
if QUI == 'acquisition':
    header = R('_agence_tete.html')
    footer = R('_agence_pied.html')
    clubc = clubc + R('_agence.css')
    trait = lambda d: ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                       'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                       + d + '</svg>')
    AGENCE = {
        'FLECHE': trait('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'),
        'COCHE': trait('<path d="m5 12.5 4.2 4.2L19 7"/>'),
        'I_AGENDA': trait('<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
                          '<path d="m9 15 2 2 4-4"/>'),
        'I_SUIVI': trait('<circle cx="9" cy="8" r="3.4"/><path d="M3 20c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/>'
                         '<path d="m15.5 11.5 2 2 3.5-3.8"/>'),
    }
    for k, v in AGENCE.items():
        body = body.replace('%%' + k + '%%', v)

if QUI in PRO:
    coque = R('_pro.html')
    for k, v in ICONES.items():
        coque = coque.replace('%%' + k + '%%', v)
    header = coque
    footer = R('_pro_pied.html')
    clubc = clubc + R('_pro.css')

body = (body.replace('%%HEADER%%', header).replace('%%FOOTER%%', footer)
            .replace('%%CHECKBIG%%', CHECKBIG).replace('%%CHECK%%', CHECK)
            .replace('%%OB_VISUEL%%', OB_VISUEL)
            .replace('%%APPAREIL%%', APPAREIL).replace('%%CROIX%%', CROIX))

TITRE = {'clubs': 'Référencer ma salle | Mon Club Combat',
         'referencer': 'La fiche de votre salle | Mon Club Combat',
         'espace-club': 'Mon espace club | Mon Club Combat',
         'admin': 'Back-office | Mon Club Combat',
         'motdepasse': 'Nouveau mot de passe | Mon Club Combat',
         'mon-compte': 'Mon compte | Mon Club Combat',
         'confidentialite': 'Politique de confidentialité | Mon Club Combat',
         'conditions': "Conditions d'utilisation | Mon Club Combat",
         'acquisition': 'Acquisition de leads | Mon Club Combat'}[QUI]

page = (
'''<title>''' + TITRE + '''</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@500;600;700;800&display=swap">
<style>
''' + base + eyeb + footc + clubc + compte.css() + '''</style>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
''' + defs + '''
</defs></svg>
''' + body)

# Les deux pages portent la fenetre. Sur la page de vente c'est elle qui ouvre le
# compte ; sur la page de la fiche elle sert de rattrapage quand on arrive sans
# session (lien recu par e-mail, onglet rouvert le lendemain) : MCC.exigeCompte()
# l'ouvre en mode connexion au lieu de renvoyer sur une page de plus.
page = compte.pose(page)
# le script propre a la page, pose apres la fenetre : il compte sur window.MCC,
# que compte.pose() vient de charger
APRES = {'referencer': '_referencer.sb.js', 'espace-club': '_espace.js', 'admin': '_admin.js',
         'motdepasse': '_motdepasse.js', 'mon-compte': '_mon_compte.js',
         'acquisition': '_acquisition.js'}
if QUI in APRES:
    page = page + '\n<script>\n' + R(APRES[QUI]) + '</script>\n'
# le rail en dernier : il lit window.MCC, pose par compte.pose(), et n'a besoin
# d'aucun des scripts de page -- il marche meme si l'un d'eux echoue
if QUI in PRO:
    page = page + '\n<script>\n' + R('_pro.js') + '</script>\n'
open(QUI + '.html', 'w', encoding='utf-8').write(page)
print(QUI + '.html', len(page))
