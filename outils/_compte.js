/* ---- la fenetre de creation de l'espace club ----
   Presente sur toutes les pages. Tout element portant data-compte l'ouvre :
   boutons de l'accueil, des pages d'annuaire, de la recherche, de la fiche.
   Seul le bouton du bandeau reste un lien vers la page de vente.

   Depuis le 23/09/2026 elle cree un vrai compte. Deux chemins possibles selon
   le reglage de Supabase :
     - confirmation par e-mail desactivee : l'inscription ouvre une session, on
       enchaine directement sur la fiche ;
     - confirmation activee : il n'y a pas de session, donc pas de club creable
       tout de suite. On le dit, et c'est referencer.html qui creera le club au
       premier passage une fois le compte confirme.
   Quand la base n'est pas joignable (CSP d'un Artifact), on retombe sur
   l'ancien comportement de demonstration : la maquette reste consultable. */
(function (){
  var voile = document.getElementById('voile');
  if (!voile) return;
  var form     = document.getElementById('form-compte');
  var erreur   = document.getElementById('fen-erreur');
  var envoi    = document.getElementById('fen-envoi');
  var champNom = document.getElementById('champ-nom');
  var rendu = null;
  var mode = 'creation';

  var SB = window.MCC || null;
  var reel = !!(SB && SB.prete());

  /* ---------- ouverture et fermeture ---------- */
  function ouvre(){
    rendu = document.activeElement;
    voile.hidden = false;
    document.body.classList.add('fige');
    (mode === 'creation' ? document.getElementById('k-nom')
                         : document.getElementById('k-mail')).focus();
  }
  function ferme(){
    voile.hidden = true;
    document.body.classList.remove('fige');
    if (rendu) rendu.focus();
  }
  /* la recherche et l'annuaire reecrivent leurs resultats : on ecoute le document
     plutot que chaque bouton, pour que ceux crees plus tard marchent aussi */
  document.addEventListener('click', function (e){
    var d = e.target.closest ? e.target.closest('[data-compte]') : null;
    if (!d) return;
    e.preventDefault();
    bascule(d.getAttribute('data-compte') === 'connexion' ? 'connexion' : 'creation');
    ouvre();
  });

  document.getElementById('fermer-compte').addEventListener('click', ferme);
  voile.addEventListener('mousedown', function (e){ if (e.target === voile) ferme(); });
  document.addEventListener('keydown', function (e){
    if (e.key === 'Escape' && !voile.hidden) ferme();
    /* la fenetre garde le focus tant qu'elle est ouverte */
    if (e.key === 'Tab' && !voile.hidden) {
      var f = voile.querySelectorAll('button, input, a[href]');
      f = Array.prototype.filter.call(f, function (x){ return x.offsetParent !== null; });
      if (!f.length) return;
      var premier = f[0], dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
  });

  /* ---------- « Continuer avec Google » ----------
     Supabase porte l'echange OAuth de bout en bout : on l'envoie sur Google, il
     revient sur redirectTo avec une session ouverte. Il n'y a donc ni mot de
     passe a stocker ni e-mail a confirmer, et l'adresse est verifiee par Google.
     Le club, lui, est cree au premier passage sur referencer.html, comme apres
     une inscription classique -- c'est le seul endroit qui sait s'il en existe
     deja un.

     Le fournisseur se regle dans Supabase (Authentication > Providers > Google).
     Tant qu'il n'est pas active, le bouton n'a rien a offrir : il disparait, avec
     le trait « ou », plutot que de mener a une page d'erreur Google. */
  var google = document.getElementById('fen-google');
  var ou = document.getElementById('fen-ou');
  google.addEventListener('click', function (){
      montre('');
      /* sans serveur (la maquette en Artifact, ou une coupure), le bouton reste
         affiche -- c'est le chemin principal, le cacher donnerait a voir une
         fenetre qui n'est pas celle du site -- mais il dit pourquoi il ne part pas */
      if (!reel) { montre('La connexion Google a besoin du serveur. Sur le site en ligne, ce bouton vous y emmène.'); return; }
      google.disabled = true;
      document.getElementById('fen-google-mot').textContent = 'Ouverture de Google…';
      SB.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: location.href.replace(/[^/]*$/, '') + 'referencer.html',
          /* on ne demande que l'identite : ni contacts, ni agenda, ni rien qui
             ferait hesiter un gerant devant l'ecran d'autorisation */
          scopes: 'email profile'
        }
      }).then(function (r){
        if (r && r.error) throw r.error;
        /* succes = le navigateur part chez Google, il n'y a rien a faire ici */
      }).catch(function (e){
        google.disabled = false;
        document.getElementById('fen-google-mot').textContent = 'Continuer avec Google';
        montre(/provider is not enabled/i.test(String(e && e.message))
          ? 'La connexion Google n’est pas encore ouverte. Créez votre espace avec votre e-mail.'
          : SB.dire(e));
      });
  });

  /* ---------- creation ou connexion ---------- */
  function bascule(v){
    mode = v;
    var creation = mode === 'creation';
    champNom.hidden = !creation;
    document.getElementById('k-nom').required = creation;
    document.getElementById('fen-etape').textContent = creation ? 'Étape 1 sur 2' : 'Espace club';
    document.getElementById('fen-titre').textContent = creation ? 'Créez votre espace club' : 'Connectez-vous';
    document.getElementById('fen-mot').textContent = creation
      ? 'Vous y modifierez votre fiche et vous y recevrez les demandes de séance d’essai. La fiche de votre salle se remplit juste après.'
      : 'Retrouvez votre fiche et les demandes de séance d’essai reçues.';
    document.getElementById('fen-envoi').textContent = creation ? 'Continuer vers ma fiche' : 'Se connecter';
    document.getElementById('k-mdp').setAttribute('autocomplete', creation ? 'new-password' : 'current-password');
    document.getElementById('k-mdp-aide').hidden = !creation;
    document.getElementById('fen-note').hidden = !creation;
    Array.prototype.forEach.call(voile.querySelectorAll('[data-mode]'), function (s){
      s.hidden = s.getAttribute('data-mode') !== mode;
    });
    montre('');
  }
  document.getElementById('fen-vers-connexion').addEventListener('click', function (){ bascule('connexion'); });
  document.getElementById('fen-vers-creation').addEventListener('click',  function (){ bascule('creation'); });

  /* Mot de passe oublie. On ne dit jamais si l'adresse existe : ce serait dire
     a n'importe qui quels clubs ont un compte chez nous. */
  document.getElementById('fen-oubli').addEventListener('click', function (){
    var mail = document.getElementById('k-mail').value.trim();
    if (!mail) {
      document.getElementById('k-mail').focus();
      montre('Écrivez votre e-mail, nous vous enverrons un lien.');
      return;
    }
    if (!reel) { montre('La réinitialisation a besoin d’une connexion au serveur.'); return; }
    occupe(true);
    SB.client.auth.resetPasswordForEmail(mail, {
      redirectTo: location.href.replace(/[^/]*$/, '') + 'motdepasse.html'
    }).then(function (){
      form.hidden = true;
      document.getElementById('fen-renvoi-mail').textContent = mail;
      document.getElementById('fen-renvoi').hidden = false;
    }).catch(function (e){ occupe(false); montre(SB.dire(e)); });
  });

  function montre(msg){
    erreur.textContent = msg || '';
    erreur.hidden = !msg;
  }
  function occupe(oui){
    envoi.disabled = oui;
    envoi.textContent = oui ? 'Un instant…'
      : (mode === 'creation' ? 'Continuer vers ma fiche' : 'Se connecter');
  }

  form.addEventListener('submit', function (e){
    e.preventDefault();
    montre('');
    var manque = false;
    Array.prototype.forEach.call(form.querySelectorAll('input[required]'), function (c){
      if (c.closest('.champ').hidden) { c.closest('.champ').classList.remove('manque'); return; }
      var vide = !c.value.trim() || (c.type === 'email' && c.value.indexOf('@') < 1)
                 || (mode === 'creation' && c.minLength > 0 && c.value.length < c.minLength);
      c.closest('.champ').classList.toggle('manque', vide);
      if (vide && !manque) { c.focus(); manque = true; }
    });
    if (manque) return;

    var nom  = document.getElementById('k-nom').value.trim();
    var mail = document.getElementById('k-mail').value.trim();
    var mdp  = document.getElementById('k-mdp').value;

    /* pas de base joignable : la maquette garde son comportement d'avant */
    if (!reel) { location.href = 'referencer.html?nom=' + encodeURIComponent(nom); return; }

    occupe(true);
    var sb = SB.client;
    var p = mode === 'creation'
      ? sb.auth.signUp({ email: mail, password: mdp, options: { data: { nom_salle: nom } } })
      : sb.auth.signInWithPassword({ email: mail, password: mdp });

    p.then(function (r){
      if (r.error) { occupe(false); montre(SB.dire(r.error)); return; }

      /* inscription sans session : Supabase attend la confirmation de l'adresse */
      if (mode === 'creation' && !(r.data && r.data.session)) {
        form.hidden = true;
        document.getElementById('fen-verif-mail').textContent = mail;
        document.getElementById('fen-verif').hidden = false;
        return;
      }
      /* le nom saisi amorce la fiche ; le club lui-meme est cree par referencer.html,
         qui est le seul endroit ou l'on sait s'il en existe deja un */
      location.href = 'referencer.html' + (nom ? '?nom=' + encodeURIComponent(nom) : '');
    }).catch(function (err){
      occupe(false);
      montre(SB.dire(err));
    });
  });

  /* ---------- le compte dans le bandeau ----------
     Amaury, 23/09/2026 : « je veux que ca cree un vrai compte. Ca ouvre une
     nouvelle page ou il y a un vrai profil de compte (...) pas que ca ouvre une
     page fichue sale et qu'apres il ne puisse plus rien faire ». Un compte qui
     n'apparait nulle part n'est pas un compte : des qu'une session est ouverte,
     le bouton « Referencer ma salle » du bandeau cede la place au compte, sur
     toutes les pages du site puisque ce script est pose partout.

     Tant qu'on ne sait pas encore s'il y a une session, on ne touche a rien :
     remplacer le bouton puis le remettre ferait clignoter le bandeau. */
  var bandeau = document.querySelector('.site-nav .btn-rouge')
             || document.querySelector('.site-header .btn-rouge');

  function initiales(t){
    var mots = String(t || '').normalize ? String(t).normalize('NFD').replace(/[̀-ͯ]/g, '') : String(t || '');
    mots = mots.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    if (!mots.length) return '?';
    if (mots.length === 1) return mots[0].slice(0, 2);
    return mots.slice(0, 2).map(function (m){ return m[0]; }).join('');
  }

  var CHEV = '<svg class="nav-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  /* La pastille de nouvelles demandes : un gerant qui passe sur le site doit voir
     qu'on l'attend sans avoir a ouvrir l'espace club. Elle compte les demandes
     encore a l'etape « Recue », donc elle se vide en travaillant. Au-dela de neuf
     on ecrit « 9+ », pour que le rond garde sa taille. */
  function pastille(n){
    return '<span class="cpt-pastille" aria-hidden="true">' + (n > 9 ? '9+' : n) + '</span>';
  }

  function poseMenu(infos){
    if (!bandeau) return;
    var nom = infos.club ? infos.club.nom : (infos.profil && infos.profil.nom) || 'Mon compte';
    var neuves = infos.neuves || 0;
    var liens = [];
    if (infos.club) {
      liens.push(['espace-club.html', 'Mon espace club', neuves]);
      liens.push(['referencer.html', 'Modifier ma fiche']);
      if (infos.club.statut === 'publie' && infos.club.slug)
        liens.push(['salle.html?s=' + encodeURIComponent(infos.club.slug), 'Voir ma fiche en ligne']);
    } else {
      liens.push(['referencer.html', 'Créer la fiche de ma salle']);
    }
    liens.push(['mon-compte.html', 'Mon compte']);
    if (infos.admin) liens.push(['admin.html', 'Back-office']);

    var zone = document.createElement('div');
    zone.className = 'nav-compte';
    zone.innerHTML =
      '<button class="cpt-bouton" type="button" id="cpt-bouton" aria-expanded="false" ' +
        'aria-haspopup="true"><span class="cpt-rond">' + ech(initiales(nom)) +
        (neuves ? pastille(neuves) : '') + '</span>' +
        '<span class="cpt-nom">' + ech(nom) + '</span>' + CHEV + '</button>' +
      '<div class="cpt-menu" id="cpt-menu" hidden>' +
        '<p class="cpt-tete"><b>' + ech(nom) + '</b><span>' + ech(infos.mail) + '</span></p>' +
        '<ul class="cpt-liens">' + liens.map(function (l){
            return '<li><a href="' + l[0] + '">' + ech(l[1]) +
                   (l[2] ? pastille(l[2]) : '') + '</a></li>';
          }).join('') + '</ul>' +
        '<button type="button" class="cpt-sortie" id="cpt-sortie">Se déconnecter</button>' +
      '</div>';
    bandeau.parentNode.insertBefore(zone, bandeau);
    bandeau.hidden = true;

    var b = zone.querySelector('#cpt-bouton');
    var m = zone.querySelector('#cpt-menu');
    /* la pastille est un decor : c'est le bouton qui dit le chiffre a voix haute */
    if (neuves) b.setAttribute('aria-label', nom + ' — ' + neuves +
      (neuves === 1 ? ' nouvelle demande' : ' nouvelles demandes'));
    function ouvert(oui){
      m.hidden = !oui;
      b.setAttribute('aria-expanded', oui ? 'true' : 'false');
    }
    b.addEventListener('click', function (e){
      e.stopPropagation();
      ouvert(m.hidden);
    });
    document.addEventListener('click', function (e){
      if (!m.hidden && !zone.contains(e.target)) ouvert(false);
    });
    document.addEventListener('keydown', function (e){
      if (e.key === 'Escape' && !m.hidden) { ouvert(false); b.focus(); }
    });
    /* On quitte la page apres la deconnexion : l'espace club et la fiche
       n'auraient plus rien a montrer, et l'accueil est la page d'un visiteur. */
    zone.querySelector('#cpt-sortie').addEventListener('click', function (){
      var s = zone.querySelector('#cpt-sortie');
      s.disabled = true;
      s.textContent = 'Déconnexion…';
      SB.deconnexion().then(function (){ location.href = 'index.html'; });
    });
  }

  function ech(t){
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (reel && bandeau) {
    SB.session().then(function (s){
      if (!s) return;
      var mail = (s.user && s.user.email) || '';
      return Promise.all([SB.monClub(), SB.monProfil(), SB.estAdmin()])
        .then(function (r){
          /* un club gratuit ne recoit aucune demande : on ne l'interroge que si
             la fonction existe, pour qu'une vieille page mise en cache ne casse pas */
          var n = (r[0] && SB.nouvellesDemandes) ? SB.nouvellesDemandes(r[0].id) : 0;
          return Promise.resolve(n).then(function (neuves){
            poseMenu({ mail: mail, club: r[0], profil: r[1], admin: r[2], neuves: neuves });
          });
        });
    }).catch(function (){ /* le bandeau reste celui d'un visiteur */ });
  }
})();
