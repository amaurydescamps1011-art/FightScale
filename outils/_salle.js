/* Fiche salle — profil gratuit.
   Ce que porte la fiche gratuite : adresse et localisation, horaires, disciplines,
   présentation, coordonnées, site et réseaux. Pas de réservation : le créneau
   confirmé appartient au palier payant, qui reste à construire. */

var I = {
  etoile:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3.6 2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7Z"/></svg>',
  epingle:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  tel:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.3 3.5h3l1.5 3.8-2 1.3a12 12 0 0 0 5.6 5.6l1.3-2 3.8 1.5v3a1.8 1.8 0 0 1-2 1.8A16.2 16.2 0 0 1 4.5 5.5a1.8 1.8 0 0 1 1.8-2Z"/></svg>',
  mail:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.8" y="5" width="18.4" height="14" rx="2.4"/><path d="m3.4 6.8 8.6 6 8.6-6"/></svg>',
  web:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/></svg>',
  insta:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
  fb:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.6-1.5h1.5V4.3A21 21 0 0 0 15.4 4c-2.3 0-3.8 1.4-3.8 3.9v2.5H9v3h2.6V21"/></svg>',
  equip:{
    cage:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.6 3.6H8.4L3.6 8.4v7.2l4.8 4.8h7.2l4.8-4.8V8.4Z"/></svg>',
    ring:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 8.4h17.2M3.4 12h17.2M3.4 15.6h17.2"/><path d="M5.2 5.4v13.2M18.8 5.4v13.2"/></svg>',
    tatami:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.4" y="5.6" width="17.2" height="12.8" rx="1.4"/><path d="M12 5.6v12.8M3.4 12h17.2"/></svg>',
    sac:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6v2.8M9.2 5.4h5.6"/><rect x="6.4" y="6.6" width="11.2" height="14.2" rx="5.2"/><path d="M6.9 12.6h10.2"/></svg>',
    muscu:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 9.2v5.6M6.6 7.2v9.6M17.4 7.2v9.6M20.6 9.2v5.6M6.6 12h10.8"/></svg>',
    douche:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 12.4h10a5 5 0 0 0-10 0Z"/><path d="M8.6 12.4V6.4A2.4 2.4 0 0 1 11 4h5.4"/><circle cx="5.8" cy="16.4" r="1.05" fill="currentColor" stroke="none"/><circle cx="8.6" cy="19.2" r="1.05" fill="currentColor" stroke="none"/><circle cx="11.4" cy="16.4" r="1.05" fill="currentColor" stroke="none"/></svg>',
    casier:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1.6"/><path d="M5 12h14"/><path d="M15.6 7.2v1.6M15.6 15.2v1.6"/></svg>',
    materiel:'<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 6.4 12 2.8 3.4 6.4v5.4c0 4.4 3.6 8.1 8.6 9.4 5-1.3 8.6-5 8.6-9.4Z"/><path d="m8.8 11.8 2.2 2.2 4-4"/></svg>',
  },
  gant:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10.5V6.8A2.8 2.8 0 0 1 9.8 4h3.6A4.6 4.6 0 0 1 18 8.6v2.9a4 4 0 0 1-1.3 3l-.7.6v2.1a1.8 1.8 0 0 1-1.8 1.8H9.8A1.8 1.8 0 0 1 8 17.2v-1.4l-1-.7a3 3 0 0 1 0-4.6Z"/><path d="M8 15.8h8"/></svg>'
};

function param(n){
  var m = new RegExp('[?&]' + n + '=([^&]*)').exec(window.location.search);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

function echappe(t){
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');
}

/* Le visuel d'une salle sans photo. Plutôt qu'une fausse photo ou un cadre vide,
   un aplat de marque construit sur le sigle : c'est assumé, et une vraie photo
   viendra simplement le remplacer. */
function visuel(s, n, gros){
  var d = s[11], sigle = s[1];
  /* La photo si le club en a deposee une a cet emplacement, l'aplat dessine sinon.
     Meme bascule que les vignettes de villes : un emplacement vide reste propre. */
  var ph = (d.photos || [])[n];
  if (ph) {
    return '<img src="' + ph + '" alt="" width="1600" height="800" decoding="async"' +
           (n === 0 ? '' : ' loading="lazy"') + '>';
  }
  var teintes = [['#EFEDE7', '#E0DCD3'], ['#EDEBE6', '#DCDDD8'], ['#F1EDE6', '#E4DCD0']];
  var t = teintes[n % teintes.length];
  var id = 'vg-' + d.slug + '-' + n;
  var ang = [18, -12, 34][n % 3];
  return '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" ' +
           'aria-label="Visuel de ' + echappe(s[0]) + '">' +
           '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
             '<stop offset="0" stop-color="' + t[0] + '"/>' +
             '<stop offset="1" stop-color="' + t[1] + '"/></linearGradient></defs>' +
           '<rect width="400" height="300" fill="url(#' + id + ')"/>' +
           '<g transform="rotate(' + ang + ' 200 150)" opacity=".5">' +
             '<path d="M-60 214 H460" stroke="#EC162E" stroke-width="3" opacity=".55"/>' +
             '<path d="M-60 236 H460" stroke="#EC162E" stroke-width="1.4" opacity=".3"/>' +
           '</g>' +
           (gros
             ? '<text x="200" y="176" text-anchor="middle" font-family="Anton, Impact, sans-serif" ' +
                 'font-size="104" fill="#16160F" opacity=".11">' + echappe(sigle) + '</text>'
             : '<text x="200" y="168" text-anchor="middle" font-family="Anton, Impact, sans-serif" ' +
                 'font-size="42" fill="#16160F" opacity=".13" letter-spacing="2">' +
                 echappe((s[5][n - 1] || s[2]).toUpperCase()) + '</text>') +
         '</svg>';
}

function lien(href, icone, texte, dehors){
  return '<li><a href="' + href + '"' + (dehors ? ' target="_blank" rel="noopener"' : '') +
         '>' + icone + '<span class="quoi">' + echappe(texte) + '</span></a></li>';
}

function rendFiche(s){
  var d = s[11];
  document.getElementById('fiche').hidden = false;
  document.title = s[0] + ' — ' + s[2] + ' | Mon Club Combat';

  var filVille = document.getElementById('fil-ville');
  filVille.textContent = 'Salles à ' + s[2];
  filVille.href = pageVille(s[2]);       /* la page d'annuaire de la ville */
  document.getElementById('fil-nom').textContent = s[0];

  /* visuels : un grand sur deux rangées puis quatre petits, la grille tombe juste */
  document.getElementById('galerie').innerHTML =
    [0, 1, 2, 3, 4].map(function (n){
      return '<div class="vis">' + visuel(s, n, n === 0) +
             (n === 0 && !(s[11].photos || [])[0]
                ? '<span class="vis-marque">Photos à venir</span>' : '') + '</div>';
    }).join('');

  document.getElementById('s-nom').textContent = s[0];
  document.getElementById('s-meta').innerHTML =
    '<span class="note">' + I.etoile + s[6] + ' <small>(' + s[7] + ' avis)</small></span>' +
    '<span class="sep" aria-hidden="true">·</span>' +
    '<span>' + I.epingle + ' ' + echappe(d.adresse + ', ' + d.cp + ' ' + s[2]) + '</span>' +
    '<span class="sep" aria-hidden="true">·</span>' +
    '<span class="' + (s[10] ? 'ouvert' : 'ferme') + '">' +
      (s[10] ? 'Ouvert aujourd’hui' : 'Fermé aujourd’hui') + '</span>';

  document.getElementById('s-disc').innerHTML =
    s[5].map(function (x){ return '<li>' + echappe(x) + '</li>'; }).join('');

  /* la fiche gratuite met en avant le contact direct : c'est là que naît le lead */
  var actions = ['<a class="btn btn-rouge" href="tel:' + d.tel.replace(/\s/g, '') + '">' +
                   I.tel + 'Appeler la salle</a>',
                 '<a class="btn btn-ligne" href="mailto:' + d.mail + '">' +
                   I.mail + 'Écrire un e-mail</a>'];
  document.getElementById('s-actions').innerHTML = actions.join('');

  document.getElementById('s-presentation').innerHTML =
    d.presentation.map(function (p){ return '<p>' + echappe(p) + '</p>'; }).join('');

  document.getElementById('s-faits').innerHTML =
    [['Ouverte depuis', d.depuis],
     ['Adhérents', 'environ ' + d.adherents],
     ['Disciplines', s[5].length],
     ['Amplitude', s[9]]]
    .map(function (f){ return '<div><dt>' + f[0] + '</dt><dd>' + echappe(f[1]) + '</dd></div>'; })
    .join('');

  document.getElementById('s-grille-disc').innerHTML =
    s[5].map(function (x){ return '<li>' + I.gant + echappe(x) + '</li>'; }).join('');

  /* Les equipements : ce que la salle possede, avec une vraie icone par type.
     Une icone approximative vaut moins que pas d'icone, donc chaque type a la
     sienne et rien n'est rendu sans. */
  document.getElementById('s-equip').innerHTML =
    (d.equipements || []).map(function (e){
      return '<li>' + (I.equip[e[1]] || '') + '<span>' + echappe(e[0]) + '</span></li>';
    }).join('');

  /* Les avis, du plus recent au plus ancien. */
  var MOIS_O = ['janvier','février','mars','avril','mai','juin','juillet','août',
                'septembre','octobre','novembre','décembre'];
  function quand(t){
    var p = t.split(' ');
    return parseInt(p[1], 10) * 12 + MOIS_O.indexOf(p[0]);
  }
  var lesAvis = (d.avis || []).slice().sort(function (a, b){ return quand(b.date) - quand(a.date); });
  document.getElementById('s-avis-note').innerHTML =
    I.etoile + ' <b>' + s[6] + '</b> sur ' + s[7] + ' avis';
  document.getElementById('s-avis').innerHTML = lesAvis.map(function (a){
    var etoiles = '';
    for (var k = 0; k < 5; k++) etoiles += '<span class="' + (k < a.note ? 'pleine' : 'vide') + '">' + I.etoile + '</span>';
    return '<li>' +
      '<div class="avis-tete">' +
        '<span class="avis-nom">' + echappe(a.nom) + '</span>' +
        '<span class="avis-etoiles" aria-label="' + a.note + ' sur 5">' + etoiles + '</span>' +
        '<time class="avis-date">' + echappe(a.date) + '</time>' +
      '</div>' +
      '<p class="avis-texte">' + echappe(a.texte) + '</p></li>';
  }).join('');

  /* getDay() : 0 = dimanche, or notre semaine commence le lundi */
  var jourJs = new Date().getDay();
  var aujourdhui = (jourJs + 6) % 7;
  document.getElementById('s-amplitude').textContent = 'La salle est ouverte ' + s[9] + '.';
  document.getElementById('s-semaine').innerHTML = d.planning.map(function (j, n){
    var corps = j.cours.length
      ? '<div class="cours">' + j.cours.map(function (c){
          return '<div class="c"><span class="h">' + c.de + ' – ' + c.a + '</span>' +
                 '<span class="q">' + echappe(c.quoi) + '</span>' +
                 '<span class="n">' + echappe(c.niveau) + '</span></div>';
        }).join('') + '</div>'
      : '<p class="repos">Fermé</p>';
    return '<li' + (n === aujourdhui ? ' class="aujourdhui"' : '') +
           '><span class="jour">' + j.jour + '</span>' + corps + '</li>';
  }).join('');

  document.getElementById('s-adresse').innerHTML =
    echappe(d.adresse) + '<br>' + echappe(d.cp + ' ' + s[2]);
  document.getElementById('s-itineraire').href =
    'https://www.openstreetmap.org/directions?to=' + s[3] + '%2C' + s[4];

  var coord = [lien('tel:' + d.tel.replace(/\s/g, ''), I.tel, d.tel),
               lien('mailto:' + d.mail, I.mail, d.mail)];
  if (d.site)  coord.push(lien('https://' + d.site, I.web, d.site, true));
  if (d.insta) coord.push(lien('https://instagram.com/' + d.insta, I.insta, '@' + d.insta, true));
  if (d.fb)    coord.push(lien('https://facebook.com/' + d.fb, I.fb, d.fb, true));
  document.getElementById('s-coord').innerHTML = coord.join('');

  /* Les salles voisines, par distance réelle plutôt que par nom de ville. Au-delà
     de 60 km on ne parle plus de voisinage : le titre change plutôt que d'annoncer
     « autour de Paris » une salle qui est à 400 km. */
  var autour = document.getElementById('autour');
  if (autour) autour.hidden = SALLES.length < 2;
  var classees = SALLES.filter(function (o){ return o !== s; })
    .map(function (o){ return [o, distanceKm(s[3], s[4], o[3], o[4])]; })
    .sort(function (a, b){ return a[1] - b[1]; });
  var voisines = classees.filter(function (p){ return p[1] <= 60; });
  var proches = (voisines.length >= 2 ? voisines : classees).slice(0, 4);
  document.getElementById('autour-titre').textContent =
    voisines.length >= 2 ? 'Autres salles autour de ' + s[2] : 'D’autres salles en France';
  document.getElementById('s-autour').innerHTML = proches.map(function (p){
    var o = p[0], km = p[1];
    return '<li><a href="' + lienFiche(o) + '"><span class="sig">' + echappe(o[1]) + '</span>' +
           '<span class="t"><b>' + echappe(o[0]) + '</b><span>' +
           (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km') +
           ' · ' + echappe(o[5][0]) + '</span></span></a></li>';
  }).join('');

  var cv = document.getElementById('mini');
  if (cv && window.GEO) miniCarte(cv, s[3], s[4], 15);
}

(function demarre(){
  /* La fiche d'exemple passe par ?demo=1 plutot que par un slug : elle n'est
     dans aucun index, donc aucune recherche et aucune page d'annuaire ne peut
     y mener. On la montre uniquement depuis « Referencer ma salle ». */
  if (param('demo')){
    document.getElementById('bandeau-demo').hidden = false;
    rendFiche(SALLE_DEMO);
    document.title = 'Exemple de fiche club — Mon Club Combat';
    return;
  }
  var s = salleParSlug(param('s'));
  if (s) rendFiche(s);
  else {
    document.getElementById('introuvable').hidden = false;
    document.title = 'Salle introuvable — Mon Club Combat';
  }
})();
