# -*- coding: utf-8 -*-
"""La fenetre de creation de l'espace club, partagee par toutes les pages.

Amaury, 22/09/2026 : « tous les boutons Referencer ma salle ne doivent pas mener
vers la page Referencer ma salle. C'est que le bouton sur le banner qui mene vers
la page, mais sinon ca mene directement vers la creation d'un compte. » Donc la
fenetre ne peut plus vivre sur la seule page de vente : chaque page la porte, et
tout bouton marque data-compte l'ouvre.
"""

R = lambda n: open(n, encoding='utf-8').read()

CROIX = ('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
         '<path d="M6 6 18 18M18 6 6 18"/></svg>')

def css():
    return R('_compte.css')

def html():
    return R('_compte.html').replace('%%CROIX%%', CROIX)

def js():
    return R('_compte.js')

# Le bouton qui ouvre la fenetre, la ou une page posait un lien vers clubs.html.
def bouton(texte='Référencer ma salle', classe='btn btn-rouge', extra=''):
    return '<button class="%s" type="button" data-compte%s>%s</button>' % (
        classe, (' ' + extra if extra else ''), texte)

# Le client Supabase, en UMD : il pose window.supabase, que _sb.js attend.
# jsdelivr est l'un des rares hebergeurs que le CSP des Artifacts laisse passer,
# donc la meme balise marche sur le site et dans la maquette. Dans la maquette,
# en revanche, le CSP bloque les requetes vers Supabase : _sb.js le detecte et
# les pages retombent sur leur comportement de demonstration.
SUPABASE_CDN = ('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4'
                '/dist/umd/supabase.js"></script>')

def scripts():
    """Les balises a poser avant tout script qui parle a la base."""
    return SUPABASE_CDN + '\n<script src="sb.js"></script>\n'

def pose(page, avant='</body>'):
    """Ajoute la fenetre et son script a une page deja assemblee.

    La page n'a pas toujours de </body> (les corps de l'Artifact n'en ont pas) :
    dans ce cas on colle a la fin, ce qui revient au meme puisque le script
    s'execute apres le HTML qui le precede.
    """
    bloc = '\n' + html() + '\n' + scripts() + '<script>\n' + js() + '</script>\n'
    if avant in page:
        return page.replace(avant, bloc + avant, 1)
    return page + bloc
