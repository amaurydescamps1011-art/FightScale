/* Fiche salle.
   Ce que porte la fiche gratuite : adresse et localisation, horaires, disciplines,
   présentation, photos. Le club y est trouvable, et c'est tout.
   Ce que le palier Pro ajoute (Amaury, 23/09/2026) : le téléphone, l'e-mail, le
   site et les réseaux, la demande de séance d'essai en ligne, et la mise en
   avant dans les résultats. Sans abonnement, un pratiquant n'a aucun moyen de
   joindre la salle depuis ici : c'est ce manque qui fait passer un club au Pro.
   La base applique la même règle : la vue `annuaire` ne rend tout simplement
   pas les coordonnées d'un club gratuit, donc refaire la requête à la main ne
   les donne pas non plus. */

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
  document.title = s[0] + ', ' + s[2] + ' | Mon Club Combat';

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
  /* Un vrai club n'a ni note ni avis : on n'affiche pas une moyenne inventee,
     on n'affiche rien. Meme chose plus bas pour le bloc des avis. */
  var meta = [];
  if (s[6]) meta.push('<span class="note">' + I.etoile + s[6] +
                      ' <small>(' + s[7] + ' avis)</small></span>');
  var ou = [d.adresse, [d.cp, s[2]].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (ou) meta.push('<span>' + I.epingle + ' ' + echappe(ou) + '</span>');
  if (s[9]) meta.push('<span class="' + (s[10] ? 'ouvert' : 'ferme') + '">' +
    (s[10] ? 'Ouvert aujourd’hui' : 'Fermé aujourd’hui') + '</span>');
  document.getElementById('s-meta').innerHTML =
    meta.join('<span class="sep" aria-hidden="true">·</span>');

  document.getElementById('s-disc').innerHTML =
    s[5].map(function (x){ return '<li>' + echappe(x) + '</li>'; }).join('');

  /* Contacter et reserver sont ce que le club achete. Sur une fiche gratuite il
     n'y a donc aucun bouton d'action : ni appel, ni e-mail, ni reservation.
     `d.tel` et compagnie sont deja vides de toute facon, la base ne les a pas
     rendus -- ce test-ci n'est que la version visible de la regle. */
  var pro = !!s[8];
  var reserve = d.reel && pro;
  var actions = [];
  if (reserve) actions.push('<a class="btn btn-rouge" href="#essai">' + I.gant +
                            'Réserver une séance d’essai</a>');
  if (pro && d.tel) actions.push('<a class="btn ' + (reserve ? 'btn-ligne' : 'btn-rouge') +
    '" href="tel:' + d.tel.replace(/\s/g, '') + '">' + I.tel + 'Appeler la salle</a>');
  if (pro && d.mail) actions.push('<a class="btn btn-ligne" href="mailto:' + d.mail + '">' +
                           I.mail + 'Écrire un e-mail</a>');
  document.getElementById('s-actions').innerHTML = actions.join('');

  document.getElementById('s-presentation').innerHTML =
    (d.presentation || []).map(function (p){ return '<p>' + echappe(p) + '</p>'; }).join('');

  var faits = [];
  if (d.depuis) faits.push(['Ouverte depuis', d.depuis]);
  if (d.adherents) faits.push(['Adhérents', 'environ ' + d.adherents]);
  if (s[5].length) faits.push(['Disciplines', s[5].length]);
  if (s[9]) faits.push(['Amplitude', s[9]]);
  document.getElementById('s-faits').innerHTML = faits
    .map(function (f){ return '<div><dt>' + f[0] + '</dt><dd>' + echappe(f[1]) + '</dd></div>'; })
    .join('');
  montre('presentation', (d.presentation || []).length || faits.length);

  document.getElementById('s-grille-disc').innerHTML =
    s[5].map(function (x){ return '<li>' + I.gant + echappe(x) + '</li>'; }).join('');

  /* Les equipements : ce que la salle possede, avec une vraie icone par type.
     Une icone approximative vaut moins que pas d'icone, donc chaque type a la
     sienne et rien n'est rendu sans. */
  document.getElementById('s-equip').innerHTML =
    (d.equipements || []).map(function (e){
      return '<li>' + (I.equip[e[1]] || '') + '<span>' + echappe(e[0]) + '</span></li>';
    }).join('');
  montre('equipements', (d.equipements || []).length);
  montre('disciplines', s[5].length);

  /* Les avis, du plus recent au plus ancien. */
  var MOIS_O = ['janvier','février','mars','avril','mai','juin','juillet','août',
                'septembre','octobre','novembre','décembre'];
  function quand(t){
    var p = t.split(' ');
    return parseInt(p[1], 10) * 12 + MOIS_O.indexOf(p[0]);
  }
  var lesAvis = (d.avis || []).slice().sort(function (a, b){ return quand(b.date) - quand(a.date); });
  montre('avis', lesAvis.length);
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
  /* Le pave porte les heures d'ouverture du club, et son planning de cours des
     qu'il en a saisi un (depuis le 23/09/2026 : c'est ce planning que la seance
     d'essai propose). Rien n'est invente : un club qui n'a rien saisi n'affiche
     que ses heures, et un club qui n'a meme pas d'heures n'affiche pas le pave. */
  var planning = d.planning || [];
  var aDesHeures = planning.some(function (j){ return j.heures || j.cours.length; });
  var titreHoraires = document.querySelector('#horaires .pan-titre');
  if (titreHoraires) titreHoraires.textContent =
    planning.some(function (j){ return j.cours.length; }) ? 'Planning de la semaine'
                                                          : 'Horaires d’ouverture';
  document.getElementById('s-amplitude').textContent =
    s[9] ? 'La salle est ouverte ' + s[9] + '.' : '';
  document.getElementById('s-semaine').innerHTML = planning.map(function (j, n){
    var corps;
    if (j.cours.length) {
      corps = '<div class="cours">' + j.cours.map(function (c){
          return '<div class="c"><span class="h">' + c.de + ' – ' + c.a + '</span>' +
                 '<span class="q">' + echappe(c.quoi) + '</span>' +
                 '<span class="n">' + echappe(c.niveau) + '</span></div>';
        }).join('') + '</div>';
    } else if (j.heures) {
      corps = '<div class="cours"><div class="c"><span class="h">' +
              echappe(j.heures[0] + ' – ' + j.heures[1]) + '</span></div></div>';
    } else {
      corps = '<p class="repos">Fermé</p>';
    }
    return '<li' + (n === aujourdhui ? ' class="aujourdhui"' : '') +
           '><span class="jour">' + j.jour + '</span>' + corps + '</li>';
  }).join('');
  montre('horaires', aDesHeures);

  document.getElementById('s-adresse').innerHTML =
    [echappe(d.adresse), echappe([d.cp, s[2]].filter(Boolean).join(' '))]
      .filter(Boolean).join('<br>');
  /* Sans coordonnees on ne peut ni placer la salle ni tracer un itineraire :
     le plan disparait plutot que de montrer le golfe de Guinee. */
  var aUnPoint = typeof s[3] === 'number' && typeof s[4] === 'number';
  var itineraire = document.getElementById('s-itineraire');
  itineraire.hidden = !aUnPoint;
  if (aUnPoint) itineraire.href =
    'https://www.openstreetmap.org/directions?to=' + s[3] + '%2C' + s[4];
  var boitePlan = document.querySelector('.mini-carte');
  if (boitePlan) boitePlan.hidden = !aUnPoint;

  var coord = [];
  if (pro) {
    if (d.tel)  coord.push(lien('tel:' + d.tel.replace(/\s/g, ''), I.tel, d.tel));
    if (d.mail) coord.push(lien('mailto:' + d.mail, I.mail, d.mail));
    if (d.site)  coord.push(lien('https://' + d.site, I.web, d.site, true));
    if (d.insta) coord.push(lien('https://instagram.com/' + d.insta, I.insta, '@' + d.insta, true));
    if (d.fb)    coord.push(lien('https://facebook.com/' + d.fb, I.fb, d.fb, true));
  }
  document.getElementById('s-coord').innerHTML = coord.join('');
  /* Un club sans abonnement ne laisse pas un trou a la place du bloc : il montre
     le bloc ferme, qui dit pourquoi et s'adresse au gerant. La salle de
     demonstration, elle, garde ses coordonnees d'exemple sans etre traitee de
     gratuite : elle n'est pas un vrai club. */
  var panCoord = document.getElementById('pan-coord');
  var panFerme = document.getElementById('pan-coord-ferme');
  if (panCoord) panCoord.hidden = !coord.length;
  if (panFerme) panFerme.hidden = !(d.reel && !pro);

  /* Les salles voisines, par distance réelle plutôt que par nom de ville. Au-delà
     de 60 km on ne parle plus de voisinage : le titre change plutôt que d'annoncer
     « autour de Paris » une salle qui est à 400 km. */
  var autour = document.getElementById('autour');
  if (autour) autour.hidden = SALLES.length < 2;
  var classees = SALLES.filter(function (o){
      return o !== s && typeof o[3] === 'number' && typeof s[3] === 'number'; })
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
  if (cv && window.GEO && aUnPoint) miniCarte(cv, s[3], s[4], 15);

  /* « Reclamer ma fiche » n'a pas de sens sur la fiche d'un club qui l'a deja
     reclamee : c'est la demande de seance d'essai qui prend sa place. */
  var bloc = document.querySelector('.pan-club');
  if (bloc) bloc.hidden = !!d.reel;
  if (reserve) ouvreEssai(s);

  /* On compte la visite, une fois par navigateur et par jour, et seulement sur
     la fiche d'un vrai club : c'est le premier chiffre de son espace, et celui
     qui lui dit combien de gens sont repartis sans pouvoir l'appeler. La fiche
     d'exemple et les salles de demonstration ne comptent rien. */
  if (d.reel && d.id && window.MCC && window.MCC.prete()) window.MCC.compteVue(d.id);
}

/* Cache une section quand elle n'a rien a montrer. Un panneau vide avec son
   titre fait croire a une page cassee. */
function montre(id, oui){
  var el = document.getElementById(id);
  if (el) el.hidden = !oui;
}

/* ---- la demande de seance d'essai ----
   Le formulaire ne s'ouvre que sur la fiche d'un vrai club abonne Pro : la
   reservation est ce que le club achete. Il ecrit directement dans la base ;
   la politique d'acces n'accepte qu'un club publie et le statut « recue »,
   donc rien ici ne peut donner plus que ca. */
function ouvreEssai(s){
  var bloc = document.getElementById('essai');
  var SB = window.MCC;
  if (!bloc || !SB || !SB.prete()) return;
  bloc.hidden = false;

  var choix = document.getElementById('e-disc');
  choix.innerHTML = ['<option value="">Peu importe</option>'].concat(
    s[5].map(function (x){ return '<option>' + echappe(x) + '</option>'; })).join('');

  /* Amaury, 23/09/2026 : une seance d'essai tombe sur un horaire de cours. Si la
     salle a saisi son planning, le pratiquant choisit un cours et rien d'autre ;
     sinon on garde le texte libre, sans quoi une salle sans planning ne pourrait
     plus rien recevoir. La base tient la meme regle, elle ne se contente pas de
     cette page. */
  var lesCours = [];
  ((s[11] && s[11].planning) || []).forEach(function (j){
    (j.cours || []).forEach(function (c){
      if (!c.id) return;
      lesCours.push({ id: c.id, quoi: c.quoi,
        texte: j.jour + ' ' + c.de + ' – ' + c.a +
               (c.quoi ? ' · ' + c.quoi : '') +
               (c.niveau ? ' (' + c.niveau + ')' : '') });
    });
  });
  var listeCours = document.getElementById('e-cours');
  if (lesCours.length) {
    listeCours.innerHTML = lesCours.map(function (c){
      return '<option value="' + echappe(c.id) + '">' + echappe(c.texte) + '</option>';
    }).join('');
  }
  document.getElementById('e-champ-cours').hidden = !lesCours.length;
  document.getElementById('e-champ-quand').hidden = !!lesCours.length;
  document.getElementById('e-champ-disc').hidden  = !!lesCours.length;

  var form = document.getElementById('essai-form');
  var erreur = document.getElementById('e-erreur');
  var envoi = document.getElementById('e-envoi');

  function rate(msg){ erreur.textContent = msg; erreur.hidden = false; }

  form.addEventListener('submit', function (e){
    e.preventDefault();
    erreur.hidden = true;
    var champs = {};
    ['nom', 'mail', 'tel', 'disc', 'quand', 'mot'].forEach(function (k){
      document.getElementById('e-' + k).classList.remove('manque');
    });
    var manque = false;
    ['nom', 'mail'].forEach(function (k){
      var c = document.getElementById('e-' + k);
      if (!c.value.trim()){ c.classList.add('manque'); if (!manque){ c.focus(); manque = true; } }
    });
    if (manque) { rate('Votre nom et votre e-mail sont nécessaires pour que la salle vous réponde.'); return; }
    champs.nom = document.getElementById('e-nom').value.trim();
    champs.mail = document.getElementById('e-mail').value.trim();
    champs.tel = document.getElementById('e-tel').value.trim();
    if (lesCours.length) {
      var pris = lesCours.filter(function (c){ return c.id === listeCours.value; })[0];
      champs.cours_id = listeCours.value;
      champs.creneau = pris ? pris.texte : '';
      champs.discipline = pris ? pris.quoi : '';
    } else {
      champs.discipline = document.getElementById('e-disc').value;
      champs.creneau = document.getElementById('e-quand').value.trim();
    }
    champs.message = document.getElementById('e-mot').value.trim();

    envoi.disabled = true;
    envoi.textContent = 'Envoi…';
    SB.deposeDemande(s[11].id, champs).then(function (){
      form.hidden = true;
      document.getElementById('e-merci').hidden = false;
    }).catch(function (err){
      envoi.disabled = false;
      envoi.textContent = 'Envoyer ma demande';
      rate(SB.dire(err));
    });
  });
}

(function demarre(){
  /* La fiche d'exemple passe par ?demo=1 plutot que par un slug : elle n'est
     dans aucun index, donc aucune recherche et aucune page d'annuaire ne peut
     y mener. On la montre uniquement depuis « Referencer ma salle ». */
  if (param('demo')){
    document.getElementById('bandeau-demo').hidden = false;
    rendFiche(SALLE_DEMO);
    document.title = 'Exemple de fiche club | Mon Club Combat';
    return;
  }
  var demande = param('s');
  var s = salleParSlug(demande);
  if (s) { rendFiche(s); return; }

  /* Les fiches construites a l'avance ne contiennent que les clubs connus au
     dernier build. Un club valide depuis se trouve dans la base : on va l'y
     chercher avant de dire que la salle n'existe pas. */
  if (!demande) { introuvable(); return; }
  /* sb.js est charge en fin de page, apres ce script : on attend que le
     document soit pret plutot que de conclure trop tot que la salle n'existe pas */
  quandPret(function (){
    var SB = window.MCC;
    if (!SB || !SB.prete()) { introuvable(); return; }
    chercheEnBase(SB, demande);
  });

  function chercheEnBase(SB, demande){
  /* `annuaire` et pas `club` : la vue est la seule lecture publique, et
     c'est elle qui masque les coordonnees d'un club gratuit. */
  SB.client.from('annuaire').select('*').eq('slug', demande).limit(1)
    .then(function (r){
      var l = (r && r.data) || [];
      if (!l.length) { introuvable(); return; }
      var neuve = SB.enSalle(l[0]);
      SALLES.push(neuve);
      rendFiche(neuve);
    })
    .catch(introuvable);
  }

  function quandPret(faire){
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', faire);
    else faire();
  }

  function introuvable(){
    document.getElementById('introuvable').hidden = false;
    document.title = 'Salle introuvable | Mon Club Combat';
  }
})();
