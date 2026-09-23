/* ---- Mon compte ----
   Amaury, 23/09/2026 : « je veux que ca cree un vrai compte. Ca ouvre une
   nouvelle page ou il y a un vrai profil de compte, etc. Genre, l'impression
   d'un vrai compte, pas que ca ouvre une page fichue sale et qu'apres il ne
   puisse plus rien faire, plus avoir aucune data. Je veux quand meme que, meme
   le mec gratuit qui a cree un compte, il y ait un minimum de data, au moins
   qu'il ait un profil de compte et qu'il soit enregistre quelque part. »

   D'ou cette page : ce que la personne ecrit sur elle-meme va dans la table
   `profil` (une ligne par compte, que seul son proprietaire lit et ecrit), le
   rappel de sa salle vient de `club`, et le mot de passe passe par Supabase.
   Rien n'est decoratif : tout ce qui s'affiche ici sort de la base, et tout ce
   qu'on y tape y retourne. */
(function (){
  var SB = window.MCC;
  var charge = document.getElementById('mc-charge');
  var erreur = document.getElementById('mc-erreur');

  function dit(m){ charge.textContent = m; charge.hidden = false; }
  function rate(m){ charge.hidden = true; erreur.textContent = m; erreur.hidden = false; }

  if (!SB || !SB.prete()) {
    rate('Cette page a besoin d’une connexion au serveur, qui n’est pas disponible ici. ' +
         'Ouvrez le site en ligne pour y accéder.');
    return;
  }

  var ech = function (t){
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
  var MOT = {
    brouillon:  'Brouillon',
    en_attente: 'En vérification',
    publie:     'En ligne',
    refuse:     'À corriger',
    suspendu:   'Suspendue'
  };
  function leJour(t){
    if (!t) return '';
    return new Date(t).toLocaleDateString('fr-FR',
      { day: 'numeric', month: 'long', year: 'numeric' });
  }

  var moi = null;

  SB.session().then(function (s){
    if (!s) {
      SB.exigeCompte();
      dit('Connectez-vous pour voir votre compte.');
      return null;
    }
    moi = s.user || null;
    return Promise.all([SB.monProfil(), SB.monClub()]);
  }).then(function (r){
    if (!r) return;
    charge.hidden = true;
    remplit(r[0] || {}, r[1]);
  }).catch(function (e){ rate(SB.dire(e)); });

  /* ---------- l'affichage ---------- */
  function remplit(profil, club){
    document.getElementById('mc-form').hidden = false;
    document.getElementById('mc-mdp-form').hidden = false;
    document.getElementById('mc-sortie-bloc').hidden = false;

    document.getElementById('mc-nom').value      = profil.nom || '';
    document.getElementById('mc-tel').value      = profil.tel || '';
    document.getElementById('mc-fonction').value = profil.fonction || '';
    document.getElementById('mc-mail').value     = (moi && moi.email) || '';

    var depuis = document.getElementById('mc-depuis');
    var ne = leJour(moi && moi.created_at);
    depuis.textContent = ne
      ? 'Vous êtes connecté avec ' + (moi.email || 'ce compte') + ', créé le ' + ne + '.'
      : 'Vous êtes connecté avec ' + ((moi && moi.email) || 'ce compte') + '.';

    panneau(club);
  }

  function panneau(club){
    var p = document.getElementById('mc-panneau');
    p.hidden = false;
    var faits = document.getElementById('mc-faits');
    var liens = document.getElementById('mc-liens');
    var offre = document.getElementById('mc-offre');

    if (!club) {
      /* Un compte sans salle n'est pas une erreur : c'est quelqu'un qui s'est
         inscrit et n'a pas fini. On lui dit ou reprendre. */
      document.getElementById('mc-club').textContent = 'Pas encore de salle';
      faits.innerHTML = '<li>Votre compte existe, votre fiche reste à remplir.</li>';
      liens.innerHTML = '<a class="btn btn-rouge" href="referencer.html">Créer la fiche de ma salle</a>';
      return;
    }

    document.getElementById('mc-club').textContent = club.nom || 'Votre salle';
    var pastille = document.getElementById('mc-etat');
    document.getElementById('mc-statut').textContent = MOT[club.statut] || '—';
    pastille.className = 'esp-etat esp-' + club.statut;
    pastille.hidden = false;

    var l = [];
    if (club.ville) l.push('À ' + club.ville);
    var d = club.disciplines || [];
    if (d.length) l.push(d.length === 1 ? d[0] : d.length + ' disciplines');
    var ph = club.photos || [];
    l.push(ph.length ? (ph.length === 1 ? 'Une photo' : ph.length + ' photos') : 'Aucune photo');
    var co = club.cours || [];
    l.push(co.length ? (co.length === 1 ? 'Un cours au planning' : co.length + ' cours au planning')
                     : 'Planning à remplir');
    if (club.cree_le) l.push('Fiche créée le ' + leJour(club.cree_le));
    faits.innerHTML = l.map(function (x){ return '<li>' + ech(x) + '</li>'; }).join('');

    var boutons = ['<a class="btn btn-rouge" href="espace-club.html">Mon espace club</a>',
                   '<a class="btn btn-ligne" href="referencer.html">Modifier ma fiche</a>'];
    if (club.statut === 'publie' && club.slug)
      boutons.push('<a class="btn btn-ligne" href="salle.html?s=' +
        encodeURIComponent(club.slug) + '">Voir ma fiche en ligne</a>');
    liens.innerHTML = boutons.join('');

    offre.hidden = false;
    offre.innerHTML = (club.offre === 'pro')
      ? '<b>Mon Club Combat Pro</b><span>Votre fiche est mise en avant, vos coordonnées ' +
        'sont visibles et vous recevez les réservations de séance d’essai.</span>'
      : '<b>Formule gratuite</b><span>Votre fiche est visible, mais elle ne montre ni votre ' +
        'téléphone ni votre e-mail et ne prend pas de réservation. ' +
        '<a href="clubs.html#pro">Voir ce que le Pro ajoute</a>.</span>';
  }

  /* ---------- enregistrer le profil ---------- */
  document.getElementById('mc-form').addEventListener('submit', function (e){
    e.preventDefault();
    erreur.hidden = true;
    var bouton = document.getElementById('mc-envoi');
    var fait = document.getElementById('mc-fait');
    fait.hidden = true;
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';
    SB.poseProfil({
      nom:      document.getElementById('mc-nom').value.trim() || null,
      tel:      document.getElementById('mc-tel').value.trim() || null,
      fonction: document.getElementById('mc-fonction').value.trim() || null
    }).then(function (ligne){
      bouton.disabled = false;
      bouton.textContent = 'Enregistrer';
      /* on reaffiche ce que la base a garde, pas ce qui a ete tape */
      document.getElementById('mc-nom').value      = ligne.nom || '';
      document.getElementById('mc-tel').value      = ligne.tel || '';
      document.getElementById('mc-fonction').value = ligne.fonction || '';
      fait.hidden = false;
    }).catch(function (err){
      bouton.disabled = false;
      bouton.textContent = 'Enregistrer';
      rate(SB.dire(err));
    });
  });

  /* ---------- changer le mot de passe ----------
     Il n'y a pas d'e-mail a envoyer ici : la session est deja ouverte, donc
     Supabase accepte le changement directement. C'est le seul chemin qui marche
     tant que nous n'avons pas d'expediteur d'e-mails a nous. */
  var mdpForm = document.getElementById('mc-mdp-form');
  mdpForm.addEventListener('submit', function (e){
    e.preventDefault();
    var err = document.getElementById('mc-mdp-err');
    var fait = document.getElementById('mc-mdp-fait');
    var bouton = document.getElementById('mc-mdp-envoi');
    var a = document.getElementById('mc-mdp').value;
    var b = document.getElementById('mc-mdp2').value;
    fait.hidden = true;
    function dis(m){ err.textContent = m; err.hidden = !m; }
    if (a.length < 8) { dis('Huit caractères au minimum.'); document.getElementById('mc-mdp').focus(); return; }
    if (a !== b) { dis('Les deux mots de passe ne sont pas les mêmes.'); document.getElementById('mc-mdp2').focus(); return; }
    dis('');
    bouton.disabled = true;
    bouton.textContent = 'Un instant…';
    SB.client.auth.updateUser({ password: a }).then(function (r){
      bouton.disabled = false;
      bouton.textContent = 'Changer mon mot de passe';
      if (r.error) { dis(SB.dire(r.error)); return; }
      document.getElementById('mc-mdp').value = '';
      document.getElementById('mc-mdp2').value = '';
      fait.hidden = false;
    }).catch(function (e2){
      bouton.disabled = false;
      bouton.textContent = 'Changer mon mot de passe';
      dis(SB.dire(e2));
    });
  });

  /* ---------- se deconnecter ---------- */
  document.getElementById('mc-sortie').addEventListener('click', function (){
    var b = document.getElementById('mc-sortie');
    b.disabled = true;
    b.textContent = 'Déconnexion…';
    SB.deconnexion().then(function (){ location.href = 'index.html'; });
  });
})();
