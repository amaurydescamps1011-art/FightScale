/* Vignette de carte de la fiche salle.

   Volontairement séparée du rendu de la page de résultats : ici la carte est
   figée, cadrée serré sur une seule adresse, sans filtres, sans moteur
   d'étiquettes et sans interaction. Les deux pages partagent ce qui compte
   vraiment, le décodage et la projection, via _geobase.js. */

var MC_COUCHES = ['fr', 'terre', 'lac', 'riv', 'urb', 'com', 'iris', 'r1', 'r2', 'r3'];

function miniCarte(cv, lat, lon, largeurKm){
  var BB = {}, ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, k = 0;

  prepCouches(MC_COUCHES, BB);

  function sx(l){ return W / 2 + (l - lon) * k; }
  function sy(a){ return H / 2 - (merc(a) - merc(lat)) * k; }

  function cadre(){
    return [lon - (W / 2) / k, invMerc(merc(lat) - (H / 2) / k),
            lon + (W / 2) / k, invMerc(merc(lat) + (H / 2) / k)];
  }
  function visible(bb, c){
    return !(bb[2] < c[0] || bb[0] > c[2] || bb[3] < c[1] || bb[1] > c[3]);
  }
  function chemin(cle, c){
    var tab = GEO[cle], bbs = BB[cle];
    ctx.beginPath();
    for (var i = 0; i < tab.length; i++){
      if (!visible(bbs[i], c)) continue;
      var a = tab[i];
      ctx.moveTo(sx(a[0]), sy(a[1]));
      for (var j = 2; j < a.length; j += 2) ctx.lineTo(sx(a[j]), sy(a[j + 1]));
    }
  }
  function remplis(cle, c, couleur){
    chemin(cle, c); ctx.fillStyle = couleur; ctx.fill();
  }
  function trace(cle, c, couleur, ep){
    chemin(cle, c); ctx.strokeStyle = couleur; ctx.lineWidth = ep; ctx.stroke();
  }

  function dessine(){
    var c = cadre();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    ctx.fillStyle = '#D6E6F2'; ctx.fillRect(0, 0, W, H);          /* la mer */
    remplis('terre', c, '#EDEAE3');                                /* les voisins */
    remplis('fr', c, '#F7F5F0');
    remplis('urb', c, '#EAE6DD');                                  /* le tissu urbain */
    trace('iris', c, 'rgba(22,22,15,.07)', 1);                     /* les quartiers */
    trace('com', c, 'rgba(22,22,15,.12)', 1);                      /* les communes */
    remplis('lac', c, '#CCE0EF');
    trace('riv', c, 'rgba(96,146,196,.55)', 1.1);

    /* les routes en deux passes, gaine puis cœur, comme sur la page de résultats :
       [couche, épaisseur de la gaine, épaisseur du cœur, couleur du cœur, couleur de la gaine] */
    var ROUTES = [['r3', 3.4, 1.5, '#FFFFFF', 'rgba(22,22,15,.13)'],
                  ['r2', 4.6, 2.3, '#FFFFFF', 'rgba(22,22,15,.16)'],
                  ['r1', 6.0, 3.2, '#F6CB7E', 'rgba(184,138,44,.55)']];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ROUTES.forEach(function (r){ trace(r[0], c, r[4], r[1]); });
    ROUTES.forEach(function (r){ trace(r[0], c, r[3], r[2]); });

    epingle(sx(lon), sy(lat));
  }

  /* l'épingle de la salle, dessinée à la main pour rester nette en haute densité */
  function epingle(x, y){
    ctx.save();
    ctx.shadowColor = 'rgba(22,22,15,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(x, y - 13, 9.5, Math.PI * 0.82, Math.PI * 0.18);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fillStyle = '#EC162E'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y - 13, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
  }

  function mesure(){
    var r = cv.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    if (!W || !H) return false;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * DPR; cv.height = H * DPR;
    /* largeurKm au centre de la vignette : k est en pixels par degré de longitude */
    k = W / (largeurKm / (111.32 * Math.cos(lat * Math.PI / 180)));
    return true;
  }

  function rendu(){ if (mesure()) dessine(); }

  rendu();
  var minuteur = null;
  window.addEventListener('resize', function (){
    clearTimeout(minuteur); minuteur = setTimeout(rendu, 180);
  });
  return { rendu: rendu };
}
