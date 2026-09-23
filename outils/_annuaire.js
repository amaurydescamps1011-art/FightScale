/* ---- les pages d'annuaire se completent depuis la base ----
   Ces pages sont ecrites a l'avance, pour que Google les lise sans JavaScript.
   Elles portent donc les clubs connus au dernier build. Un club valide depuis
   n'y est pas encore : on va le chercher dans la base et on l'ajoute, plutot
   que de laisser un visiteur lire « aucune salle » alors qu'il y en a une.

   Le rendu du serveur reste intact tant que rien n'arrive : si la base est
   injoignable, la page ne bouge pas et ne casse rien. */
(function (){
  var zone = document.getElementById('resultats');
  var SB = window.MCC;
  if (!zone || !SB || !SB.prete()) return;

  var ville = zone.dataset.ville || '';
  var discipline = zone.dataset.discipline || '';
  var liste = zone.querySelector('.liste');
  if (!liste) return;

  var PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  function ech(t){
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* La meme carte que celle du serveur (build_annuaire.carte_salle), sans la
     note : un vrai club n'en a pas, et on n'en invente pas. */
  function carte(s, i){
    var d = s[11];
    var mot = (d.presentation || [''])[0] || '';
    if (mot.length > 190) mot = mot.slice(0, 188).replace(/\s+\S*$/, '') + '…';
    var ou = [d.adresse, [d.cp, s[2]].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return '<article class="res">' +
      '<div class="res-vignette"><span class="res-num">' + i + '</span>' +
        '<span class="res-init" aria-hidden="true">' + ech(s[1]) + '</span></div>' +
      '<div class="res-corps">' +
        '<div class="res-tete"><h2 class="res-nom">' +
          '<a href="salle.html?s=' + encodeURIComponent(d.slug) + '">' + ech(s[0]) + '</a>' +
        '</h2></div>' +
        '<div class="res-chips">' +
          s[5].map(function (x){ return '<span class="mini-chip">' + ech(x) + '</span>'; }).join('') +
        '</div>' +
        (ou ? '<p class="res-adresse">' + PIN + ech(ou) + '</p>' : '') +
        (mot ? '<p class="res-mot">' + ech(mot) + '</p>' : '') +
        '<div class="res-bas">' +
          (s[9] ? '<span class="paire' + (s[10] ? ' res-ouvert' : '') + '">' +
                  (s[10] ? 'Ouvert aujourd’hui · ' + ech(s[9]) : 'Fermé aujourd’hui') + '</span>' : '') +
          (s[8]
            ? '<a class="btn btn-rouge res-essai" href="salle.html?s=' +
              encodeURIComponent(d.slug) + '#essai">Séance d’essai</a>'
            : '<a class="btn btn-ligne res-essai" href="salle.html?s=' +
              encodeURIComponent(d.slug) + '">Voir la salle</a>') +
        '</div>' +
      '</div></article>';
  }

  /* « ou pratiquer Boxe anglaise » ne se dit pas : meme table d'articles que
     build_annuaire.ART, pour que la phrase soit la meme des deux cotes. */
  var ART = { 'MMA': 'le MMA', 'Boxe anglaise': 'la boxe anglaise',
    'Kickboxing': 'le kickboxing', 'Muay Thaï': 'le Muay Thaï',
    'Jiu-jitsu brésilien': 'le jiu-jitsu brésilien', 'Grappling': 'le grappling',
    'Karaté': 'le karaté', 'Judo': 'le judo' };

  function phrase(n){
    var pluriel = n > 1 ? 's' : '';
    if (ville)
      return 'Mon Club Combat référence <b>' + n + ' salle' + pluriel +
             '</b> de sports de combat à ' + ech(ville) + '.';
    return 'Mon Club Combat référence <b>' + n + ' salle' + pluriel +
           '</b> où pratiquer ' + ech(ART[discipline] || discipline) + ' en France.';
  }

  document.addEventListener('mcc:salles', function (){
    var lot = window.SALLES.filter(function (s){
      return ville ? s[2] === ville : s[5].indexOf(discipline) >= 0;
    });
    if (!lot.length) return;
    /* Mise en avant des abonnes (Amaury, 23/09/2026) : les clubs Pro en tete,
       chaque groupe restant classe par nom. Toutes ces salles sont dans la meme
       ville ou la meme discipline, donc l'ordre n'enleve rien a personne. */
    lot.sort(function (a, b){
      return ((b[8] ? 1 : 0) - (a[8] ? 1 : 0)) || a[0].localeCompare(b[0], 'fr');
    });
    liste.innerHTML = lot.map(function (s, i){ return carte(s, i + 1); }).join('');
    var intro = document.querySelector('.ann-intro');
    if (intro) intro.innerHTML = phrase(lot.length);

    /* Les boutons du haut etaient ceux de la page vide (« Voir les villes
       couvertes ») : maintenant qu'il y a des salles, on propose la carte. */
    var actions = document.querySelector('.ann-actions');
    if (actions) {
      var vers = ville ? 'recherche.html?ville=' + encodeURIComponent(ville)
                       : 'recherche.html?discipline=' + encodeURIComponent(discipline);
      actions.innerHTML =
        '<a class="btn btn-rouge" href="' + vers + '">Voir sur la carte</a>' +
        '<button class="btn btn-ligne" type="button" data-compte>Référencer ma salle</button>';
    }
  });

  SB.chargeSalles();
})();
