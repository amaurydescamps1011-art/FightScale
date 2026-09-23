# -*- coding: utf-8 -*-
"""Recopie site/ vers le dossier de l'Artifact.

L'Artifact attend un fragment : titre, styles, contenu. On enleve donc
l'enveloppe html/head/body et les balises de referencement, qui n'ont pas de
sens dans une maquette. Le reste est repris tel quel, pour que ce qu'Amaury
regarde soit exactement ce que Vercel sert.
"""
import os, re, shutil

SRC = '/tmp/claude-0/-home-claude/fe1486f2-8126-5a24-9c89-ca3cc04a2b8e/scratchpad/home/site'
DST = '/tmp/claude-0/-home-claude-fightscale/fe1486f2-8126-5a24-9c89-ca3cc04a2b8e/scratchpad/artifact'
SAUF = {'robots.txt', 'vercel.json', 'README.md'}

def fragment(page, nom):
    i = page.index('<title>')
    # on garde la declaration d'encodage : sans elle, un hote qui ne dit pas
    # UTF-8 casse les accents, et avec eux la regex de normalisation des slugs
    page = '<meta charset="utf-8">\n' + page[i:]
    if nom == 'index.html':          # le nom de la page publiee, court
        page = re.sub(r'<title>[^<]*</title>', '<title>Accueil Mon Club Combat</title>',
                      page, count=1)
    page = page.replace('</head>\n<body>\n', '', 1).replace('</head>\n<body>', '', 1)
    page = page.replace('</head>', '', 1)
    page = re.sub(r'<body[^>]*>', '', page, count=1)
    page = page.replace('</body>', '').replace('</html>', '')
    return page.strip() + '\n'

n = 0
for nom in sorted(os.listdir(SRC)):
    s = os.path.join(SRC, nom)
    if nom in SAUF:
        continue
    if os.path.isdir(s):
        d = os.path.join(DST, nom)
        shutil.rmtree(d, ignore_errors=True)
        shutil.copytree(s, d)
        continue
    if nom.endswith('.html'):
        page = open(s, encoding='utf-8').read()
        open(os.path.join(DST, nom), 'w', encoding='utf-8').write(fragment(page, nom))
    else:
        shutil.copy2(s, os.path.join(DST, nom))
    n += 1
print(n, 'fichiers')
for nom in ('index.html', 'espace-club.html', 'admin.html'):
    p = os.path.join(DST, nom)
    t = open(p, encoding='utf-8').read()
    assert '<!doctype' not in t and '</html>' not in t, nom
    print(' ', nom, len(t), '|', t.split('\n')[0][:60])
