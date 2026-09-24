#!/bin/sh
# Reconstruit le site en entier, dans l'ordre. L'ordre n'est pas negociable :
# chaque etape lit ce que la precedente a ecrit.
#
#   ./rebatir.sh              le site tel quel, sans toucher a la base
#   MCC_BASE=1 ./rebatir.sh   en relisant les clubs publies dans Supabase
#                             (SUPABASE_URL et SUPABASE_CLE doivent etre poses)
set -e
cd "$(dirname "$0")"
python3 gen_salles.py
for p in clubs referencer espace-club admin motdepasse mon-compte confidentialite conditions acquisition; do python3 build_clubs.py --"$p"; done
python3 build_recherche.py
python3 build_salle.py
python3 build.py
python3 build_annuaire.py
python3 build_site.py
