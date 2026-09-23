# -*- coding: utf-8 -*-
"""Une vignette de ville = le plan de cette ville, dessiné au build.

Pourquoi pas une photo : le CSP des Artifacts interdit toute image externe, et
l'egress de l'atelier ne laisse passer aucun hébergeur d'images. Mais on porte
déjà la géographie de la France pour la carte de recherche, donc chaque ville
peut montrer sa propre silhouette : le contour exact de la commune, ses
voisines, son fleuve, son littoral. Pour un annuaire dont le sujet est « près
de chez vous », c'est plus juste qu'une photo de carte postale, et c'est la
même matière que la carte du site.

Le SVG est produit ici et inséré tel quel dans la page : aucune requête, aucun
script, et la vignette ne coûte que son tracé.
"""
import io, json, math, os

L, H = 320.0, 200.0          # viewBox de la vignette
MARGE = 0.16                 # air autour de la commune, en fraction de sa taille
MINI_KM = 5.5                # une petite commune ne doit pas etre montree de trop pres

ICI = os.path.dirname(os.path.abspath(__file__))
GEO_DIR = os.path.join(ICI, '..', 'geo')
PHOTOS = 'photos'                      # ou Amaury depose ses photos de villes
EXT_PHOTO = ('.jpg', '.jpeg', '.png', '.webp', '.avif')
COMMUNES = os.path.join(GEO_DIR, 'communes-simpl.geojson')

# Le code INSEE, pas le nom : il y a plusieurs Angers-quelque-chose et le nom
# seul ne designe pas une commune.
CODES = {
 'Paris': '75056', 'Marseille': '13055', 'Lyon': '69123', 'Toulouse': '31555',
 'Nice': '06088', 'Bordeaux': '33063', 'Aix-en-Provence': '13001',
 'Lille': '59350', 'Nantes': '44109', 'Strasbourg': '67482',
 'Montpellier': '34172', 'Rennes': '35238', 'Toulon': '83137',
 'Grenoble': '38185', 'Dijon': '21231', 'Angers': '49007',
}

def merc(lat):
    return math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * 180 / math.pi

# ------------------------------------------------------------------ sources

def deplie(t):
    """Meme encodage que _geobase.js : delta + varint, precision 1e-4 degre."""
    out = []; i = 0; n = len(t); x = 0; y = 0
    while i < n:
        r = 0; sh = 0
        while True:
            b = ord(t[i]) - 63; i += 1; r |= (b & 31) << sh; sh += 5
            if b < 32: break
        x += ~(r >> 1) if (r & 1) else (r >> 1)
        r = 0; sh = 0
        while True:
            b = ord(t[i]) - 63; i += 1; r |= (b & 31) << sh; sh += 5
            if b < 32: break
        y += ~(r >> 1) if (r & 1) else (r >> 1)
        out.append((x / 1e4, y / 1e4))
    return out

_GEO = None
def geo():
    global _GEO
    if _GEO is None:
        s = io.open('geo.js', encoding='utf-8').read()
        brut = json.loads(s[s.index('{'):s.rindex('}') + 1])
        _GEO = dict((k, [deplie(t) for t in brut[k]])
                    for k in ('fr', 'lac', 'riv'))
    return _GEO

_COM = None
def communes():
    """Toutes les communes de France, en anneaux + boite englobante."""
    global _COM
    if _COM is None:
        d = json.load(io.open(COMMUNES, encoding='utf-8'))
        _COM = []
        for f in d['features']:
            g = f.get('geometry')
            if not g: continue            # quelques communes du fichier n'ont pas de trace
            morceaux = ([g['coordinates']] if g['type'] == 'Polygon'
                        else g['coordinates'])
            anneaux = [[(p[0], p[1]) for p in m[0]] for m in morceaux if m and m[0]]
            if not anneaux: continue
            xs = [p[0] for a in anneaux for p in a]
            ys = [p[1] for a in anneaux for p in a]
            _COM.append((f['properties']['code'], anneaux,
                         (min(xs), min(ys), max(xs), max(ys))))
    return _COM

# --------------------------------------------------------------- découpage

def _bord(p, c, cote):
    x, y = p
    return {0: x >= c[0], 1: x <= c[2], 2: y >= c[1], 3: y <= c[3]}[cote]

def _inter(a, b, c, cote):
    (x0, y0), (x1, y1) = a, b
    if cote in (0, 1):
        x = c[0] if cote == 0 else c[2]
        return (x, y0 + (y1 - y0) * (x - x0) / (x1 - x0))
    y = c[1] if cote == 2 else c[3]
    return (x0 + (x1 - x0) * (y - y0) / (y1 - y0), y)

def clip_poly(pts, c):
    """Sutherland-Hodgman : un anneau coupe par le cadre reste un anneau."""
    for cote in range(4):
        if not pts: return []
        out = []; prec = pts[-1]
        for p in pts:
            dp_, dprec = _bord(p, c, cote), _bord(prec, c, cote)
            if dp_:
                if not dprec: out.append(_inter(prec, p, c, cote))
                out.append(p)
            elif dprec:
                out.append(_inter(prec, p, c, cote))
            prec = p
        pts = out
    return pts

def clip_ligne(pts, c):
    """Une ligne peut sortir du cadre et y revenir : on rend des morceaux."""
    def dedans(p): return c[0] <= p[0] <= c[2] and c[1] <= p[1] <= c[3]
    bouts = []; cur = []
    for i, p in enumerate(pts):
        if dedans(p):
            if not cur and i: cur.append(pts[i - 1])
            cur.append(p)
        elif cur:
            cur.append(p); bouts.append(cur); cur = []
    if cur: bouts.append(cur)
    return bouts

# --------------------------------------------------------------- géométrie

def dp(pts, tol):
    if len(pts) < 3: return pts
    garde = [False] * len(pts); garde[0] = garde[-1] = True
    pile = [(0, len(pts) - 1)]
    while pile:
        a, b = pile.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        n2 = dx * dx + dy * dy
        pire, ipire = tol, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if n2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / n2))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > pire: pire, ipire = d, i
        if ipire >= 0:
            garde[ipire] = True
            pile.append((a, ipire)); pile.append((ipire, b))
    return [p for p, g in zip(pts, garde) if g]

def d_attr(chemins, ferme):
    bouts = []
    for pts in chemins:
        if len(pts) < 2: continue
        bouts.append('M' + ' '.join('%.1f %.1f' % p for p in pts) + ('Z' if ferme else ''))
    return ''.join(bouts)

# --------------------------------------------------------------- vignette

def vignette(ville):
    code = CODES[ville]
    tout = communes()
    moi = [c for c in tout if c[0] == code]
    assert moi, ville
    anneaux = [a for c in moi for a in c[1]]

    xs = [p[0] for a in anneaux for p in a]; ys = [p[1] for a in anneaux for p in a]
    lon = (min(xs) + max(xs)) / 2; lat = (min(ys) + max(ys)) / 2
    kx = 111.32 * math.cos(math.radians(lat))
    largeur = max((max(xs) - min(xs)) * kx,
                  (max(ys) - min(ys)) * 111.32 * (L / H), MINI_KM) * (1 + 2 * MARGE)

    dlon = largeur / kx
    k = L / dlon                                   # pixels par degre de longitude
    lon0 = lon - dlon / 2
    ym0 = merc(lat) + (H / 2) / k                  # haut du cadre, en mercator
    cadre = (lon0, ym0 - H / k, lon0 + dlon, ym0)

    def ecran(pts):
        return [((p[0] - lon0) * k, (ym0 - p[1]) * k) for p in pts]

    def polys(liste_anneaux, tol):
        out = []
        for a in liste_anneaux:
            m = [(p[0], merc(p[1])) for p in a]
            d = clip_poly(m, cadre)
            if len(d) > 2: out.append(dp(ecran(d), tol))
        return out

    def lignes(cle, tol):
        out = []
        for a in geo()[cle]:
            m = [(p[0], merc(p[1])) for p in a]
            out += [dp(ecran(b), tol) for b in clip_ligne(m, cadre) if len(b) > 1]
        return out

    def croise(bb):
        return not (bb[2] < cadre[0] or bb[0] > cadre[2]
                    or merc(bb[3]) < cadre[1] or merc(bb[1]) > cadre[3])

    voisines = [a for c in tout if c[0] != code and croise(c[2]) for a in c[1]]
    v_polys   = polys(voisines, .9)
    moi_polys = polys(anneaux, .35)
    terre     = polys(geo()['fr'], .6)
    lacs      = polys(geo()['lac'], .5)
    rivs      = lignes('riv', .5)

    # Le cadre touche-t-il la mer ? Si le trait de cote le traverse, oui ; s'il
    # n'y a aucune terre du tout, c'est qu'on est au large, ce qui n'arrive pas.
    mer = bool(terre) and sum(len(p) for p in terre) > 4

    p = []; a = p.append
    a('<svg class="cv-plan" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" '
      'aria-hidden="true" focusable="false">')
    a('<rect width="320" height="200" fill="%s"/>' % ('#D9E6EC' if mer else '#F1EFEA'))
    if mer: a('<path fill="#F1EFEA" d="%s"/>' % d_attr(terre, True))
    if v_polys:
        a('<path fill="#E8E5DE" stroke="#F4F2EE" stroke-width=".9" d="%s"/>'
          % d_attr(v_polys, True))
    if lacs: a('<path fill="#CFE0E8" d="%s"/>' % d_attr(lacs, True))
    if rivs:
        a('<path fill="none" stroke="#C6DAE4" stroke-width="2.4" stroke-linecap="round" '
          'stroke-linejoin="round" d="%s"/>' % d_attr(rivs, False))
    # la commune, en rouge de marque : c'est elle qu'on vient chercher
    a('<path fill="#EC162E" fill-opacity=".14" stroke="#EC162E" stroke-opacity=".55" '
      'stroke-width="1.5" stroke-linejoin="round" d="%s"/>' % d_attr(moi_polys, True))
    a('</svg>')
    return ''.join(p)


# ------------------------------------------------------------------ visuel

def ardoise(t):
    import re, unicodedata
    t = unicodedata.normalize('NFD', t)
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')

def photo(ville):
    """Le chemin d'une vraie photo si elle a ete deposee dans photos/, sinon None."""
    for e in EXT_PHOTO:
        rel = PHOTOS + '/' + ardoise(ville) + e
        if os.path.exists(os.path.join(ICI, rel)): return rel
    return None

def photos_deposees():
    return [photo(v) for v in CODES if photo(v)]

def visuel(ville):
    """La photo si elle existe, le plan dessine sinon. C'est le seul point de
    bascule : deposer un fichier dans photos/ suffit a remplacer la vignette."""
    p = photo(ville)
    if p:
        return ('<img class="cv-photo" src="%s" alt="" loading="lazy" '
                'decoding="async" width="640" height="400">' % p)
    return vignette(ville)
