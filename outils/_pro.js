/* ---- le rail de l'espace pro ----
   Il porte ce qui ne change pas d'une page a l'autre : ou on est, le nom de la
   salle, la pastille des demandes en attente, le back-office pour l'equipe et
   le rappel du palier. Le compte et la deconnexion vivent en haut a droite,
   dans le menu du compte (Amaury, 24/09/2026 : « comme le font habituellement
   les logiciels »). Au passage, la deconnexion ne clignote plus au pied du rail
   pendant que le rappel du palier se charge.

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
  var lien = rail.querySelector('[data-page="' + ici + '"]')
          || document.querySelector('#pro-cpt-menu [data-page="' + ici + '"]');
  if (lien) lien.setAttribute('aria-current', 'page');

  /* ---------- le menu du compte ---------- */
  var btn = document.getElementById('pro-cpt-btn');
  var menu = document.getElementById('pro-cpt-menu');
  function ouvre(oui){
    menu.hidden = !oui;
    btn.setAttribute('aria-expanded', String(oui));
  }
  if (btn && menu) {
    btn.addEventListener('click', function (e){ e.stopPropagation(); ouvre(menu.hidden); });
    document.addEventListener('click', function (e){
      if (!menu.hidden && !menu.contains(e.target)) ouvre(false);
    });
    document.addEventListener('keydown', function (e){
      if (e.key === 'Escape' && !menu.hidden) { ouvre(false); btn.focus(); }
    });
  }

  var SB = window.MCC;
  if (!SB || !SB.prete()) return;

  document.getElementById('pro-quitter').addEventListener('click', function (b){
    var q = document.getElementById('pro-quitter');
    q.disabled = true;
    SB.deconnexion().then(function (){ location.href = 'index.html'; });
  });

  SB.session().then(function (s){
    if (!s) return null;
    var mail = (s.user && s.user.email) || '';
    return Promise.all([SB.monClub(), SB.estAdmin(),
      SB.monProfil ? SB.monProfil().catch(function (){ return null; }) : null])
      .then(function (r){ r.push(mail); return r; });
  }).then(function (r){
    if (!r) return null;
    var club = r[0], admin = r[1], profil = r[2], mail = r[3];
    compte(profil, mail, club);
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

  /* Le rond du compte : les initiales de la personne, a defaut celles de
     l'adresse. Le nom complet et l'adresse sont dans le menu. */
  function compte(profil, mail, club){
    var nom = (profil && profil.nom) || '';
    var base = nom || mail.split('@')[0] || (club && club.nom) || '';
    var mots = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    var ini = mots.length > 1 ? mots[0][0] + mots[1][0] : (mots[0] || '').slice(0, 2);
    if (ini) document.getElementById('pro-cpt-rond').textContent = ini;
    document.getElementById('pro-cpt-nom').textContent = nom || 'Mon compte';
    document.getElementById('pro-cpt-qui').textContent = nom || (club && club.nom) || 'Mon compte';
    document.getElementById('pro-cpt-mail').textContent = mail;
  }

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
