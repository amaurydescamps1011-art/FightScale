/* Socle géographique partagé par la page de résultats et la fiche salle.
   Ne contient que ce qui ne dépend d'aucune vue : le décodage des tracés et la
   projection. Le rendu, lui, diffère d'une page à l'autre (la recherche est
   interactive avec un moteur d'étiquettes, la fiche est une vignette figée). */

/* Les tracés arrivent encodés (delta + varint, précision 1e-4°, façon polyline
   Google) : cinq fois plus léger qu'un tableau de nombres. On les déplie une
   seule fois au démarrage, en tableaux plats [lon,lat,lon,lat,…]. */
function deplie(s){
  var out = [], i = 0, n = s.length, x = 0, y = 0, r, sh, b;
  while (i < n){
    r = 0; sh = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    x += (r & 1) ? ~(r >> 1) : (r >> 1);
    r = 0; sh = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    y += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push(x / 1e4, y / 1e4);
  }
  return out;
}

/* Déplie les couches demandées et calcule le cadre de chaque anneau, pour
   pouvoir écarter d'un test ce qui tombe hors de l'écran. GEO est modifié sur
   place, donc une couche déjà dépliée est laissée telle quelle : on peut
   redemander une préparation sans abîmer les tracés. */
var GEO_PRET = {};
function prepCouches(couches, BB){
  couches.forEach(function (cle){
    var t = GEO[cle];
    if (GEO_PRET[cle]){ BB[cle] = GEO_PRET[cle]; return; }
    for (var j = 0; j < t.length; j++) t[j] = deplie(t[j]);
    BB[cle] = t.map(function (a){
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var i = 0; i < a.length; i += 2){
        var x = a[i], y = a[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return [x0, y0, x1, y1];
    });
    GEO_PRET[cle] = BB[cle];
  });
}

/* Mercator : y en « degrés » pour garder une seule échelle k (px par degré de longitude) */
function merc(lat){ return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI; }
function invMerc(y){ return (Math.atan(Math.exp(y * Math.PI / 180)) - Math.PI / 4) * 360 / Math.PI; }

function distanceKm(lat1, lon1, lat2, lon2){
  var dy = (lat2 - lat1) * 111.32;
  var dx = (lon2 - lon1) * 111.32 * Math.cos((lat1 + lat2) * Math.PI / 360);
  return Math.sqrt(dx * dx + dy * dy);
}
