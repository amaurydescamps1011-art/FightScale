/* ---- la fiche, branchee sur la base ----
   Charge le club du compte connecte, remplit le formulaire avec, et enregistre
   pour de bon a l'envoi. Sans base joignable (CSP d'un Artifact), ce script ne
   fait rien : le formulaire garde son comportement de demonstration. */
(function (){
  var SB = window.MCC;
  if (!SB || !SB.prete()) return;
  var sb = SB.client;
  var form = document.getElementById('form-club');
  if (!form) return;

  var clubId = null;
  var JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  var val = function (id){ return (document.getElementById(id).value || '').trim(); };
  var pose = function (id, v){
    var c = document.getElementById(id);
    if (c && v != null) c.value = v;
  };

  /* ---------- au chargement : session, puis club ---------- */
  SB.session().then(function (s){
    if (!s) { SB.exigeCompte('referencer.html'); return; }
    /* pas encore de club : il est cree ici, avec le nom saisi a l'inscription */
    return SB.assureMonClub(new URLSearchParams(location.search).get('nom'));
  }).then(function (club){
    if (!club) return;
    clubId = club.id;
    remplit(club);
  }).catch(function (e){ avertit(SB.dire(e)); });

  /* ---------- du club vers le formulaire ---------- */
  function remplit(c){
    pose('c-nom', c.nom);           pose('c-adresse', c.adresse);
    pose('c-ville', c.ville);       pose('c-cp', c.code_postal);
    pose('c-mot', c.presentation);  pose('c-contact', c.contact_nom);
    pose('c-tel', c.tel);           pose('c-mail', c.mail);
    pose('c-web', c.site);          pose('c-insta', c.instagram);
    pose('c-fb', c.facebook);

    var disc = c.disciplines || [];
    Array.prototype.forEach.call(form.querySelectorAll('[name="disciplines"]'), function (ch){
      ch.checked = disc.indexOf(ch.value) >= 0;
    });
    var h = c.horaires || {};
    /* horaires vides = fiche neuve : on laisse la semaine par defaut du formulaire */
    if (Object.keys(h).length) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-jour]'), function (ch){
        var p = h[JOURS[+ch.dataset.jour]];
        ch.checked = !!p;
        if (p && p[0]) poseTemps('[data-de="' + ch.dataset.jour + '"]', p[0]);
        if (p && p[1]) poseTemps('[data-a="'  + ch.dataset.jour + '"]', p[1]);
        ch.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    /* le planning des cours : c'est lui que la fiche proposera a la reservation */
    if (window.MCC_POSE_COURS) window.MCC_POSE_COURS(c.cours || []);
    /* une fiche deja envoyee le dit, plutot que de faire croire a un brouillon */
    if (c.statut === 'en_attente') etat('Votre fiche est en cours de vérification.');
    if (c.statut === 'publie')     etat('Votre fiche est en ligne. Vos modifications repasseront par une vérification.');
    if (c.statut === 'refuse')     etat('Votre fiche n’a pas été retenue : ' + (c.motif_refus || 'motif non précisé') + '. Corrigez-la et renvoyez-la.');
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function etat(msg){
    var z = document.getElementById('c-etat');
    if (!z) return;
    z.textContent = msg; z.hidden = false;
  }
  function avertit(msg){
    var z = document.getElementById('c-erreur');
    if (!z) return;
    z.textContent = msg; z.hidden = !msg;
  }

  /* ---------- du formulaire vers le club ---------- */
  function poseTemps(sel, v){
    var ch = document.querySelector(sel);
    if (ch) ch.value = v;
  }
  function temps(sel, repli){
    var ch = document.querySelector(sel);
    return (ch && ch.value) || repli;
  }
  /* Les deux heures saisies par le club etaient ignorees : tout partait en
     09:00 - 21:00. Une salle ouverte le soir se voyait donc annoncer ouverte
     des le matin, sur sa fiche comme dans le « ouvert aujourd'hui ». */
  function horaires(){
    var h = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-jour]'), function (ch){
      if (!ch.checked) return;
      h[JOURS[+ch.dataset.jour]] = [temps('[data-de="' + ch.dataset.jour + '"]', '09:00'),
                                    temps('[data-a="'  + ch.dataset.jour + '"]', '21:00')];
    });
    return h;
  }
  function coursSaisis(){
    return (window.MCC_COURS && window.MCC_COURS()) || [];
  }
  function disciplines(){
    return Array.prototype.map.call(
      form.querySelectorAll('[name="disciplines"]:checked'), function (c){ return c.value; });
  }

  /* Les photos partent dans le bucket « photos-clubs », rangees par club. Le nom
     porte l'horodatage : deux envois ne s'ecrasent pas, et l'ordre est celui de
     la galerie. */
  function envoiePhotos(fichiers){
    if (!fichiers.length) return Promise.resolve([]);
    var base = Date.now();
    return Promise.all(fichiers.map(function (f, i){
      var ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      var chemin = clubId + '/' + base + '-' + i + '.' + ext;
      return sb.storage.from('photos-clubs').upload(chemin, f, { upsert: true })
        .then(function (r){ if (r.error) throw r.error; return chemin; });
    }));
  }

  /* On remplace le gestionnaire d'envoi de la maquette. Il faut ecouter sur un
     ANCETRE en capture : sur l'element cible lui-meme, capture et bouillonnement
     partent dans l'ordre d'enregistrement, et celui de la maquette est pose en
     premier, donc il passerait avant. */
  document.addEventListener('submit', function (e){
    if (e.target !== form || !clubId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    avertit('');

    var manque = null;
    Array.prototype.forEach.call(form.querySelectorAll('[required]'), function (ch){
      if (!ch.value.trim() && !manque) manque = ch;
    });
    if (!manque && !disciplines().length) manque = form.querySelector('[name="disciplines"]');
    if (manque){
      manque.focus();
      manque.closest('.bloc').classList.add('bloc-manque');
      setTimeout(function (){ manque.closest('.bloc').classList.remove('bloc-manque'); }, 1600);
      return;
    }

    var bouton = form.querySelector('button[type="submit"]');
    var texte = bouton ? bouton.textContent : '';
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi…'; }

    var fichiers = (window.MCC_PHOTOS && window.MCC_PHOTOS()) || [];
    envoiePhotos(fichiers).then(function (chemins){
      var champs = {
        nom: val('c-nom'), adresse: val('c-adresse'), ville: val('c-ville'),
        code_postal: val('c-cp'), presentation: val('c-mot'),
        contact_nom: val('c-contact'), tel: val('c-tel'), mail: val('c-mail'),
        site: val('c-web'), instagram: val('c-insta'), facebook: val('c-fb'),
        disciplines: disciplines(), horaires: horaires(), cours: coursSaisis(),
        statut: 'en_attente'
      };
      if (chemins.length) champs.photos = chemins;
      return sb.from('club').update(champs).eq('id', clubId);
    }).then(function (r){
      if (r && r.error) throw r.error;
      document.getElementById('merci-recap').textContent =
        val('c-nom') + ' · ' + disciplines().length + ' discipline' +
        (disciplines().length > 1 ? 's' : '') + ' · ' +
        Object.keys(horaires()).length + ' jours d’ouverture' +
        (coursSaisis().length ? ' · ' + coursSaisis().length + ' cours' : '');
      form.classList.add('envoye');
      document.getElementById('merci').classList.add('on');
      form.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }).catch(function (err){
      if (bouton) { bouton.disabled = false; bouton.textContent = texte; }
      avertit(SB.dire(err));
    });
  }, true);
})();
