/* ---- l'espace club ----
   Ce que le gerant vient y chercher : ou en est sa fiche, et qui a demande une
   seance d'essai. Rien d'autre tant que le Pro n'existe pas. */
(function (){
  var SB = window.MCC;
  var charge = document.getElementById('esp-charge');
  var erreur = document.getElementById('esp-erreur');

  function dit(msg){ charge.textContent = msg; charge.hidden = false; }
  function rate(msg){ charge.hidden = true; erreur.textContent = msg; erreur.hidden = false; }

  if (!SB || !SB.prete()) {
    rate('L’espace club a besoin d’une connexion au serveur, qui n’est pas disponible ici. ' +
         'Ouvrez le site en ligne pour y accéder.');
    return;
  }
  var sb = SB.client;
  var ech = function (t){
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  var MOT = {
    brouillon:  ['Brouillon', 'Votre fiche n’est pas encore envoyée. Remplissez-la et envoyez-la pour qu’elle soit vérifiée.'],
    en_attente: ['En vérification', 'Nous vérifions votre fiche. Vous serez prévenu dès qu’elle paraît dans l’annuaire.'],
    publie:     ['En ligne', 'Votre fiche est visible dans l’annuaire et dans les recherches de votre ville.'],
    refuse:     ['À corriger', 'Votre fiche n’a pas été retenue. Corrigez-la et renvoyez-la.'],
    suspendu:   ['Suspendue', 'Votre fiche est retirée de l’annuaire. Écrivez-nous pour en connaître la raison.']
  };
  var SUIVI = {
    recue:     'Reçue',
    confirmee: 'Confirmée',
    honoree:   'Venue',
    absente:   'Absente',
    annulee:   'Annulée'
  };

  SB.session().then(function (s){
    if (!s) { SB.exigeCompte(); dit('Connectez-vous pour accéder à votre espace club.'); return null; }
    return SB.monClub();
  }).then(function (club){
    if (club === null) return;
    if (!club) {
      rate('Aucun club n’est rattaché à ce compte. Passez par « Référencer ma salle » pour le créer.');
      return;
    }
    charge.hidden = true;
    document.getElementById('esp-corps').hidden = false;
    document.getElementById('esp-nom').textContent = club.nom || 'Votre espace club';

    var m = MOT[club.statut] || ['—', ''];
    document.getElementById('esp-statut').textContent = m[0];
    var pastille = document.getElementById('esp-etat');
    pastille.className = 'esp-etat esp-' + club.statut;
    pastille.hidden = false;
    document.getElementById('esp-mot').textContent =
      club.statut === 'refuse' && club.motif_refus
        ? m[1] + ' Motif : ' + club.motif_refus
        : m[1];

    if (club.statut === 'publie' && club.slug) {
      var lien = document.getElementById('esp-voir');
      lien.href = 'salle.html?s=' + encodeURIComponent(club.slug);
      lien.hidden = false;
    }
    return demandes(club);
  }).catch(function (e){ rate(SB.dire(e)); });

  function demandes(club){
    return sb.from('demande').select('*').eq('club_id', club.id)
      .order('cree_le', { ascending: false })
      .then(function (r){
        if (r.error) throw r.error;
        var l = r.data || [];
        document.getElementById('esp-demandes-bloc').hidden = false;
        document.getElementById('esp-nb').textContent = l.length;
        document.getElementById('esp-nb-ok').textContent = l.filter(function (d){
          return d.statut === 'confirmee' || d.statut === 'honoree'; }).length;

        /* La reservation en ligne appartient au palier Pro. Sur une fiche
           gratuite, deux compteurs a zero donneraient l'impression que la page
           est cassee : on les retire et on dit ce qui les remplirait. */
        var gratuit = (club.offre || 'gratuit') !== 'pro';
        var compteurs = document.querySelector('.esp-chiffres');
        if (compteurs) compteurs.hidden = gratuit && !l.length;
        /* sur une fiche gratuite, annoncer « les demandes » promet une liste qui
           n'arrivera jamais : la section dit alors ce qui la remplirait */
        document.getElementById('esp-oeil').textContent =
          gratuit ? 'Mon Club Combat Pro' : 'Ce que vous avez reçu';
        document.getElementById('esp-titre').textContent =
          gratuit ? 'Recevez vos demandes de séance d’essai'
                  : 'Les demandes de séance d’essai';
        document.getElementById('esp-vide').textContent = gratuit
          ? 'Les pratiquants vous appellent et vous écrivent directement : vos '
            + 'coordonnées sont sur votre fiche. La réservation en ligne, elle, fait '
            + 'partie de Mon Club Combat Pro : la demande arriverait ici et vous la '
            + 'confirmeriez d’un bouton.'
          : 'Aucune demande pour l’instant. Elles arriveront ici dès que votre fiche '
            + 'sera en ligne.';
        document.getElementById('esp-vide').hidden = l.length > 0;
        document.getElementById('esp-demandes').innerHTML = l.map(ligne).join('');
      });
  }

  function ligne(d){
    var quand = new Date(d.cree_le).toLocaleDateString('fr-FR',
      { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return '<li class="demande" data-id="' + ech(d.id) + '">' +
      '<div class="dem-qui"><b>' + ech(d.nom) + '</b>' +
        '<span class="dem-quand">' + ech(quand) + '</span></div>' +
      '<ul class="dem-coord">' +
        '<li><a href="mailto:' + ech(d.mail) + '">' + ech(d.mail) + '</a></li>' +
        (d.tel ? '<li><a href="tel:' + ech(d.tel.replace(/\s/g, '')) + '">' + ech(d.tel) + '</a></li>' : '') +
        (d.discipline ? '<li>' + ech(d.discipline) + '</li>' : '') +
      '</ul>' +
      (d.message ? '<p class="dem-mot">' + ech(d.message) + '</p>' : '') +
      '<div class="dem-suivi">' +
        '<span class="dem-etat dem-' + ech(d.statut) + '">' + ech(SUIVI[d.statut] || d.statut) + '</span>' +
        (d.statut === 'recue'
          ? '<button type="button" class="btn btn-ligne btn-mini" data-suivi="confirmee">Réservation confirmée</button>' +
            '<button type="button" class="btn btn-ligne btn-mini" data-suivi="annulee">Annulée</button>'
          : d.statut === 'confirmee'
          ? '<button type="button" class="btn btn-ligne btn-mini" data-suivi="honoree">Est venue</button>' +
            '<button type="button" class="btn btn-ligne btn-mini" data-suivi="absente">Absente</button>'
          : '') +
      '</div></li>';
  }

  /* Le suivi porte la regle metier d'Amaury : une demande recue n'est pas un lead,
     seule une reservation confirmee en est un. C'est ce bouton qui fait la bascule. */
  document.getElementById('esp-demandes').addEventListener('click', function (e){
    var b = e.target.closest('[data-suivi]');
    if (!b) return;
    var li = b.closest('.demande');
    b.disabled = true;
    sb.from('demande').update({ statut: b.dataset.suivi }).eq('id', li.dataset.id)
      .select().single()
      .then(function (r){
        if (r.error) throw r.error;
        li.outerHTML = ligne(r.data);
      })
      .catch(function (err){ b.disabled = false; rate(SB.dire(err)); });
  });
})();
