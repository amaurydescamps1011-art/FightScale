/* ---- le rail de l'espace pro ----
   Il porte ce qui ne change pas d'une page a l'autre : ou on est, le nom de la
   salle, la pastille des demandes en attente, le back-office pour l'equipe, le
   rappel du palier et la deconnexion.

   Il se remplit apres la session, donc apres coup : le squelette est deja a
   l'ecran et ne clignote pas. Sans serveur (la maquette en Artifact), il reste
   tel quel plutot que de disparaitre -- c'est une coque, pas une information. */
(function (){
  var rail = document.getElementById('pro-rail');
  if (!rail) return;

  /* La page ouverte, tiree du nom du fichier : le rail est le meme partout, donc
     c'est lui qui doit savoir ou il est, pas le build. */
  var ici = (location.pathname.split('/').pop() || 'espace-club.html')
    .replace(/\.html$/, '') || 'espace-club';
  var lien = rail.querySelector('[data-page="' + ici + '"]');
  if (lien) lien.setAttribute('aria-current', 'page');

  var SB = window.MCC;
  if (!SB || !SB.prete()) return;

  document.getElementById('pro-quitter').addEventListener('click', function (b){
    var q = document.getElementById('pro-quitter');
    q.disabled = true;
    SB.deconnexion().then(function (){ location.href = 'index.html'; });
  });

  SB.session().then(function (s){
    if (!s) return null;
    return Promise.all([SB.monClub(), SB.estAdmin()]);
  }).then(function (r){
    if (!r) return null;
    var club = r[0], admin = r[1];
    if (admin) document.getElementById('pro-admin').hidden = false;
    if (!club) return null;

    document.getElementById('pro-salle').textContent = club.nom || '';

    if (club.statut === 'publie' && club.slug) {
      var v = document.getElementById('pro-voir');
      v.href = 'salle.html?s=' + encodeURIComponent(club.slug);
      v.hidden = false;
    }

    palier(club);
    return SB.nouvellesDemandes ? SB.nouvellesDemandes(club.id) : 0;
  }).then(function (n){
    if (!n) return;
    var p = document.getElementById('pro-pastille');
    p.textContent = n > 9 ? '9+' : n;
    p.hidden = false;
    var a = rail.querySelector('[data-page="espace-club"]');
    if (a) a.setAttribute('aria-label', 'Espace club, ' + n +
      (n === 1 ? ' nouvelle demande' : ' nouvelles demandes'));
  }).catch(function (){ /* le rail reste un rail */ });

  /* Le rappel du palier suit le gerant de page en page. Pour un Pro c'est une
     ligne qui confirme ; pour un gratuit, la porte vers l'abonnement. */
  function palier(club){
    var pro = (club.offre || 'gratuit') === 'pro';
    var bloc = document.getElementById('pro-palier');
    document.getElementById('pro-palier-t').textContent =
      pro ? 'Mon Club Combat Pro' : 'Fiche gratuite';
    document.getElementById('pro-palier-m').textContent = pro
      ? 'Vos coordonnées sont visibles et vous recevez les réservations.'
      : 'Vos coordonnées sont masquées et votre fiche ne prend pas de réservation.';
    document.getElementById('pro-palier-a').hidden = pro;
    bloc.hidden = false;
  }
})();
