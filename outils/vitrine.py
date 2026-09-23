# -*- coding: utf-8 -*-
"""La liste des villes couvertes, au meme endroit pour tout le monde.

Elle ne depend plus des salles referencees : depuis le 22/09/2026 l'annuaire est
vide, et une ville sans salle garde sa vignette, sa page et son etat vide qui
invite le gerant a referencer la sienne. Ecrire cette liste ici et nulle part
ailleurs, sinon une vignette finit par pointer sur une page qui n'existe pas.
"""
VILLES = ['Aix-en-Provence', 'Angers', 'Bordeaux', 'Dijon', 'Grenoble', 'Lille',
          'Lyon', 'Marseille', 'Montpellier', 'Nantes', 'Nice', 'Paris',
          'Rennes', 'Strasbourg', 'Toulon', 'Toulouse']

# L'ordre des vignettes de l'accueil : les plus grandes agglomerations d'abord.
VITRINE = ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Bordeaux',
           'Aix-en-Provence', 'Lille', 'Nantes', 'Strasbourg', 'Montpellier',
           'Rennes', 'Toulon', 'Grenoble', 'Dijon', 'Angers']

assert sorted(VITRINE) == VILLES
