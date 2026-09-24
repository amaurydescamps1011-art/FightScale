/* ---- la fenetre de creation de l'espace club ----
   Presente sur toutes les pages. Tout element portant data-compte l'ouvre :
   boutons de l'accueil, des pages d'annuaire, de la recherche, de la fiche.
   Le bouton du bandeau aussi, depuis le 24/09/2026 (Amaury : « ca doit envoyer
   directement le pop-up pour creer un compte et ensuite ca ouvrira l'espace
   club »). Amaury, le meme jour, une heure plus tard : « quand il a clique sur
   referencer, ca le met directement sur la page Espace Pro Ma fiche », et
   « ca renvoie tout le temps sur le dashboard, meme quand ca ne fait pas sens ».
   D'ou une seule regle, destination() : tant que la fiche n'est pas envoyee
   (pas de club, ou club en brouillon), on arrive sur Ma fiche ; ensuite, sur
   l'espace club. « Referencer ma salle » mene toujours a Ma fiche. Deja
   connecte, le meme bouton ouvre cette page dans un onglet a elle.

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

  var BASE = location.href.replace(/[^/?#]*([?#].*)?$/, '');
  /* ou mener un gerant connecte : Ma fiche tant qu'elle n'est pas envoyee */
  function selonClub(club){
    return (!club || club.statut === 'brouillon') ? 'referencer.html' : 'espace-club.html';
  }
  function destination(voulu){
    if (voulu === 'creation') return Promise.resolve('referencer.html');
    return SB.monClub().then(selonClub, function (){ return 'espace-club.html'; });
  }
  /* Le retour de Google n'arrive pas toujours sur redirectTo : si l'adresse
     manque aux Redirect URLs de Supabase, il tombe sur l'accueil, connecte mais
     sur le site public. On note avant de partir ou il voulait aller, et la page
     ou il atterrit, quelle qu'elle soit, l'y emmene. */
  var CLE_APRES = 'mcc_apres_google';
  function lit(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function note(k, v){ try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  if (reel && lit(CLE_APRES)) {
    SB.session().then(function (s){
      if (!s) return;
      var voulu = lit(CLE_APRES);
      note(CLE_APRES, null);
      return destination(voulu).then(function (ou){
        if (location.pathname.split('/').pop() !== ou) location.replace(BASE + ou);
      });
    }).catch(function (){});
  }

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
  var connecte = false;
  document.addEventListener('click', function (e){
    var d = e.target.closest ? e.target.closest('[data-compte]') : null;
    if (!d) return;
    e.preventDefault();
    var voulu = d.getAttribute('data-compte') === 'connexion' ? 'connexion' : 'creation';
    if (connecte) {
      /* l'onglet s'ouvre tout de suite (sinon le navigateur le bloque), puis
         prend la bonne adresse */
      var onglet = window.open('about:blank', '_blank');
      destination(voulu).then(function (ou){
        if (onglet) { onglet.opener = null; onglet.location = BASE + ou; }
        else location.href = BASE + ou;
      });
      return;
    }
    bascule(voulu);
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
      note(CLE_APRES, mode);
      SB.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          /* Ma fiche : elle cree le club au premier passage ; un gerant deja
             publie qui se connecte en est renvoye sur l'espace club (plus haut) */
          redirectTo: BASE + (mode === 'creation' ? 'referencer.html' : 'espace-club.html'),
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
    document.getElementById('fen-etape').textContent = 'Espace club';
    document.getElementById('fen-titre').textContent = creation ? 'Créez votre espace club' : 'Connectez-vous';
    document.getElementById('fen-mot').textContent = creation
      ? 'Vous y remplirez la fiche de votre salle et vous y recevrez les demandes de séance d’essai.'
      : 'Retrouvez votre fiche et les demandes de séance d’essai reçues.';
    document.getElementById('fen-envoi').textContent = creation ? 'Créer mon espace club' : 'Se connecter';
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
      : (mode === 'creation' ? 'Créer mon espace club' : 'Se connecter');
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
    /* a l'inscription, Ma fiche, qui cree le club avec le nom saisi */
    var arrivee = BASE + 'referencer.html' + (nom ? '?nom=' + encodeURIComponent(nom) : '');

    occupe(true);
    var sb = SB.client;
    var p = mode === 'creation'
      ? sb.auth.signUp({ email: mail, password: mdp,
          /* le lien de confirmation ramene aussi a Ma fiche */
          options: { data: { nom_salle: nom }, emailRedirectTo: arrivee } })
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
      if (mode === 'creation') { location.href = arrivee; return; }
      /* a la connexion : Ma fiche si elle n'est pas envoyee, sinon l'espace club */
      destination('connexion').then(function (ou){ location.href = BASE + ou; });
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

  var FLECHE = '<svg class="nav-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><path d="M5 12h13M12.4 5.6 18.8 12l-6.4 6.4"/></svg>';

  /* La pastille de nouvelles demandes : un gerant qui passe sur le site doit voir
     qu'on l'attend sans avoir a ouvrir l'espace club. Elle compte les demandes
     encore a l'etape « Recue », donc elle se vide en travaillant. Au-dela de neuf
     on ecrit « 9+ », pour que le rond garde sa taille. */
  function pastille(n){
    return '<span class="cpt-pastille" aria-hidden="true">' + (n > 9 ? '9+' : n) + '</span>';
  }

  /* Amaury, 23/09/2026 : « une fois connecte (...) il faudrait qu'on ait qu'un
     clic et acceder a mon espace club. Et il n'y a pas tous ces trucs -- mon
     compte, back-office, modifier ma fiche -- quand on est dans l'espace B2C. »

     Donc pas de menu deroulant ici : le bandeau public porte un seul bouton, qui
     mene a l'espace pro, dans un onglet a lui (« il y aura deux pages d'ouvertes,
     la page B2C et la page espace club ») -- le site public reste ouvert derriere. Tout le reste (la fiche, le compte, le back-office, la
     deconnexion) vit dans le rail de cet espace, ou c'est a sa place. */
  function poseMenu(infos){
    if (!bandeau) return;
    var nom = infos.club ? infos.club.nom : (infos.profil && infos.profil.nom) || 'Mon espace';
    var neuves = infos.neuves || 0;
    /* fiche pas encore envoyee : le bouton mene a Ma fiche, pas aux chiffres */
    var ou = selonClub(infos.club);
    var quoi = 'Mon espace club';

    var zone = document.createElement('div');
    zone.className = 'nav-compte';
    zone.innerHTML =
      '<a class="cpt-bouton" href="' + ou + '" target="_blank" rel="noopener">' +
        '<span class="cpt-rond">' + ech(initiales(nom)) +
        (neuves ? pastille(neuves) : '') + '</span>' +
        '<span class="cpt-nom">' + ech(quoi) + '</span>' + FLECHE + '</a>';
    bandeau.parentNode.insertBefore(zone, bandeau);
    bandeau.hidden = true;

    if (neuves) zone.querySelector('.cpt-bouton').setAttribute('aria-label',
      quoi + ', ' + neuves + (neuves === 1 ? ' nouvelle demande' : ' nouvelles demandes'));
  }

  function ech(t){
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (reel && bandeau) {
    SB.session().then(function (s){
      if (!s) return;
      connecte = true;
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

  /* Le menu du telephone se referme au choix d'un lien, ou d'un toucher a
     cote : un <details> seul resterait ouvert par-dessus la page. */
  document.addEventListener('click', function (e){
    var ouverts = document.querySelectorAll('details.nav-mob[open]');
    if (!ouverts.length) return;
    var t = e.target;
    Array.prototype.forEach.call(ouverts, function (d){
      if (!d.contains(t) || (t.closest && t.closest('a'))) d.removeAttribute('open');
    });
  });

  /* Sur telephone, le clavier cache la moitie de l'ecran : on ramene le champ
     touche au milieu de ce qui reste visible. */
  var voileC = document.getElementById('voile');
  if (voileC) voileC.addEventListener('focusin', function (e){
    if (!e.target.matches || !e.target.matches('input') || innerWidth > 620) return;
    setTimeout(function (){ e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
  });
})();
