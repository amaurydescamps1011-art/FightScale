# -*- coding: utf-8 -*-
"""Genere _salles.js : le jeu de salles partage par la recherche, l'accueil et les fiches.

Les vingt salles sont fictives. Le detail de chaque fiche (adresse, coordonnees,
presentation, planning) est derive de facon deterministe des attributs de la salle,
pour que la maquette reste coherente d'une page a l'autre sans qu'on ait a ecrire
vingt fiches a la main. Tout est a remplacer par de vraies donnees avant la mise
en service.
"""
import json, os, unicodedata

def photos_exemple():
    """Les photos de la fiche d'exemple, dans l'ordre des cinq emplacements de la
    galerie. Deposer photos/salle-exemple-N.webp suffit : l'emplacement sans photo
    garde l'aplat dessine. Meme bascule que les vignettes de villes."""
    out = []
    for n in range(1, 6):
        p = 'photos/salle-exemple-%d.webp' % n
        out.append(p if os.path.exists(p) else None)
    return out

# nom, sigle, ville, lat, lon, disciplines, note, avis, pro, horaires, ouvert
BASE = [
 ['Fight Club Marseille','FCM','Marseille',43.2860,5.3800,['MMA','Boxe anglaise','Grappling'],'4,8',124,True,'08h00 – 22h00',True],
 ['Marseille Combat Academy','MCA','Marseille',43.3050,5.3760,['Boxe anglaise','Kickboxing','Muay Thaï'],'4,7',98,False,'09h00 – 21h00',True],
 ['JJB Marseille','JJB','Marseille',43.2915,5.3595,['Jiu-jitsu brésilien','Grappling'],'4,8',76,True,'10h00 – 20h00',True],
 ['The Jungle MMA','TJM','Marseille',43.2740,5.3920,['MMA','Muay Thaï','Kickboxing'],'4,9',112,True,'08h00 – 22h00',True],
 ['Boxing Club Vieux-Port','BCV','Marseille',43.2951,5.3740,['Boxe anglaise'],'4,6',54,False,'07h00 – 21h00',True],
 ['Team Phoenix Muay Thaï','TPM','Marseille',43.3140,5.4010,['Muay Thaï','Kickboxing'],'4,7',67,True,'09h00 – 22h00',True],
 ['Académie Prado Grappling','APG','Marseille',43.2670,5.3830,['Grappling','Jiu-jitsu brésilien'],'4,5',41,False,'10h00 – 21h00',False],
 ['Estaque Fight Gym','EFG','Marseille',43.3580,5.3180,['MMA','Boxe anglaise'],'4,4',33,False,'09h00 – 21h00',True],
 ['Karaté Club Saint-Charles','KSC','Marseille',43.3030,5.3810,['Karaté','Judo'],'4,6',48,False,'17h00 – 21h00',False],
 ['MMA Factory Aix','MFA','Aix-en-Provence',43.5260,5.4400,['MMA','Grappling'],'4,7',64,False,'09h00 – 21h30',True],
 ['Aix Boxing Team','ABT','Aix-en-Provence',43.5350,5.4530,['Boxe anglaise','Kickboxing'],'4,5',37,False,'10h00 – 21h00',True],
 ['Nice Fight Academy','NFA','Nice',43.7050,7.2680,['Boxe anglaise','MMA','Muay Thaï'],'4,6',57,True,'08h30 – 21h00',True],
 ['Riviera Grappling','RG','Nice',43.7000,7.2450,['Grappling','Jiu-jitsu brésilien'],'4,5',38,False,'10h00 – 20h30',True],
 ['Paris Fight Lab','PFL','Paris',48.8700,2.3480,['MMA','Boxe anglaise','Grappling'],'4,8',203,True,'07h00 – 23h00',True],
 ['Boxing Squad République','BSR','Paris',48.8670,2.3630,['Boxe anglaise','Kickboxing'],'4,7',141,True,'08h00 – 22h00',True],
 ['JJB Paris 11','JP11','Paris',48.8580,2.3790,['Jiu-jitsu brésilien'],'4,9',96,True,'09h00 – 22h00',True],
 ['Lyon Combat Center','LCC','Lyon',45.7580,4.8420,['MMA','Muay Thaï'],'4,7',88,True,'08h00 – 22h00',True],
 ['Team Croix-Rousse Boxe','TCR','Lyon',45.7740,4.8320,['Boxe anglaise'],'4,6',52,False,'10h00 – 21h00',True],
 ['Bordeaux Combat','BC','Bordeaux',44.8420,-0.5740,['MMA','Jiu-jitsu brésilien'],'4,8',89,True,'09h00 – 22h00',True],
 ['Toulouse Fight Club','TFC','Toulouse',43.6000,1.4380,['Boxe anglaise','Kickboxing'],'4,7',71,False,'10h00 – 21h00',True],
]

# adresse (numero, voie, code postal) par salle, dans l'ordre de BASE
ADRESSES = [
 ('14', 'rue Jean-Mermoz', '13008'), ('62', 'boulevard National', '13003'),
 ('9', 'rue de Rome', '13006'),      ('108', 'avenue de Mazargues', '13008'),
 ('3', 'quai du Port', '13002'),     ('27', 'boulevard Chave', '13005'),
 ('45', 'avenue du Prado', '13006'), ('21', 'plage de l’Estaque', '13016'),
 ('12', 'square Narvik', '13001'),   ('7', 'avenue Henri-Mouret', '13090'),
 ('33', 'avenue des Belges', '13100'), ('18', 'rue Gioffredo', '06000'),
 ('54', 'boulevard Gambetta', '06000'), ('76', 'rue de la Fontaine-au-Roi', '75011'),
 ('11', 'rue du Faubourg-du-Temple', '75011'), ('29', 'rue de la Roquette', '75011'),
 ('88', 'rue de Marseille', '69007'), ('16', 'rue d’Austerlitz', '69004'),
 ('5', 'cours de la Marne', '33800'), ('40', 'allée Jean-Jaurès', '31000'),
]

RESEAUX = {  # quelques salles n'ont pas tout : une fiche gratuite est souvent incomplete
 'FCM': ('fightclubmarseille.fr', 'fightclub.marseille', 'FightClubMarseille'),
 'MCA': ('', 'marseillecombatacademy', ''),
 'JJB': ('jjb-marseille.fr', 'jjbmarseille', ''),
 'TJM': ('thejunglemma.fr', 'thejungle.mma', 'TheJungleMMA'),
 'BCV': ('', 'boxingclubvieuxport', 'BoxingClubVieuxPort'),
 'TPM': ('teamphoenix-muaythai.fr', 'teamphoenix.mt', ''),
 'APG': ('', 'prado.grappling', ''),
 'EFG': ('', '', 'EstaqueFightGym'),
 'KSC': ('karateclub-saintcharles.fr', '', ''),
 'MFA': ('mmafactory-aix.fr', 'mmafactoryaix', ''),
 'ABT': ('', 'aixboxingteam', ''),
 'NFA': ('nicefightacademy.fr', 'nicefightacademy', 'NiceFightAcademy'),
 'RG':  ('', 'rivieragrappling', ''),
 'PFL': ('parisfightlab.fr', 'parisfightlab', 'ParisFightLab'),
 'BSR': ('boxingsquad.fr', 'boxingsquad.republique', ''),
 'JP11':('jjbparis11.fr', 'jjb.paris11', ''),
 'LCC': ('lyoncombatcenter.fr', 'lyoncombatcenter', 'LyonCombatCenter'),
 'TCR': ('', 'teamcroixrousse', ''),
 'BC':  ('bordeauxcombat.fr', 'bordeaux.combat', 'BordeauxCombat'),
 'TFC': ('', 'toulousefightclub', 'ToulouseFightClub'),
}

# annee de creation et nombre d'adherents, pour donner du corps a la presentation
VIE = {
 'FCM': (2012, 310), 'MCA': (2016, 180), 'JJB': (2009, 145), 'TJM': (2014, 260),
 'BCV': (2005, 120), 'TPM': (2018, 150), 'APG': (2019, 90),  'EFG': (2017, 85),
 'KSC': (1998, 210), 'MFA': (2015, 170), 'ABT': (2013, 95),  'NFA': (2011, 190),
 'RG':  (2020, 80),  'PFL': (2010, 420), 'BSR': (2015, 300), 'JP11':(2013, 165),
 'LCC': (2012, 240), 'TCR': (2008, 110), 'BC':  (2011, 205), 'TFC': (2016, 160),
}

JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

# les creneaux types par discipline : (debut, fin, intitule, niveau)
COURS = {
 'MMA':                  [('19h00', '20h30', 'MMA', 'Tous niveaux'),
                          ('20h30', '22h00', 'MMA', 'Confirmés')],
 'Boxe anglaise':        [('12h30', '13h30', 'Boxe anglaise', 'Pause déjeuner'),
                          ('18h30', '20h00', 'Boxe anglaise', 'Tous niveaux')],
 'Kickboxing':           [('19h00', '20h30', 'Kickboxing', 'Tous niveaux')],
 'Muay Thaï':            [('18h00', '19h30', 'Muay Thaï', 'Débutants'),
                          ('19h30', '21h00', 'Muay Thaï', 'Confirmés')],
 'Jiu-jitsu brésilien':  [('12h15', '13h30', 'JJB gi', 'Tous niveaux'),
                          ('19h30', '21h00', 'JJB no-gi', 'Tous niveaux')],
 'Grappling':            [('19h00', '20h30', 'Grappling', 'Tous niveaux')],
 'Karaté':               [('17h30', '18h30', 'Karaté', 'Enfants'),
                          ('18h45', '20h15', 'Karaté', 'Adultes')],
 'Judo':                 [('17h30', '18h30', 'Judo', 'Enfants'),
                          ('18h45', '20h15', 'Judo', 'Adultes')],
}
# le samedi, un seul creneau, plus long et ouvert a tous
SAMEDI = ('10h00', '12h00', 'Sparring encadré', 'Tous niveaux')


def slug(nom):
    s = unicodedata.normalize('NFKD', nom).encode('ascii', 'ignore').decode()
    s = ''.join(c.lower() if c.isalnum() else '-' for c in s)
    while '--' in s:
        s = s.replace('--', '-')
    return s.strip('-')


# comment nommer chaque discipline dans une phrase : article, et casse respectee
# (on n'ecrit pas « le mma », ni « le Boxe anglaise »)
NOMME = {
 'MMA':                 ('le',  'MMA',                 'au'),
 'Boxe anglaise':       ('la',  'boxe anglaise',       'à la'),
 'Kickboxing':          ('le',  'kickboxing',          'au'),
 'Muay Thaï':           ('le',  'Muay Thaï',           'au'),
 'Jiu-jitsu brésilien': ('le',  'jiu-jitsu brésilien', 'au'),
 'Grappling':           ('le',  'grappling',           'au'),
 'Karaté':              ('le',  'karaté',              'au'),
 'Judo':                ('le',  'judo',                'au'),
 'Lutte':               ('la',  'lutte',               'à la'),
 'Self-défense':        ('la',  'self-défense',        'à la'),
}


def avec_article(d):
    art, nom, _ = NOMME.get(d, ('le', d.lower(), 'au'))
    return '%s %s' % (art, nom)


def minutes(h):
    return int(h[:2]) * 60 + int(h[3:])


def planning(disc, sigle):
    """Repartit les cours de la salle sur la semaine. Deux cours d'un meme jour ne
    se chevauchent jamais : une salle n'a qu'un tapis. Le dimanche est ferme."""
    sem = []
    file = []
    for d in disc:
        for c in COURS.get(d, []):
            file.append(c)
    if not file:
        file = [('19h00', '20h30', disc[0], 'Tous niveaux')]
    i = 0
    for jour in JOURS:
        if jour == 'Dimanche':
            sem.append({'jour': jour, 'cours': []})
            continue
        if jour == 'Samedi':
            sem.append({'jour': jour, 'cours': [{'de': SAMEDI[0], 'a': SAMEDI[1],
                                                 'quoi': SAMEDI[2], 'niveau': SAMEDI[3]}]})
            continue
        vise = 2 if len(file) > 2 else 1
        pris = []
        # on parcourt la file une fois au plus : on prend les creneaux qui ne
        # chevauchent pas ceux deja retenus, et on s'arrete des qu'on en a assez
        for k in range(len(file)):
            c = file[(i + k) % len(file)]
            if any(minutes(c[0]) < minutes(p['a']) and minutes(p['de']) < minutes(c[1])
                   for p in pris):
                continue
            pris.append({'de': c[0], 'a': c[1], 'quoi': c[2], 'niveau': c[3]})
            if len(pris) == vise:
                i += k + 1
                break
        else:
            i += len(file)
        pris.sort(key=lambda c: minutes(c['de']))
        sem.append({'jour': jour, 'cours': pris})
    return sem


# Les equipements et les avis : masalledesport en met sur chaque fiche, et une
# fiche de salle sans eux ne dit pas grand-chose. Comme le reste du jeu de
# donnees, ils sont fictifs et derives de facon deterministe de la salle.
EQUIPEMENTS = [
    ('Cage MMA',            'cage',      ['MMA']),
    ('Ring de boxe',        'ring',      ['Boxe anglaise', 'Kickboxing', 'Muay Thaï']),
    ('Tatami',              'tatami',    ['Jiu-jitsu brésilien', 'Grappling', 'Judo', 'Karaté', 'Lutte']),
    ('Sacs de frappe',      'sac',       ['MMA', 'Boxe anglaise', 'Kickboxing', 'Muay Thaï']),
    ('Espace musculation',  'muscu',     None),
    ('Douches',              'douche',    None),
    ('Casiers',             'casier',    None),
    ('Prêt de matériel',    'materiel',  None),
]

def equipements(disc, sigle):
    """Ce que la salle possede : ce qu'imposent ses disciplines, plus le commun."""
    out = []
    for nom, ic, exige in EQUIPEMENTS:
        if exige is None:
            out.append((nom, ic))
        elif any(d in exige for d in disc):
            out.append((nom, ic))
    # les casiers et le pret de materiel ne sont pas dans toutes les salles
    h = sum(ord(c) for c in sigle)
    if h % 3 == 0:
        out = [e for e in out if e[0] != 'Casiers']
    if h % 4 == 0:
        out = [e for e in out if e[0] != 'Prêt de matériel']
    return out

PRENOMS = ['Karim', 'Julie', 'Mehdi', 'Camille', 'Thomas', 'Sofia', 'Antoine', 'Lina',
           'Nicolas', 'Sarah', 'Yanis', 'Claire', 'Mathieu', 'Inès', 'Romain', 'Léa']
# le mois de reference de la maquette, pour que les avis restent dans le passe
AN_REF, MOIS_REF = 2026, 8   # septembre 2026, index 0
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
        'août', 'septembre', 'octobre', 'novembre', 'décembre']
MODELES = [
    "J'ai commencé {art} ici sans aucun niveau. On m'a pris en main dès le premier cours, "
    "personne ne m'a fait sentir que j'étais débutant.",
    "Les cours sont vraiment séparés par niveau, ce qui change tout. On travaille la technique "
    "avant de sparrer, et le coach corrige un par un.",
    "Bonne ambiance, salle propre, horaires qui tiennent. Le créneau du midi me sauve les "
    "semaines chargées.",
    "Le niveau monte vite parce que les partenaires sont sérieux. Ça reste bon enfant, "
    "personne ne cherche à taper fort pour le plaisir.",
    "Séance d'essai gratuite et sans pression commerciale derrière. J'ai signé la semaine "
    "suivante, deux ans après j'y suis toujours.",
]

def avis_clients(sigle, disc, note, nb):
    """Trois avis dates, deterministes, avec des notes qui encadrent la moyenne."""
    h = sum(ord(c) * (i + 3) for i, c in enumerate(sigle))
    moy = float(note.replace(',', '.'))
    out = []
    for k in range(3):
        n = min(5, max(3, round(moy) + (1 if k == 0 else (-1 if k == 2 and moy < 4.9 else 0))))
        # on recule de 1 a 18 mois depuis le mois courant : un avis date du futur
        # se voit tout de suite et decredibilise la fiche.
        recul = 1 + (h + k * 5) % 18
        m = (MOIS_REF - recul) % 12
        an = AN_REF + (MOIS_REF - recul) // 12
        mois = MOIS[m]
        texte = MODELES[(h + k * 2) % len(MODELES)].replace('{art}', avec_article(disc[0]))
        out.append({'nom': PRENOMS[(h + k * 7) % len(PRENOMS)], 'note': n,
                    'date': '%s %d' % (mois, an), 'texte': texte})
    return out

def presentation(nom, ville, disc, sigle):
    an, adh = VIE[sigle]
    autres = [avec_article(d) for d in disc[1:]]
    p1 = ('%s accueille les pratiquants de %s depuis %d. La salle compte aujourd’hui '
          'environ %d adhérents, du débutant qui n’a jamais mis de gants au compétiteur '
          'qui prépare sa saison.' % (nom, ville, an, adh))
    if autres:
        liste = ', '.join(autres[:-1]) + ' et ' + autres[-1] if len(autres) > 1 else autres[0]
        p2 = ('La discipline principale est %s, et la salle enseigne aussi %s. '
              'Les cours sont séparés par niveau, et les créneaux du midi sont ouverts '
              'à tous.' % (avec_article(disc[0]), liste))
    else:
        _, nom_d, a_d = NOMME.get(disc[0], ('le', disc[0].lower(), 'au'))
        p2 = ('La salle est entièrement consacrée %s %s. Les cours sont séparés par '
              'niveau, et le créneau du midi est ouvert à tous.' % (a_d, nom_d))
    p3 = ('Premier cours d’essai gratuit : venez avec une tenue de sport, '
          'le matériel est prêté sur place.')
    return [p1, p2, p3]


sorties = []
for i, s in enumerate(BASE):
    nom, sigle, ville, lat, lon, disc, note, avis, pro, horaires, ouvert = s
    num, voie, cp = ADRESSES[i]
    site, insta, fb = RESEAUX[sigle]
    an, adh = VIE[sigle]
    # un numero de telephone fictif mais bien forme, stable pour une salle donnee
    tel = '0%d %02d %02d %02d %02d' % (
        4 if ville in ('Marseille', 'Aix-en-Provence', 'Nice', 'Lyon') else
        (1 if ville == 'Paris' else 5),
        10 + i, 20 + i * 3 % 70, 30 + i * 7 % 60, 40 + i * 11 % 50)
    detail = {
        'slug': slug(nom),
        'adresse': '%s %s' % (num, voie),
        'cp': cp,
        'tel': tel,
        'mail': 'contact@%s.fr' % slug(nom),
        'site': site,
        'insta': insta,
        'fb': fb,
        'depuis': an,
        'adherents': adh,
        'presentation': presentation(nom, ville, disc, sigle),
        'planning': planning(disc, sigle),
        'equipements': equipements(disc, sigle),
        'avis': avis_clients(sigle, disc, note, avis),
    }
    sorties.append(s + [detail])

# Aucune salle n'est referencee tant qu'un club n'a pas donne son accord (decision
# d'Amaury du 22/09/2026). L'annuaire est donc vide par defaut : SALLES reste une
# liste vide, et le jeu fictif part dans SALLES_DEMO, qui ne sert qu'a montrer a
# un gerant la tete de sa future fiche.
#
#   MCC_SALLES=1 python3 gen_salles.py
#
# remet le jeu dans SALLES : tout le site suit de lui-meme, l'accueil bascule de
# l'offre de lancement vers « Les salles referencees », les pages de ville et de
# discipline se remplissent et la recherche rend des resultats. C'est le seul
# interrupteur ; il sert a verifier la bascule, et le jour ou de vraies fiches
# arrivent elles prennent simplement la place de `sorties`.
import os
PUBLIEES = os.environ.get('MCC_SALLES') == '1'
js = ['/* Annuaire vide par defaut : aucune salle n\'est referencee sans l\'accord',
      '   du club. MCC_SALLES=1 python3 gen_salles.py remplit SALLES pour verifier',
      '   la bascule. SALLES_DEMO ne sert qu\'a la fiche d\'exemple. */',
      'var SALLES_DEMO = [']
for s in sorties:
    js.append('  ' + json.dumps(s, ensure_ascii=False) + ',')
js[-1] = js[-1][:-1]
js.append('];')
js.append('')
js.append('var SALLES = ' + ('SALLES_DEMO.slice();' if PUBLIEES else '[];'))
# le nom de la discipline tel qu'on l'ecrit dans une phrase : « de boxe anglaise »
# et non « de Boxe anglaise », mais « de MMA » et « de Muay Thai » gardent leur casse
js.append('/* le nom de la discipline tel qu\'on l\'ecrit au fil d\'une phrase */')
js.append('var NOM_DISC = ' + json.dumps(
    {d: NOMME[d][1] for d in NOMME}, ensure_ascii=False, indent=0).replace('\n', ' ') + ';')
js.append("function nomDiscipline(d){ return NOM_DISC[d] || d; }")

# La fiche d'exemple : un seul club, renomme pour qu'on ne puisse pas le prendre
# pour une vraie salle referencee. Elle ne sert qu'a montrer a un gerant la tete
# de sa future fiche, depuis la page « Referencer ma salle ».
js.append('''
/* La fiche d'exemple, montree depuis « Referencer ma salle » (salle.html?demo=1).
   Elle n'est dans aucun index : ni la recherche ni l'annuaire ne la voient. */
var SALLE_DEMO = (function (){
  var s = SALLES_DEMO[0].slice();
  s[0] = 'Club Exemple';
  s[1] = 'EX';
  s[11] = JSON.parse(JSON.stringify(s[11]));
  s[11].slug = 'exemple';
  s[11].presentation = [
    'Cette fiche est un exemple : ce club n\\'existe pas. Elle montre ce qu\\'un club '
    + 'obtient gratuitement sur Mon Club Combat, avec ses vraies informations a la place '
    + 'de celles-ci.',
    'Les disciplines, le planning de la semaine, les horaires, l\\'adresse et les moyens '
    + 'de contact sont remplis par le club lui-meme, et modifiables a tout moment.'
  ];
  s[11].photos = %%PHOTOS%%;
  return s;
})();

/* index par identifiant d'URL, pour que recherche.html et index.html puissent
   pointer vers salle.html?s=<slug> */
var PAR_SLUG = {};
SALLES.forEach(function (s){ PAR_SLUG[s[11].slug] = s; });
function salleParSlug(sl){ return PAR_SLUG[sl] || null; }
function lienFiche(s){ return 'salle.html?s=' + encodeURIComponent(s[11].slug); }

/* Les pages d'annuaire, une par discipline et une par ville (build_annuaire.py).
   Le meme calcul d'identifiant des deux cotes, sinon les liens tombent a cote. */
function ardoise(t){
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function pageDiscipline(d){ return ardoise(d) + '.html'; }
function pageVille(v){ return 'sports-de-combat-' + ardoise(v) + '.html'; }

/* Les villes qui ont leur page d'annuaire. Elles l'ont toutes, salle ou pas :
   une ville sans salle affiche son etat vide et propose au gerant de referencer
   la sienne. La liste est celle de build_annuaire.VILLES, ecrite au build. */
var VILLES_AVEC_SALLE = %%VILLES%%;
''')

import vitrine
sortie = '\n'.join(js) + '\n'
sortie = sortie.replace('%%VILLES%%', json.dumps(vitrine.VILLES, ensure_ascii=False))
PH = photos_exemple()
sortie = sortie.replace('%%PHOTOS%%', json.dumps(PH, ensure_ascii=False))
assert '%%VILLES%%' not in sortie and '%%PHOTOS%%' not in sortie
open('_salles.js', 'w', encoding='utf-8').write(sortie)
print('_salles.js', sum(len(l) for l in js), 'octets,', len(sorties),
      'salles en demonstration,', sum(1 for x in PH if x), 'photos sur la fiche d\'exemple')
