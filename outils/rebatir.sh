#!/bin/sh
# Reconstruit le site en entier, dans l'ordre : build_site.py emballe les pages
# que build_clubs.py vient d'ecrire.
#
#   ./rebatir.sh
set -e
cd "$(dirname "$0")"
# Depuis le 18/10/2026 le site ne porte que la page agence (servie a la racine)
# et les deux pages legales. Le site complet d'avant (annuaire, fiches, espace
# club, back-office) est garde sur la branche sauvegarde-site-complet-2026-10-18 ;
# les scripts qui le fabriquaient sont restes dans ce dossier, sans etre lances.
for p in confidentialite conditions annuler agence; do python3 build_clubs.py --"$p"; done
python3 build_site.py
