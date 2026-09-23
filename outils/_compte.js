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
})();
