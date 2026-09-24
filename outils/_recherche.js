/* Page de résultats : liste des salles + plan de proximité dessiné en canvas.
   Aucun fond de carte externe n'est chargeable ici, donc le plan est construit
   à partir des vraies coordonnées : distances et directions sont exactes. */

/* Les dix du cahier des charges, et les memes que build_annuaire.DISCIPLINES :
   un filtre qui n'existe pas ici rend introuvables les clubs qui l'ont coche. */
var DISCIPLINES = ['MMA','Boxe anglaise','Kickboxing','Muay Thaï','Jiu-jitsu brésilien',
                   'Grappling','Karaté','Judo','Lutte','Self-défense'];

/* nom, initiales, ville, lat, lon, disciplines, note, avis, pro, horaires, ouvert aujourd'hui */

var ICONES = {
  epingle:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  fleche:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13m-5.5-6 6 6-6 6"/></svg>',
  etoile:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3.6 2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7Z"/></svg>'
};

/* ---------- état ---------- */
var etat = { ville:'Marseille', centre:[43.2965, 5.3698], discipline:'', ouvert:false,
             pro:false, actif:-1, survolAutre:-1, resultats:[], autres:[],
             page:1, horsRayon:false, verrou:false };

/* Depuis que l'accueil montre toutes les villes, on arrive legitimement sur une
   ville sans aucune salle. Ce n'est pas un filtre trop serre, et le message
   d'etat vide doit le dire autrement. */
function sansFiltre(){ return !etat.discipline && !etat.ouvert && !etat.pro; }

function viseVille(v){ etat.ville = v[0]; etat.centre = [v[1], v[2]]; }
function formateKm(km){
  return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km';
}

/* ---------- lecture de l'URL ---------- */
(function lisUrl(){
  var p = new URLSearchParams(location.search);
  var v = villeParNom(p.get('ville') || '');
  if (v) viseVille(v);
  var d = p.get('discipline') || '';
  if (DISCIPLINES.indexOf(d) >= 0) etat.discipline = d;
})();

/* ---------- filtres ---------- */
function construisFiltres(){
  var boite = document.getElementById('filtres');
  var html = '<button type="button" class="puce" data-disc="" aria-pressed="' +
             (etat.discipline === '') + '">Toutes les disciplines</button>';
  html += DISCIPLINES.map(function (d){
    return '<button type="button" class="puce" data-disc="' + d + '" aria-pressed="' +
           (etat.discipline === d) + '">' + d + '</button>';
  }).join('');
  html += '<button type="button" class="puce" data-bool="ouvert" aria-pressed="' + etat.ouvert +
          '">Ouvert aujourd\'hui</button>';
  html += '<button type="button" class="puce" data-bool="pro" aria-pressed="' + etat.pro +
          '">Réservation en ligne</button>';
  boite.innerHTML = html;

  boite.addEventListener('click', function (e){
    var b = e.target.closest('.puce'); if (!b) return;
    if (b.dataset.bool) etat[b.dataset.bool] = !etat[b.dataset.bool];
    else etat.discipline = b.dataset.disc;
    majFiltres(); rendu(); majUrl();
  });
}
function majFiltres(){
  document.querySelectorAll('#filtres .puce').forEach(function (b){
    if (b.dataset.bool) b.setAttribute('aria-pressed', String(etat[b.dataset.bool]));
    else b.setAttribute('aria-pressed', String(etat.discipline === b.dataset.disc));
  });
}

/* ---------- résultats ----------
   Modèle d'annuaire : les résultats sont ceux de la ville cherchée, triés par
   distance au centre et paginés. La carte ne décide plus de la liste — elle
   est repliée derrière un bouton et ne fait qu'illustrer les résultats. */
var RAYON_KM = 15;      /* la ville et sa proche banlieue, pas le departement */
var LARGE_KM = 120;     /* le repli quand la ville n'a presque rien */
var PAR_PAGE = 8;       /* 8 plutot que 25 : avec 20 salles fictives, la pagination
                           reste visible dans la maquette */

function calcule(){
  var lat = etat.centre[0], lon = etat.centre[1];
  /* La recherche classe par distance : une salle sans coordonnees n'a pas de
     place sur cette page. Elle reste accessible par sa fiche et par sa ville. */
  var candidats = SALLES.filter(function (s){
    return typeof s[3] === 'number' && typeof s[4] === 'number';
  }).map(function (s){
    return {
      nom:s[0], init:s[1], ville:s[2], lat:s[3], lon:s[4], disc:s[5], note:s[6],
      avis:s[7], pro:s[8], horaires:s[9], ouvert:s[10], detail:s[11],
      fiche:lienFiche(s), km:distanceKm(lat, lon, s[3], s[4])
    };
  });
  candidats.sort(function (a, b){ return a.km - b.km; });

  var zone = candidats;
  if (etat.ville){
    zone = candidats.filter(function (o){ return o.km <= RAYON_KM; });
    /* une ville presque vide ne doit pas renvoyer une page nue : on elargit a la
       region, et le texte sous la liste le dit au lecteur */
    if (zone.length < 3)
      zone = candidats.filter(function (o){ return o.km <= LARGE_KM; }).slice(0, 8);
  }

  var res = [], autres = [];
  zone.forEach(function (o){
    var garde = (!etat.discipline || o.disc.indexOf(etat.discipline) >= 0) &&
                (!etat.ouvert || o.ouvert) && (!etat.pro || o.pro);
    (garde ? res : autres).push(o);
  });
  /* La mise en avant des clubs Pro (Amaury, 23/09/2026). Le tri de JavaScript
     est stable, donc trier sur le seul drapeau Pro remonte les abonnes en
     gardant la distance a l'interieur de chaque groupe. On ne le fait qu'ici,
     sur une liste deja restreinte a un rayon autour de la ville cherchee :
     remonter un abonne de l'autre bout de la France au-dessus de la salle d'a
     cote serait mentir au pratiquant, et la distance reste ecrite sur chaque
     carte. */
  res.sort(function (a, b){ return (b.pro ? 1 : 0) - (a.pro ? 1 : 0); });
  etat.resultats = res;
  etat.autres = autres;
  etat.horsRayon = !!(etat.ville && res.length && res[res.length - 1].km > RAYON_KM);
}

/* ---------- fil d'Ariane ---------- */
function rendFil(){
  var p = ['<a href="index.html">Accueil</a>'];
  if (etat.ville || etat.discipline)
    p.push('<a href="recherche.html">Salles de sports de combat</a>');
  else p.push('<span aria-current="page">Salles de sports de combat</span>');
  if (etat.ville){
    if (etat.discipline)
      p.push('<a href="recherche.html?ville=' + encodeURIComponent(etat.ville) + '">' +
             etat.ville + '</a>');
    else p.push('<span aria-current="page">' + etat.ville + '</span>');
  }
  if (etat.discipline) p.push('<span aria-current="page">' + etat.discipline + '</span>');
  document.getElementById('fil').innerHTML = p.join('<i aria-hidden="true">›</i>');
}

/* ---------- titre ---------- */
function rendTitre(){
  var n = etat.resultats.length;
  /* « de boxe anglaise » mais « de MMA » : le nom s'ecrit differemment dans une
     phrase et sur une pastille de filtre (nomDiscipline, dans _salles.js) */
  var quoi = etat.discipline ? ' de ' + nomDiscipline(etat.discipline) : ' de sports de combat';
  var lieu = etat.ville ? ' à ' + etat.ville : ' en France';
  var h1 = document.getElementById('compte');
  h1.innerHTML = n
    ? '<b>' + n + '</b> salle' + (n > 1 ? 's' : '') + quoi + lieu +
      ' <span class="compte-suite">: comparez les horaires, les disciplines et les avis</span>'
    : 'Aucune salle' + quoi + lieu;
  var etiq = document.getElementById('carte-ville');
  etiq.textContent = etat.ville; etiq.hidden = !etat.ville;
  document.title = (etat.ville ? 'Salles de sports de combat à ' + etat.ville
                               : 'Salles de sports de combat') + ' | Mon Club Combat';
}

/* ---------- une carte de résultat ---------- */
function carteResultat(r, i){
  var d = r.detail || {};
  var mot = (d.presentation && d.presentation[0]) || '';
  if (mot.length > 190) mot = mot.slice(0, 188).replace(/\s+\S*$/, '') + '…';
  return '' +
  '<article class="res' + (i === etat.actif ? ' actif' : '') +
          '" data-i="' + i + '" id="res-' + i + '">' +
    '<div class="res-vignette">' +
      '<span class="res-num">' + (i + 1) + '</span>' +
      '<span class="res-init" aria-hidden="true">' + r.init + '</span>' +
    '</div>' +
    '<div class="res-corps">' +
      '<div class="res-tete">' +
        '<h2 class="res-nom"><a href="' + r.fiche + '">' + r.nom + '</a></h2>' +
        (r.note ? '<span class="note">' + ICONES.etoile + r.note +
                  ' <small>(' + r.avis + ' avis)</small></span>' : '') +
      '</div>' +
      '<div class="res-chips">' + r.disc.map(function (x){
        return '<span class="mini-chip">' + x + '</span>'; }).join('') + '</div>' +
      '<p class="res-adresse">' + ICONES.epingle +
        (d.adresse ? d.adresse + ', ' + (d.cp || '') + ' ' + r.ville : r.ville) +
        ' <span class="res-km">· ' + formateKm(r.km) +
        (etat.ville ? ' du centre' : '') + '</span></p>' +
      (mot ? '<p class="res-mot">' + mot + '</p>' : '') +
      '<div class="res-bas">' +
        (!r.horaires ? ''
          : r.ouvert
          ? '<span class="paire res-ouvert">Ouvert aujourd\'hui · ' + r.horaires + '</span>'
          : '<span class="paire">Fermé aujourd\'hui</span>') +
        /* la réservation en ligne est ce que le club achète : sans Pro, la carte
           renvoie simplement à la fiche, où le pratiquant trouve le téléphone */
        (r.pro
          ? '<a class="btn btn-rouge res-essai" href="' + r.fiche + '#essai">Séance d\'essai</a>'
          : '<a class="btn btn-ligne res-essai" href="' + r.fiche + '">Voir la salle</a>') +
      '</div>' +
    '</div>' +
  '</article>';
}

/* ---------- pagination ---------- */
function nbPages(){ return Math.max(1, Math.ceil(etat.resultats.length / PAR_PAGE)); }

function rendPagination(){
  var boite = document.getElementById('pagination'), total = nbPages();
  if (total < 2){ boite.innerHTML = ''; boite.hidden = true; return; }
  boite.hidden = false;
  var h = '<button type="button" class="pg pg-fl" data-p="' + (etat.page - 1) + '"' +
          (etat.page === 1 ? ' disabled' : '') + ' aria-label="Page précédente">‹</button>';
  for (var p = 1; p <= total; p++){
    h += '<button type="button" class="pg" data-p="' + p + '"' +
         (p === etat.page ? ' aria-current="page"' : '') + '>' + p + '</button>';
  }
  h += '<button type="button" class="pg pg-fl" data-p="' + (etat.page + 1) + '"' +
       (etat.page === total ? ' disabled' : '') + ' aria-label="Page suivante">›</button>';
  boite.innerHTML = h;
}

function vaPage(p){
  etat.page = Math.max(1, Math.min(nbPages(), p));
  rendListe();
  document.getElementById('resultats').scrollIntoView({ block:'start', behavior:'smooth' });
}

/* ---------- le texte de fond, sous la liste ----------
   Il est construit à partir des salles réellement présentes : aucune donnée
   inventée, et il se met à jour tout seul quand la liste change. */
function rendSeo(){
  var res = etat.resultats, n = res.length;
  var ou = etat.ville || 'France';
  document.getElementById('seo-titre').textContent =
    etat.ville ? 'Les sports de combat à ' + etat.ville
               : 'Les sports de combat en France';

  var discs = [], vu = {};
  res.forEach(function (r){ r.disc.forEach(function (d){ if (!vu[d]){ vu[d] = 1; discs.push(d); } }); });
  var ouverts = res.filter(function (r){ return r.ouvert; }).length;

  var t = [];
  if (n){
    t.push('Mon Club Combat référence <b>' + n + ' salle' + (n > 1 ? 's' : '') +
           '</b> de sports de combat ' + (etat.ville ? 'à ' + etat.ville : 'en France') +
           (discs.length > 1
             ? ', réparties sur ' + discs.length + ' disciplines : ' + discs.join(', ') + '.'
             : discs.length ? ', en ' + nomDiscipline(discs[0]) + '.' : '.'));
    if (etat.horsRayon)
      t.push('Il y a peu de salles référencées à ' + ou +
             ' pour l’instant, alors cette liste s’étend aux villes alentour.');
    t.push('<b>' + ouverts + '</b> d’entre elles ' + (ouverts > 1 ? 'sont ouvertes' : 'est ouverte') +
           ' aujourd’hui. Chaque fiche donne les horaires, le planning de la semaine, ' +
           'l’adresse et le contact direct de la salle : vous appelez ou vous écrivez, ' +
           'sans passer par nous.');
    var proche = res[0];
    if (proche) t.push('La plus proche du centre est <a href="' + proche.fiche + '">' +
                       proche.nom + '</a>, à ' + formateKm(proche.km) + '.');
  } else {
    t.push(sansFiltre()
      ? 'Aucune salle n’est encore référencée ' + (etat.ville ? 'à ' + ou : 'ici') +
        '. Si vous dirigez un club, c’est le moment de le référencer : c’est gratuit.'
      : 'Aucune salle ne correspond à cette recherche ' +
        (etat.ville ? 'à ' + ou : '') + '. Enlevez un filtre ou essayez une autre ville.');
  }
  document.getElementById('seo-texte').innerHTML = '<p>' + t.join(' ') + '</p>';

  /* par discipline, dans cette ville */
  var base = etat.ville ? 'recherche.html?ville=' + encodeURIComponent(etat.ville) + '&discipline='
                        : 'recherche.html?discipline=';
  document.getElementById('seo-disc-titre').textContent =
    etat.ville ? 'Par discipline à ' + etat.ville : 'Par discipline';
  document.getElementById('seo-disc').innerHTML = DISCIPLINES.map(function (d){
    /* sans ville, la discipline a sa propre page d'annuaire ; avec une ville, le
       croisement n'existe qu'en recherche */
    var h = etat.ville ? base + encodeURIComponent(d) : pageDiscipline(d);
    return '<a class="puce" href="' + h + '">' + d +
           (etat.ville ? ' à ' + etat.ville : '') + '</a>';
  }).join('');

  /* les autres villes ou il y a des salles */
  var villes = [], deja = {};
  SALLES.forEach(function (s){
    if (s[2] === etat.ville || deja[s[2]]) return;
    deja[s[2]] = 1; villes.push(s[2]);
  });
  document.getElementById('seo-villes').innerHTML = villes.map(function (v){
    return '<a class="puce" href="' + pageVille(v) + '">Sports de combat à ' + v + '</a>';
  }).join('');
}

/* ---------- la liste de la page courante ---------- */
function rendListe(){
  var liste = document.getElementById('liste');
  var n = etat.resultats.length;
  if (!n){
    var ailleurs = [], vu = {};
    SALLES.forEach(function (s){
      if (s[2] === etat.ville || vu[s[2]]) return;
      vu[s[2]] = 1; ailleurs.push(s[2]);
    });
    var nu = sansFiltre();
    /* Trois cas, et pas un seul message fourre-tout : l'annuaire entier est
       vide, la ville est vide, ou ce sont les filtres qui ne rendent rien.
       Tant que l'annuaire est vide, proposer « essayez une autre ville » serait
       un mensonge : il n'y en a aucune qui marche. */
    var toutVide = !SALLES.length;
    var ou = etat.ville ? 'à ' + etat.ville : 'ici';
    liste.innerHTML =
      '<div class="vide">' +
      '<h2 class="display">' + (toutVide || nu ? 'Pas encore de salle ' + ou
                                               : 'Aucun résultat') + '</h2>' +
      '<p>' + (toutVide
        ? 'Aucune salle n’est encore référencée sur Mon Club Combat : nous ouvrons ' +
          'l’annuaire aux clubs en ce moment. Vous dirigez une salle&nbsp;? ' +
          'Soyez le premier de votre ville, c’est gratuit.'
        : nu
        ? 'Aucune salle n’est encore référencée ' + ou + '. Vous dirigez un club&nbsp;? ' +
          'Soyez le premier, c’est gratuit et votre fiche apparaît ici.'
        : 'Aucune salle ne correspond à cette recherche. Enlevez un filtre, ou essayez ' +
          'une autre ville.') + '</p>' +
      (toutVide || nu
        ? '<a class="btn btn-rouge vide-cta" href="clubs.html">Référencer ma salle</a>' : '') +
      (toutVide ? '' :
        '<p class="vide-sous">' + (nu ? 'En attendant, ces villes ont des salles&nbsp;:'
                                      : 'Essayez plutôt&nbsp;:') + '</p>' +
        '<div class="vide-villes">' + ailleurs.slice(0, 6).map(function (v){
          return '<a class="puce" href="' + pageVille(v) + '">' + v + '</a>';
        }).join('') + '</div>') +
      '</div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  var debut = (etat.page - 1) * PAR_PAGE;
  liste.innerHTML = etat.resultats.slice(debut, debut + PAR_PAGE)
    .map(function (r, k){ return carteResultat(r, debut + k); }).join('');

  Array.prototype.forEach.call(liste.querySelectorAll('.res'), function (el){
    var i = +el.dataset.i;
    el.addEventListener('mouseenter', function (){ selectionne(i, false); });
    el.addEventListener('mouseleave', function (){ selectionne(-1, false); });
    el.addEventListener('focusin',    function (){ selectionne(i, false); });
  });
  rendPagination();
}

function rendu(){
  calcule();
  etat.actif = -1;
  etat.verrou = false;
  etat.page = 1;
  rendFil();
  rendTitre();
  /* le champ suit la ville, sauf pendant qu'on y tape */
  var champ = document.getElementById('q-ville');
  var sug = champ.parentNode.querySelector('.sug');
  if (!sug || sug.hidden) champ.value = etat.ville;
  rendListe();
  rendSeo();
  fondSale = true;      /* les noms du fond se replacent autour des nouvelles épingles */
}

document.getElementById('pagination').addEventListener('click', function (e){
  var b = e.target.closest('.pg'); if (!b || b.disabled) return;
  vaPage(+b.dataset.p);
});

/* la carte n'entraine plus de recalcul : la liste ne depend que de la recherche */
function zoneAChange(){}

function selectionne(i, defile){
  if (etat.actif === i) return;
  etat.actif = i;
  Array.prototype.forEach.call(document.querySelectorAll('.res'), function (el){
    el.classList.toggle('actif', +el.dataset.i === i);
  });
  if (defile && i >= 0) montreResultat(i);
}

/* amene le resultat i sous les yeux, en changeant de page s'il le faut : une
   epingle de la carte peut designer une salle qui n'est pas sur la page ouverte */
function montreResultat(i){
  etat.verrou = true;
  var page = Math.floor(i / PAR_PAGE) + 1;
  if (page !== etat.page){
    etat.page = page;
    rendListe();                      /* rendListe repose la classe « actif » */
    rendPagination();
  }
  var cible = document.getElementById('res-' + i);
  if (cible) cible.scrollIntoView({ block:'center', behavior:'smooth' });
}

/* ---------- plan ----------
   Aucune tuile ne peut être chargée (le CSP des Artifacts bloque les images
   externes), donc la carte est dessinée au trait à partir de vraies données
   géographiques embarquées dans geo.js : littoral et départements, lacs,
   fleuves, autoroutes et routes, villes. Projection Mercator, zoom et
   déplacement à la souris. Le fond est rendu dans un canvas hors écran et
   seules les épingles sont redessinées à chaque image. */

var cv = document.getElementById('plan'), cx = cv.getContext('2d');
var fond = document.createElement('canvas'), fx = fond.getContext('2d');
var W = 0, H = 0, DPR = 1, pastille = [], pastilleAutre = [], BB = {}, fondSale = true;
var CALME = matchMedia('(prefers-reduced-motion: reduce)').matches;
var COUCHES = ['fr', 'terre', 'riv', 'lac', 'urb', 'com', 'iris', 'r1', 'r2', 'r3'];
var vue = { lon: 5.3698, lat: 43.2965, k: 600 };

function prepGeo(){ prepCouches(COUCHES, BB); }

function sx(lon){ return W / 2 + (lon - vue.lon) * vue.k; }
function sy(lat){ return H / 2 - (merc(lat) - merc(vue.lat)) * vue.k; }
function lonDe(x){ return vue.lon + (x - W / 2) / vue.k; }
function latDe(y){ return invMerc(merc(vue.lat) - (y - H / 2) / vue.k); }

function cadre(){
  return [lonDe(-40), latDe(H + 40), lonDe(W + 40), latDe(-40)];
}
function kmParPixel(){ return 111.32 * Math.cos(vue.lat * Math.PI / 180) / vue.k; }
function kMini(){ return W / 13; }                       /* la France entière tient à l'écran */
function kMaxi(){ return W / 0.03; }

function mesure(){
  var r = cv.getBoundingClientRect();
  if (r.width < 2 || r.height < 2){ W = 0; H = 0; return; }
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.round(r.width); H = Math.round(r.height);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fond.width = cv.width; fond.height = cv.height;
  fx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fondSale = true;
}

/* cadrage par défaut : la ville et ses environs, jamais plus serré que 14 km de large */
function cadreSurVille(){
  vue.lat = etat.centre[0]; vue.lon = etat.centre[1];
  var maxKm = 6;
  SALLES.forEach(function (s){
    if (etat.ville && s[2] !== etat.ville) return;      /* la ville cherchée, pas ses voisines */
    var k = distanceKm(etat.centre[0], etat.centre[1], s[3], s[4]);
    if (k <= 25 && k > maxKm) maxKm = k;
  });
  var largeurKm = Math.min(Math.max(maxKm * 3.2, 22), 150);
  vue.k = W ? W / (largeurKm / (111.32 * Math.cos(vue.lat * Math.PI / 180))) : 600;
  vue.k = Math.max(kMini(), Math.min(kMaxi(), vue.k));
  fondSale = true;
}

function traceFx(a){
  fx.beginPath();
  fx.moveTo(sx(a[0]), sy(a[1]));
  for (var i = 2; i < a.length; i += 2) fx.lineTo(sx(a[i]), sy(a[i + 1]));
}
function visible(bb, c){
  return !(bb[2] < c[0] || bb[0] > c[2] || bb[3] < c[1] || bb[1] > c[3]);
}
function couche(cle, c, action){
  var tab = GEO[cle], bbs = BB[cle];
  for (var i = 0; i < tab.length; i++){
    if (!visible(bbs[i], c)) continue;
    traceFx(tab[i]);
    action();
  }
}
/* un seul chemin pour toute une couche : bien plus rapide pour les traits */
function chemin(cle, c){
  var tab = GEO[cle], bbs = BB[cle];
  fx.beginPath();
  for (var i = 0; i < tab.length; i++){
    if (!visible(bbs[i], c)) continue;
    var a = tab[i];
    fx.moveTo(sx(a[0]), sy(a[1]));
    for (var j = 2; j < a.length; j += 2) fx.lineTo(sx(a[j]), sy(a[j + 1]));
  }
}

/* étiquettes : on place du plus important au moins important et on refuse
   tout ce qui chevauche ce qui est déjà posé, comme un vrai moteur de carte */
var poses = [];
function libre(x, y, w, h){
  for (var i = 0; i < poses.length; i++){
    var p = poses[i];
    if (x < p[2] && x + w > p[0] && y < p[3] && y + h > p[1]) return false;
  }
  return true;
}
function pose(x, y, w, h){ poses.push([x, y, x + w, y + h]); }
function clefNom(s){
  return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '')
                     : s.toUpperCase();
}

function etiquette(txt, x, y, taille, gras, couleur, dy){
  fx.font = gras + ' ' + taille + 'px Manrope, system-ui, sans-serif';
  var w = fx.measureText(txt).width, h = taille + 3;
  var bx = x - w / 2 - 2, by = y + dy - h, bw = w + 4, bh = h + 3;
  if (bx < 4 || by < 4 || bx + bw > W - 4 || by + bh > H - 4) return false;   /* jamais coupé au bord */
  if (!libre(bx, by, bw, bh)) return false;
  pose(bx, by, bw, bh);
  fx.lineWidth = 3.4; fx.strokeStyle = 'rgba(255,255,255,.95)'; fx.lineJoin = 'round';
  fx.strokeText(txt, x, y + dy);
  fx.fillStyle = couleur; fx.fillText(txt, x, y + dy);
  return true;
}

function dessineFond(){
  var c = cadre(), z = vue.k / kMini();
  poses = [];

  /* Plan clair, dans l'esprit des fonds de carte du web : eau bleu pale, terre
     ivoire, routes claires cernees d'un liseré gris, autoroutes ambrees. */
  fx.fillStyle = '#D6E6F2'; fx.fillRect(0, 0, W, H);        /* mer */

  /* halo côtier : un trait large sous la terre, qui déborde dans l'eau */
  fx.lineJoin = 'round'; fx.lineCap = 'round';
  fx.strokeStyle = 'rgba(120,164,204,.30)'; fx.lineWidth = z > 6 ? 8 : 4;
  chemin('fr', c); fx.stroke();
  chemin('terre', c); fx.stroke();

  fx.fillStyle = '#EDEAE3';                                  /* pays voisins */
  couche('terre', c, function (){ fx.fill(); });

  fx.fillStyle = '#F7F5F0';                                  /* France */
  couche('fr', c, function (){ fx.fill(); });

  fx.fillStyle = '#EAE6DD';                                  /* tache urbanisée */
  couche('urb', c, function (){ fx.fill(); });
  if (z > 3){                                                /* sa lisière, pour qu'on la lise */
    fx.strokeStyle = 'rgba(22,22,15,.07)'; fx.lineWidth = 1;
    chemin('urb', c); fx.stroke();
  }

  if (z > 18){                        /* maille des quartiers : la texture d'une ville */
    fx.strokeStyle = 'rgba(22,22,15,' + (z > 45 ? '.085' : '.06') + ')'; fx.lineWidth = 1;
    chemin('iris', c); fx.stroke();
  }

  if (z > 11){                                               /* maille communale */
    fx.strokeStyle = 'rgba(22,22,15,.12)'; fx.lineWidth = 1;
    chemin('com', c); fx.stroke();
  }

  fx.fillStyle = '#CCE0EF';                                  /* lacs */
  couche('lac', c, function (){ fx.fill(); });

  fx.strokeStyle = 'rgba(96,146,196,.55)';                   /* fleuves */
  fx.lineWidth = z > 6 ? 1.6 : 0.9;
  chemin('riv', c); fx.stroke();

  fx.strokeStyle = 'rgba(22,22,15,.20)';                     /* littoral et départements */
  fx.lineWidth = z > 6 ? 1.1 : 0.8;
  chemin('fr', c); fx.stroke();

  /* routes : un liseré gris puis le cœur clair, comme sur un vrai plan */
  var R = [];
  if (z > 7)   R.push(['r3', '#FFFFFF', z > 20 ? 2.2 : 1.4, 'rgba(22,22,15,.13)']);
  if (z > 1.5) R.push(['r2', '#FFFFFF', z > 20 ? 3 : z > 6 ? 2 : 1.2, 'rgba(22,22,15,.16)']);
  R.push(['r1', '#F6CB7E', z > 20 ? 4 : z > 6 ? 2.8 : 1.6, 'rgba(184,138,44,.55)']);
  R.forEach(function (r){
    chemin(r[0], c);
    fx.strokeStyle = r[3]; fx.lineWidth = r[2] + 2.2; fx.stroke();
  });
  R.forEach(function (r){
    chemin(r[0], c);
    fx.strokeStyle = r[1]; fx.lineWidth = r[2]; fx.stroke();
  });

  /* on interdit aux noms les zones déjà occupées : épingles et commandes */
  pose(0, 0, 200, 54); pose(W - 84, 0, 84, 54);
  pose(W - 152, H - 132, 152, 132); pose(0, H - 52, 214, 52);
  etat.resultats.forEach(function (r){
    pose(sx(r.lon) - 14, sy(r.lat) - 15, 28, 38);
  });

  /* noms : les villes d'abord, puis les communes si on est assez zoomé */
  fx.textAlign = 'center'; fx.textBaseline = 'alphabetic';
  var rangMax = z < 2 ? 6 : z < 5 ? 7 : z < 12 ? 8 : z < 25 ? 9 : 10, vus = {};
  var quota = z < 2 ? 26 : z < 5 ? 38 : 200, posesVilles = 0;
  GEO.villes.forEach(function (v){
    if (v[2] > rangMax || posesVilles >= quota) return;
    if (v[0] < c[0] || v[0] > c[2] || v[1] < c[1] || v[1] > c[3]) return;
    var x = sx(v[0]), y = sy(v[1]), gros = v[2] <= 3;
    vus[clefNom(v[3])] = 1;
    var t = gros ? 12.5 : 11, col = gros ? 'rgba(22,22,15,.86)' : 'rgba(61,59,52,.78)';
    /* au-dessus du point, sinon en dessous : c'est ce que fait un vrai moteur de carte */
    if (etiquette(v[3], x, y, t, '700', col, -8) || etiquette(v[3], x, y, t, '700', col, 14)){
      posesVilles++;
      fx.beginPath(); fx.arc(x, y, gros ? 2.8 : 2.2, 0, 6.2832);
      fx.fillStyle = 'rgba(22,22,15,.42)'; fx.fill();
    }
  });
  if (z > 22){
    var n = 0;
    for (var i = 0; i < GEO.comn.length && n < 70; i++){
      var m = GEO.comn[i];
      if (m[0] < c[0] || m[0] > c[2] || m[1] < c[1] || m[1] > c[3]) continue;
      if (vus[clefNom(m[3])]) continue;
      var mx = sx(m[0]), my = sy(m[1]);
      if (etiquette(m[3], mx, my, 10.5, '600', 'rgba(80,77,69,.66)', 0) ||
          etiquette(m[3], mx, my, 10.5, '600', 'rgba(80,77,69,.66)', 15)) n++;
    }
  }

  majEchelle();
  fondSale = false;
}

function majEchelle(){
  var kmPx = kmParPixel(), cible = 74;
  var pas = [.05,.1,.2,.5,1,2,5,10,20,50,100,200,500], choisi = pas[pas.length - 1];
  for (var i = 0; i < pas.length; i++){ if (pas[i] / kmPx >= 40){ choisi = pas[i]; break; } }
  var px = Math.min(120, Math.max(30, choisi / kmPx));
  document.getElementById('echelle-barre').style.width = Math.round(px) + 'px';
  document.getElementById('echelle-txt').textContent =
    choisi < 1 ? Math.round(choisi * 1000) + ' m' : String(choisi).replace('.', ',') + ' km';
}

function dessine(t){
  if (W < 2 || H < 2){ mesure(); if (W < 2 || H < 2) return; }
  if (fondSale) dessineFond();
  cx.clearRect(0, 0, W, H);
  cx.drawImage(fond, 0, 0, W, H);

  var resp = CALME ? 0 : Math.sin(t / 1500) * .5 + .5;

  /* les salles écartées par un filtre restent visibles, en gris */
  pastilleAutre = etat.autres.map(function (r){ return { x: sx(r.lon), y: sy(r.lat) }; });
  pastilleAutre.forEach(function (p, i){
    if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) return;
    cx.beginPath(); cx.arc(p.x, p.y, i === etat.survolAutre ? 6 : 4.5, 0, 6.2832);
    cx.fillStyle = i === etat.survolAutre ? 'rgba(61,59,52,.92)' : 'rgba(110,105,95,.75)';
    cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,.95)'; cx.lineWidth = 1.5; cx.stroke();
  });

  pastille = etat.resultats.map(function (r){ return { x: sx(r.lon), y: sy(r.lat) }; });
  var serre = vue.k / kMini() < 2.5;
  var ordre = etat.resultats.map(function (_, i){ return i; }).reverse();
  if (etat.actif >= 0){
    ordre = ordre.filter(function (i){ return i !== etat.actif; });
    ordre.push(etat.actif);
  }
  ordre.forEach(function (i){
    var p = pastille[i], vif = (i === etat.actif);
    if (serre && !vif){
      cx.beginPath(); cx.arc(p.x, p.y, 5, 0, 6.2832);
      cx.fillStyle = '#DC1229'; cx.fill();
      cx.strokeStyle = 'rgba(255,255,255,.95)'; cx.lineWidth = 1.2; cx.stroke();
      return;
    }
    var R = vif ? 16 : 12;

    var halo = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 3);
    halo.addColorStop(0, 'rgba(236,22,46,' + ((vif ? .28 : .11) + resp * .05).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(236,22,46,0)');
    cx.fillStyle = halo;
    cx.beginPath(); cx.arc(p.x, p.y, R * 3, 0, 6.2832); cx.fill();

    cx.beginPath();
    cx.moveTo(p.x - 4.5, p.y + R - 3);
    cx.lineTo(p.x + 4.5, p.y + R - 3);
    cx.lineTo(p.x, p.y + R + 7);
    cx.closePath();
    cx.fillStyle = vif ? '#EC162E' : '#DC1229'; cx.fill();

    cx.beginPath(); cx.arc(p.x, p.y, R, 0, 6.2832);
    cx.fillStyle = vif ? '#EC162E' : '#DC1229'; cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,' + (vif ? 1 : .9) + ')';
    cx.lineWidth = 1.6; cx.stroke();

    cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = '800 ' + (vif ? 12.5 : 11) + 'px Manrope, system-ui, sans-serif';
    cx.fillText(String(i + 1), p.x, p.y + .5);
    cx.textBaseline = 'alphabetic';
  });

  if (etat.actif >= 0 && pastille[etat.actif])
    boiteNom(pastille[etat.actif], etat.resultats[etat.actif].nom, 16, true);
  else if (etat.survolAutre >= 0 && pastilleAutre[etat.survolAutre])
    boiteNom(pastilleAutre[etat.survolAutre], etat.autres[etat.survolAutre].nom, 6, false);
}

/* la pastille de nom qui suit le point survolé */
function boiteNom(p, nom, rayon, vif){
  cx.font = '800 12.5px Manrope, system-ui, sans-serif';
  var bw = cx.measureText(nom).width + 22, bh = 30;
  var bx = Math.min(Math.max(p.x - bw / 2, 8), W - bw - 8);
  var by = p.y - rayon - bh - 10;
  if (by < 8) by = p.y + rayon + 8;
  cx.fillStyle = 'rgba(255,255,255,.97)';
  cx.strokeStyle = vif ? 'rgba(220,18,41,.6)' : 'rgba(22,22,15,.20)'; cx.lineWidth = 1;
  if (cx.roundRect){ cx.beginPath(); cx.roundRect(bx, by, bw, bh, 8); cx.fill(); cx.stroke(); }
  else { cx.fillRect(bx, by, bw, bh); cx.strokeRect(bx, by, bw, bh); }
  cx.fillStyle = vif ? '#16160F' : 'rgba(61,59,52,.92)';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(nom, bx + bw / 2, by + bh / 2);
  cx.textBaseline = 'alphabetic';
}

function boucle(t){ if (carteOuverte) dessine(t); requestAnimationFrame(boucle); }

/* ---------- zoom et déplacement ---------- */
function zoomVers(facteur, ax, ay){
  if (ax === undefined){ ax = W / 2; ay = H / 2; }
  var lon = lonDe(ax), lat = latDe(ay);
  var k2 = Math.max(kMini(), Math.min(kMaxi(), vue.k * facteur));
  if (k2 === vue.k) return;
  vue.k = k2;
  /* on garde le point sous le curseur à sa place */
  vue.lon += lon - lonDe(ax);
  vue.lat = invMerc(merc(vue.lat) + merc(lat) - merc(latDe(ay)));
  fondSale = true;
}

var tire = null;
cv.addEventListener('pointerdown', function (e){
  tire = { x: e.clientX, y: e.clientY, lon: vue.lon, lat: vue.lat, bouge: false };
  cv.setPointerCapture(e.pointerId); cv.classList.add('tire');
});
cv.addEventListener('pointermove', function (e){
  var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (tire){
    var dx = e.clientX - tire.x, dy = e.clientY - tire.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) tire.bouge = true;
    vue.lon = tire.lon - dx / vue.k;
    vue.lat = invMerc(merc(tire.lat) + dy / vue.k);
    fondSale = true;
    return;
  }
  /* Quand plusieurs épingles se chevauchent — les salles parisiennes à l'échelle
     de la France tiennent dans quelques pixels — on retient la plus proche du
     curseur, et non la première venue : sinon le point désigné n'est pas celui
     qu'on vise. Le vrai remède reste de regrouper les épingles proches. */
  function laPlusProche(tab, rayon){
    var meilleur = -1, best = rayon;
    for (var i = 0; i < tab.length; i++){
      var d = Math.hypot(tab[i].x - mx, tab[i].y - my);
      if (d < best){ best = d; meilleur = i; }
    }
    return meilleur;
  }
  var trouve = laPlusProche(pastille, 19);
  var gris = trouve < 0 ? laPlusProche(pastilleAutre, 12) : -1;
  etat.survolAutre = gris;
  cv.style.cursor = trouve >= 0 ? 'pointer' : (gris >= 0 ? 'help' : '');
  /* une salle choisie d'un clic reste en evidence tant qu'on n'en vise pas une
     autre : sinon le defilement de la liste eteint la selection a l'instant meme */
  if (trouve >= 0){ etat.verrou = false; selectionne(trouve, false); }
  else if (!etat.verrou) selectionne(-1, false);
});
function relache(e){
  /* un clic net sur une epingle amene le resultat correspondant sous les yeux */
  if (tire && !tire.bouge && etat.actif >= 0) montreResultat(etat.actif);
  tire = null; cv.classList.remove('tire');
}
cv.addEventListener('pointerup', relache);
cv.addEventListener('pointercancel', function (){ tire = null; cv.classList.remove('tire'); });
cv.addEventListener('mouseleave', function (){
  if (!tire && !etat.verrou) selectionne(-1, false);
});
cv.addEventListener('wheel', function (e){
  e.preventDefault();
  var r = cv.getBoundingClientRect();
  zoomVers(Math.pow(0.9988, e.deltaY), e.clientX - r.left, e.clientY - r.top);
  zoneAChange();
}, { passive: false });

document.getElementById('z-plus').addEventListener('click', function (){ zoomVers(1.6); zoneAChange(); });
document.getElementById('z-moins').addEventListener('click', function (){ zoomVers(1 / 1.6); zoneAChange(); });
document.getElementById('z-france').addEventListener('click', function (){
  vue.lon = 2.4; vue.lat = 46.7; vue.k = kMini(); fondSale = true; zoneAChange();
});

/* ---------- recherche de ville ---------- */
function majUrl(){
  var u = new URL(location.href);
  if (etat.ville) u.searchParams.set('ville', etat.ville);
  else u.searchParams.delete('ville');
  if (etat.discipline) u.searchParams.set('discipline', etat.discipline);
  else u.searchParams.delete('discipline');
  history.replaceState(null, '', u);
}
function vaVers(v){
  viseVille(v);
  cadreSurVille();
  rendu();
  majUrl();
}
suggestions(document.getElementById('q-ville'), vaVers);
document.getElementById('form-ville').addEventListener('submit', function (e){
  e.preventDefault();
  var champ = document.getElementById('q-ville');
  var v = villeParNom(champ.value);
  if (v) vaVers(v);
  else { champ.value = etat.ville; champ.select(); }   /* ville inconnue : on ne bouge pas */
});

/* ---------- la carte, repliee par defaut ----------
   Modele annuaire : on arrive sur une liste, et la carte ne s'ouvre que si on
   la demande. Le canvas n'est mesure qu'une fois visible, sinon il fait 0 px. */
var zone = document.getElementById('carte-zone');
var bCarte = document.getElementById('b-carte');
var carteOuverte = false, vueCadree = false;

function ouvreCarte(ouvre){
  carteOuverte = ouvre;
  zone.hidden = !ouvre;
  bCarte.setAttribute('aria-expanded', String(ouvre));
  document.getElementById('b-carte-txt').textContent =
    ouvre ? 'Masquer la carte' : 'Afficher sur la carte';
  if (!ouvre) return;
  mesure();
  if (W && !vueCadree){ cadreSurVille(); vueCadree = true; }
  dessine(0);
}
bCarte.addEventListener('click', function (){ ouvreCarte(!carteOuverte); });

/* ---------- démarrage ---------- */
prepGeo();
construisFiltres();
rendu();

/* Les salles publiees arrivent de la base, apres le premier rendu : on refait
   la liste et les pastilles quand elles sont la. La page reste utilisable si
   la base ne repond pas, elle montre simplement ce qu'elle avait au build. */
document.addEventListener('mcc:salles', function (){
  construisFiltres();
  rendu();
  fondSale = true;
  if (carteOuverte) dessine(0);
});
(function chargeLaBase(){
  function vas(){ if (window.MCC && window.MCC.prete()) window.MCC.chargeSalles(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vas);
  else vas();
})();
function reMesure(){
  if (!carteOuverte) return;
  var avant = W;
  mesure();
  if (W && !avant){ cadreSurVille(); vueCadree = true; }
  if (CALME) dessine(0);
}
if (window.ResizeObserver) new ResizeObserver(reMesure).observe(cv);
else window.addEventListener('resize', reMesure);
if (!CALME) requestAnimationFrame(boucle);
