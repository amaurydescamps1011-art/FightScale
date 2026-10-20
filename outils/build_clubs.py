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
         'confidentialite', 'conditions', 'acquisition', 'agence', 'annuler']
QUI = 'clubs'
for _p in PAGES:
    if '--' + _p in sys.argv: QUI = _p
CORPS = {'clubs': '_clubs.body.html', 'referencer': '_referencer.body.html',
         'espace-club': '_espace.body.html', 'admin': '_admin.body.html',
         'motdepasse': '_motdepasse.body.html',
         'mon-compte': '_mon_compte.body.html',
         'confidentialite': '_confidentialite.body.html',
         'conditions': '_conditions.body.html',
         'acquisition': '_acquisition.body.html',
         'agence': '_landing.body.html',
         'annuler': '_annuler.body.html'}
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

# Depuis les pages legales, les ancres de la page agence remontent a sa racine ;
# les <use href="#mcc-..."> du logo pointent sur un trace, pas sur une page.
def vers_racine(html):
    return re.sub(r'href="#([a-z0-9\-]+)"',
                  lambda m: m.group(0) if m.group(1) in SYMBOLES else 'href="/#%s"' % m.group(1), html)

header = vers_accueil(header, {'top': 'index.html'})
# on est deja sur la page clubs : le bouton du menu descend au bloc de creation
# sur la page de vente le bouton descend au bloc de creation ; sur la page de la fiche
# il ramene a la page de vente, ou le parcours commence
ANCRE = '#creer' if QUI == 'clubs' else 'clubs.html'
header = header.replace('href="clubs.html"', 'href="%s"' % ANCRE)
footer = vers_accueil(footer, {'top': 'index.html'})
footer = footer.replace('href="clubs.html"', 'href="%s"' % ANCRE)
# Amaury, 24/09/2026 : sur la page Referencer votre salle, « Referencer ma
# salle » demande tout de suite de creer le compte, bandeau et pied compris.
if QUI == 'clubs':
    header = header.replace('href="#creer"><span class="l-long">', 'href="#creer" data-compte><span class="l-long">')
    header = header.replace('<a href="#creer">Référencer ma salle</a>', '<a href="#creer" data-compte>Référencer ma salle</a>')
    header = header.replace('<a class="nav-mob-a" href="#creer">Référencer ma salle</a>', '<a class="nav-mob-a" href="#creer" data-compte>Référencer ma salle</a>')
    footer = footer.replace('<a href="#creer">Référencer ma salle</a>', '<a href="#creer" data-compte>Référencer ma salle</a>')
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
    # retour au site public : une maison
    'I_SITE': icone('<path d="M4 10.6 12 4l8 6.6V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19Z"/>'
                    '<path d="M9.6 20.6v-5.4h4.8v5.4"/>'),
    # l'agence d'acquisition : un porte-voix
    'I_AGENCE': icone('<path d="M3.8 10.2v3.6a1.2 1.2 0 0 0 1.2 1.2h2.4l7.8 4.2V4.8L7.4 9H5a1.2 1.2 0 0 0-1.2 1.2Z"/>'
                      '<path d="M8.6 15.2 10 20.2"/><path d="M18.4 9a4 4 0 0 1 0 6"/>'),
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

# Les icones Lucide de la page agence (traits de 2, 24 x 24), partagees avec
# la page d'annulation du rendez-vous, qui porte la meme coque.
trait = lambda d, w=16: ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                         'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                         % (w, w) + d + '</svg>')
LANDING = {
    'FLECHE': trait('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', 18),
    # icones Lucide de la page refaite sur le modele Squale (19/10/2026) :
    # megaphone, message-circle, calendar-check (le constat 01 02 03), hand-fist
    # (le poing : logo de la salle dans les telephones, pastille, bandeau),
    # layout-template, mail-check, phone-call, mouse-pointer-click, handshake
    # (le schema « qui fait quoi »), heart, send, bookmark, chevron-right, check,
    # trending-up, users (les ecrans dessines et les avatars du bandeau)
    'I_MEGAPHONE': trait('<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>'
                         '<path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>', 24),
    'I_MESSAGE': trait('<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 '
                       '10 10 0 1 0-4.777-4.719"/>', 24),
    'I_CALCHECK': trait('<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>'
                        '<path d="m9 15 2 2 4-4"/>', 24),
    'I_POING': trait('<path d="M12.035 17.012a3 3 0 0 0-3-3l-.311-.002a.72.72 0 0 1-.505-1.229l1.195-1.195A2 2 0 0 1 10.828 11H12'
                     'a2 2 0 0 0 0-4H9.243a3 3 0 0 0-2.122.879l-2.707 2.707A4.83 4.83 0 0 0 3 14a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V7'
                     'a2 2 0 1 0-4 0v2a2 2 0 1 0 4 0"/><path d="M13.888 9.662A2 2 0 0 0 17 8V5A2 2 0 1 0 13 5"/>'
                     '<path d="M9 5A2 2 0 1 0 5 5V10"/><path d="M9 7V4A2 2 0 1 1 13 4V7.268"/>', 24),
    'I_PAGE': trait('<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/>'
                    '<rect width="5" height="7" x="16" y="14" rx="1"/>', 24),
    'I_MAILCHECK': trait('<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/>'
                         '<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/>', 24),
    'I_APPEL': trait('<path d="M13 2a9 9 0 0 1 9 9"/><path d="M13 6a5 5 0 0 1 5 5"/>'
                     '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2'
                     'A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 '
                     '14 14 0 0 0 6.392 6.384"/>', 24),
    'I_CLIC': trait('<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/>'
                    '<path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739'
                    'l-1.04 4.35a.5.5 0 0 1-.95.074z"/>', 24),
    'I_POIGNEE': trait('<path d="m11 17 2 2a1 1 0 1 0 3-3"/>'
                       '<path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81'
                       'a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/>'
                       '<path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>', 24),
    'I_COEUR': trait('<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5'
                     'l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>', 24),
    'I_ENVOI': trait('<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937'
                     'l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>', 24),
    'I_MARQUE': trait('<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578'
                      'A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>', 24),
    'I_CHEVRON_D': trait('<path d="m9 18 6-6-6-6"/>', 24),
    'I_CHECK': trait('<path d="M20 6 9 17l-5-5"/>', 24),
    'I_COURBE': trait('<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>', 24),
    'I_GENS': trait('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/>'
                    '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>', 24),
    # la prise de rendez-vous (19/10/2026) : clock, check, chevron-left, video, phone,
    # calendar-check, cloud-off, calendar-x, mail, calendar-x2 (page annuler)
    'I_RDV_HORLOGE': trait('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', 14),
    'I_RDV_COCHE': trait('<path d="M20 6 9 17l-5-5"/>', 13),
    'I_RDV_RETOUR': trait('<path d="m15 18-6-6 6-6"/>', 18),
    'I_RDV_VISIO': trait('<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>'
                         '<rect x="2" y="6" width="14" height="12" rx="2"/>', 16),
    'I_RDV_TEL': trait('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 '
                       '19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 '
                       '2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 '
                       '2.81.7A2 2 0 0 1 22 16.92z"/>', 16),
    'I_RDV_RECAP': trait('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/>'
                         '<path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>', 16),
    'I_RDV_PANNE': trait('<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/>'
                         '<path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>', 22),
    'I_RDV_AGENDA': trait('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/>'
                          '<path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/>', 22),
    'I_RDV_MAIL': trait('<rect width="20" height="16" x="2" y="4" rx="2"/>'
                        '<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', 18),
    'I_RDV_OK': trait('<path d="M20 6 9 17l-5-5"/>', 28),
    'I_RDV_X': trait('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 28),
    # shield-check, target, image, mails (la refonte du 20/10 : les trois points
    # et la colonne « Inclus » du schema)
    'I_BOUCLIER': trait('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72'
                        'a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>', 24),
    'I_CIBLE': trait('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', 24),
    'I_IMAGE': trait('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/>'
                     '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>', 24),
    'I_MAILS': trait('<path d="M17 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><rect width="16" height="12" x="6" y="3" rx="2"/>'
                     '<path d="m22 5-7.17 4.3a2 2 0 0 1-1.66 0L6 5"/>', 24),
    'I_FORMULAIRE': trait('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'
                          '<path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>', 24),
    'I_PORTE': trait('<path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/>'
                     '<path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/>', 24),
    'I_RDV_FERMER': trait('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 22),
}

# La page de conversion de l'agence (Amaury, 09/10/2026 : « une landing page
# simple basee sur la conversion ») : son bandeau sans menu et son pied sont
# dans son corps, un seul but, reserver un appel.
# Les quatre pages de l'agence (la page elle-meme, les deux pages legales et
# l'annulation du rendez-vous) ne portent ni la fenetre du compte, ni le client
# Supabase, ni la CSS du site public : elles n'en ont pas besoin, et la page
# agence pesait 268 Ko (relecture du 19/10/2026). De sb.js, la page agence et
# la page d'annulation n'utilisent que MCC.RDV_API et MCC.CLE_PUBLIQUE : un
# script en ligne de trois lignes les pose (constantes lues dans sb.js, pour
# n'avoir qu'une source), et sb.js n'est plus charge.
LEGER = QUI in ('agence', 'confidentialite', 'conditions', 'annuler')
if LEGER:
    clubc = ''
if QUI == 'agence':
    header = footer = ''
    clubc = R('_agence.css') + R('_landing.css')
    # les notes de travail du corps (<!-- ... -->) restent dans la source, pas dans la page servie
    body = re.sub(r'<!--.*?-->\n?', '', body, flags=re.S)
    for k, v in LANDING.items():
        body = body.replace('%%' + k + '%%', v)
    # Chaque nouvelle VSL garde le meme nom de fichier : l'adresse porte donc
    # l'empreinte du fichier, sinon le telephone d'Amaury rejoue l'ancienne
    # depuis son cache (19/10/2026). Elle change toute seule a chaque version.
    import hashlib, os
    def empreinte(rel):
        f = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', rel)
        return hashlib.md5(open(f, 'rb').read()).hexdigest()[:10]
    body = (body.replace('%%V_VSL%%', empreinte('video/vsl-agence.mp4'))
                .replace('%%V_AFFICHE%%', empreinte('video/vsl-agence-affiche.webp')))

# Depuis le 18/10/2026 le site ne porte plus que l'agence (Amaury : « le truc
# principal maintenant c'est vraiment l'agence (...) enleve les autres pages ») :
# les pages legales prennent le bandeau et le pied de la page agence, pour ne
# renvoyer nulle part ailleurs qu'a elle.
if QUI in ('confidentialite', 'conditions', 'annuler'):
    LP = R('_landing.body.html')
    i = LP.index('<header class="lp-tete">'); j = LP.index('</header>', i) + len('</header>')
    header = (LP[i:j].replace('href="#contenu"', 'href="/"')
                     .replace('href="#appel" data-appel', 'href="/#appel"'))
    i = LP.index('<footer class="lp-pied">'); j = LP.index('</footer>', i) + len('</footer>')
    footer = vers_racine(LP[i:j])
    clubc = R('_agence.css') + R('_landing.css') + R('_legal.css')
# La page d'annulation du rendez-vous (lien recu par e-mail) : meme coque que les
# pages legales, et les icones du widget de reservation ; ses notes de travail
# restent dans la source.
if QUI == 'annuler':
    body = re.sub(r'<!--.*?-->\n?', '', body, flags=re.S)
    for k, v in LANDING.items():
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
         'acquisition': 'Acquisition de leads | Mon Club Combat',
         'agence': 'Remplissez votre salle | Mon Club Combat',
         'annuler': 'Annuler mon rendez-vous | Mon Club Combat'}[QUI]

POLICES = ('https://fonts.googleapis.com/css2?'
           + ('' if LEGER else 'family=Anton&')
           + 'family=Manrope:wght@500;600;700;800'
           + '&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,700;1,800&display=swap')
CSS = base + eyeb + clubc if LEGER else base + eyeb + footc + clubc + compte.css()
page = (
'''<title>''' + TITRE + '''</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="''' + POLICES + '''">
<style>
''' + CSS + '''</style>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
''' + defs + '''
</defs></svg>
''' + body)

# Les deux pages portent la fenetre. Sur la page de vente c'est elle qui ouvre le
# compte ; sur la page de la fiche elle sert de rattrapage quand on arrive sans
# session (lien recu par e-mail, onglet rouvert le lendemain) : MCC.exigeCompte()
# l'ouvre en mode connexion au lieu de renvoyer sur une page de plus.
if LEGER:
    # window.MCC reduit a ce que la page agence et la page d'annulation lisent :
    # l'adresse de l'API de rendez-vous (les tests posent window.MCC_RDV_API
    # avant, pour viser un serveur local) et la cle publique, lues dans sb.js
    if QUI in ('agence', 'annuler'):
        import os
        sbjs = R(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sb.js'))
        url_base = re.search(r"var URL_BASE = '([^']+)'", sbjs).group(1)
        cle = re.search(r"var CLE = '([^']+)'", sbjs).group(1)
        page = page + ('\n<script>\nwindow.MCC = { RDV_API: window.MCC_RDV_API || %r, CLE_PUBLIQUE: %r };\n</script>\n'
                       % (url_base + '/functions/v1/rdv', cle))
else:
    page = compte.pose(page)
# le script propre a la page, pose apres la fenetre : il compte sur window.MCC,
# que compte.pose() (ou le script en ligne des pages legeres) vient de poser
APRES = {'referencer': '_referencer.sb.js', 'espace-club': '_espace.js', 'admin': '_admin.js',
         'motdepasse': '_motdepasse.js', 'mon-compte': '_mon_compte.js',
         'acquisition': '_acquisition.js', 'agence': '_landing.js'}
if QUI in APRES:
    page = page + '\n<script>\n' + R(APRES[QUI]) + '</script>\n'
# le rail en dernier : il lit window.MCC, pose par compte.pose(), et n'a besoin
# d'aucun des scripts de page -- il marche meme si l'un d'eux echoue
if QUI in PRO:
    page = page + '\n<script>\n' + R('_pro.js') + '</script>\n'
open(QUI + '.html', 'w', encoding='utf-8').write(page)
print(QUI + '.html', len(page))
