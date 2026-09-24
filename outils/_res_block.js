/* ---------- résultats ----------
   Modèle d'annuaire : les résultats sont ceux de la ville cherchée, triés par
   distance au centre et paginés. La carte ne décide plus de la liste — elle
   est repliée derrière un bouton et ne fait qu'illustrer les résultats. */
var RAYON_KM = 30;      /* une ville et sa couronne */
var PAR_PAGE = 10;

function calcule(){
  var lat = etat.centre[0], lon = etat.centre[1];
  var candidats = SALLES.map(function (s){
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
    /* une ville sans rien autour ne doit pas renvoyer une page vide : on montre
       alors les salles les plus proches, en le disant dans le texte */
    if (zone.length < 3) zone = candidats.slice(0, 12);
  }

  var res = [], autres = [];
  zone.forEach(function (o){
    var garde = (!etat.discipline || o.disc.indexOf(etat.discipline) >= 0) &&
                (!etat.ouvert || o.ouvert) && (!etat.pro || o.pro);
    (garde ? res : autres).push(o);
  });
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
  /* on garde la casse d'origine : « en MMA » et « en Muay Thaï » ne se minusculent pas */
  var quoi = etat.discipline ? ' de ' + etat.discipline : ' de sports de combat';
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
  '<article class="res" data-i="' + i + '" id="res-' + i + '">' +
    '<div class="res-vignette">' +
      '<span class="res-num">' + (i + 1) + '</span>' +
      '<span class="res-init" aria-hidden="true">' + r.init + '</span>' +
    '</div>' +
    '<div class="res-corps">' +
      '<div class="res-tete">' +
        '<h2 class="res-nom"><a href="' + r.fiche + '">' + r.nom + '</a></h2>' +
        '<span class="note">' + ICONES.etoile + r.note + ' <small>(' + r.avis + ' avis)</small></span>' +
      '</div>' +
      '<div class="res-chips">' + r.disc.map(function (x){
        return '<span class="mini-chip">' + x + '</span>'; }).join('') + '</div>' +
      '<p class="res-adresse">' + ICONES.epingle +
        (d.adresse ? d.adresse + ', ' + (d.cp || '') + ' ' + r.ville : r.ville) +
        ' <span class="res-km">· ' + formateKm(r.km) +
        (etat.ville ? ' du centre' : '') + '</span></p>' +
      (mot ? '<p class="res-mot">' + mot + '</p>' : '') +
      '<div class="res-bas">' +
        (r.ouvert
          ? '<span class="paire res-ouvert">Ouvert aujourd\'hui · ' + r.horaires + '</span>'
          : '<span class="paire">Fermé aujourd\'hui</span>') +
        '<a class="btn btn-rouge res-essai" href="' + r.fiche + '#contact">Séance d\'essai</a>' +
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
             : discs.length ? ', en ' + discs[0] + '.' : '.'));
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
    t.push('Aucune salle ne correspond à cette recherche ' +
           (etat.ville ? 'à ' + ou : '') + '. Enlevez un filtre ou essayez une autre ville.');
  }
  document.getElementById('seo-texte').innerHTML = '<p>' + t.join(' ') + '</p>';

  /* par discipline, dans cette ville */
  var base = etat.ville ? 'recherche.html?ville=' + encodeURIComponent(etat.ville) + '&discipline='
                        : 'recherche.html?discipline=';
  document.getElementById('seo-disc-titre').textContent =
    etat.ville ? 'Par discipline à ' + etat.ville : 'Par discipline';
  document.getElementById('seo-disc').innerHTML = DISCIPLINES.map(function (d){
    return '<a class="puce" href="' + base + encodeURIComponent(d) + '">' + d +
           (etat.ville ? ' à ' + etat.ville : '') + '</a>';
  }).join('');

  /* les autres villes ou il y a des salles */
  var villes = [], deja = {};
  SALLES.forEach(function (s){
    if (s[2] === etat.ville || deja[s[2]]) return;
    deja[s[2]] = 1; villes.push(s[2]);
  });
  document.getElementById('seo-villes').innerHTML = villes.map(function (v){
    return '<a class="puce" href="recherche.html?ville=' + encodeURIComponent(v) + '">' +
           'Sports de combat à ' + v + '</a>';
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
    liste.innerHTML =
      '<div class="vide"><h2 class="display">Pas encore de salle ici</h2>' +
      '<p>Aucune salle ne correspond à cette recherche. Enlevez un filtre, ' +
      'ou essayez une autre ville.</p>' +
      '<div class="vide-villes">' + ailleurs.slice(0, 6).map(function (v){
        return '<a class="puce" href="recherche.html?ville=' + encodeURIComponent(v) + '">' + v + '</a>';
      }).join('') + '</div></div>';
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

/* amene le resultat i sous les yeux, en changeant de page s'il le faut */
function montreResultat(i){
  var page = Math.floor(i / PAR_PAGE) + 1;
  if (page !== etat.page){ etat.page = page; rendListe(); }
  var cible = document.getElementById('res-' + i);
  if (cible) cible.scrollIntoView({ block:'center', behavior:'smooth' });
}
