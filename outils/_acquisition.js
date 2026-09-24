/* ---- la page acquisition ----
   Le choix de la duree d'engagement, qui recalcule les prix sous les yeux ; la
   caisse des packs, qui passe par Stripe (fonction achat-pack) ; l'agenda
   Calendly ; le formulaire « etre rappele », qui ecrit dans la table
   contact_acquisition. La base previent l'equipe par e-mail dans les deux cas
   (previent_l_equipe() et previent_pack_paye() dans db/001_schema.sql).

   Amaury, 24/09/2026 : « un tout petit peu plus d'effet, que ce soit pas
   fige », « prendre un rendez-vous avec un bloc Calendly », « directement payer
   des seances d'essai, les packs ». */
(function (){
  var SB = window.MCC || null;
  var $ = function (id){ return document.getElementById(id); };
  var tous = function (sel, ou){ return Array.prototype.slice.call((ou || document).querySelectorAll(sel)); };
  var calme = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function euros(n){
    var s = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  }

  /* ---------- les packs ----------
     Les memes chiffres que la fonction achat-pack, qui seule fait foi : si on
     les change ici, on les change la-bas. */
  var PACKS = {
    start:  ['Start',  20,  300],
    grow:   ['Grow',   40,  600],
    boost:  ['Boost',  60,  900],
    scale:  ['Scale',  100, 1500],
    pro:    ['Pro',    150, 2250],
    custom: ['Custom', 200, 3000]
  };
  var DUREE = { 0: 0, 15: 3, 20: 6 };      /* remise -> mois d'engagement */
  var remise = 0;
  var choisi = null;

  /* ---------- la duree d'engagement ----------
     Les deux selecteurs, celui des offres et celui de la caisse, n'en font
     qu'un : changer l'un change l'autre. */
  var boutons = tous('.acq-duree button');
  function applique(r){
    remise = r;
    tous('.acq-prix b[data-base]').forEach(function (b){
      b.textContent = euros(Number(b.getAttribute('data-base')) * (100 - r) / 100);
      if (!calme) { b.classList.remove('bouge'); void b.offsetWidth; b.classList.add('bouge'); }
    });
    boutons.forEach(function (x){
      x.setAttribute('aria-checked', String(Number(x.getAttribute('data-remise')) === r));
    });
    var u = $('acq-unite');
    if (u) u.textContent = euros(15 * (100 - r) / 100);
    recap();
  }
  boutons.forEach(function (x){
    x.addEventListener('click', function (){ applique(Number(x.getAttribute('data-remise'))); });
  });

  /* ---------- la caisse ---------- */
  var caisse = $('ag-caisse');
  var cform = $('ag-caisse-form');

  function recap(){
    if (!choisi) return;
    var p = PACKS[choisi], mois = DUREE[remise], prix = p[2] * (100 - remise) / 100;
    $('c-pack').textContent = p[0];
    $('c-nb').textContent = p[1];
    $('c-prix').textContent = euros(prix);
    $('c-unite').textContent = euros(15 * (100 - remise) / 100) + ' HT';
    $('c-engage').textContent = mois
      ? mois + ' mois, soit ' + euros(prix * mois) + ' HT au total'
      : 'Aucun, résiliable chaque mois';
    $('c-payer').textContent = 'Payer ' + euros(prix) + ' HT par carte';
  }

  function ouvre(pack){
    choisi = pack;
    cform.hidden = false;
    $('c-merci').hidden = true;
    $('c-erreur').hidden = true;
    /* ce qui a deja ete tape dans le formulaire du bas n'est pas a retaper */
    [['a-club', 'c-club'], ['a-ville', 'c-ville'], ['a-nom', 'c-nom'],
     ['a-mail', 'c-mail'], ['a-tel', 'c-tel']].forEach(function (c){
      var de = $(c[0]), vers = $(c[1]);
      if (de && vers && !vers.value) vers.value = de.value;
    });
    recap();
    if (caisse.showModal) caisse.showModal(); else caisse.setAttribute('open', '');
    document.documentElement.classList.add('ag-bloque');
  }
  function ferme(){
    if (caisse.close) caisse.close(); else caisse.removeAttribute('open');
  }
  if (caisse) {
    caisse.addEventListener('close', function (){
      document.documentElement.classList.remove('ag-bloque');
    });
    /* un clic sur le voile, hors de la boite, ferme */
    caisse.addEventListener('click', function (e){ if (e.target === caisse) ferme(); });
    $('c-fermer').addEventListener('click', ferme);
    $('c-ok').addEventListener('click', ferme);
    tous('.ag-packs li[data-pack]').forEach(function (li){
      var b = li.querySelector('.ag-choisir');
      var cle = li.getAttribute('data-pack');
      b.setAttribute('aria-label', 'Choisir le pack ' + PACKS[cle][0]);
      b.addEventListener('click', function (){ ouvre(cle); });
    });

    cform.addEventListener('submit', function (e){
      e.preventDefault();
      var err = $('c-erreur');
      err.hidden = true;
      var manque = verifie(['c-club', 'c-ville', 'c-nom', 'c-mail']);
      if (manque) { manque.focus(); return; }
      var corps = {
        pack: choisi, duree: DUREE[remise],
        club: $('c-club').value.trim(), ville: $('c-ville').value.trim(),
        nom: $('c-nom').value.trim(), mail: $('c-mail').value.trim(),
        tel: $('c-tel').value.trim()
      };
      if (!(SB && SB.prete())) {
        err.textContent = 'Le paiement a besoin du serveur. Écrivez-nous à contact@monclubcombat.fr.';
        err.hidden = false; return;
      }
      var payer = $('c-payer'), mot = payer.textContent;
      payer.disabled = true;
      payer.textContent = 'Ouverture du paiement…';
      SB.caisse('achat-pack', corps)
        .then(function (url){ location.href = url; })
        .catch(function (e){
          /* Tant que le paiement n'est pas deploye, la commande devient une
             demande de rappel : l'equipe la recoit et finalise a la main. */
          if (!e || !e.indisponible) throw e;
          var p = PACKS[choisi], mois = DUREE[remise];
          return SB.client.from('contact_acquisition').insert({
            club: corps.club, ville: corps.ville, nom: corps.nom, mail: corps.mail,
            tel: corps.tel || null, pack: choisi,
            message: 'Veut payer le pack ' + p[0] + ', ' +
              (mois ? 'engagement ' + mois + ' mois' : 'sans engagement') +
              ' (paiement en ligne pas encore ouvert).'
          }).then(function (r){
            if (r.error) throw r.error;
            cform.hidden = true;
            $('c-merci-mot').textContent = 'Le paiement en ligne ouvre très bientôt. Nous vous ' +
              'rappelons pour lancer votre pack ' + p[0] + ' et fixer le rendez-vous de brief.';
            $('c-merci').hidden = false;
            payer.disabled = false; payer.textContent = mot;
          });
        })
        .catch(function (e){
          payer.disabled = false; payer.textContent = mot;
          err.textContent = SB.dire(e); err.hidden = false;
        });
    });
  }

  function verifie(ids){
    var manque = null;
    ids.forEach(function (id){
      var c = $(id);
      var vide = !c.value.trim() || (c.type === 'email' && c.value.indexOf('@') < 1);
      c.closest('.champ').classList.toggle('manque', vide);
      if (vide && !manque) manque = c;
    });
    return manque;
  }

  /* ---------- le retour de Stripe ---------- */
  (function (){
    var q = new URLSearchParams(location.search).get('paiement');
    var zone = $('ag-retour');
    if (!q || !zone) return;
    $('ag-retour-mot').textContent = q === 'ok'
      ? 'Paiement reçu, merci. Nous vous appelons pour fixer le rendez-vous de brief.'
      : 'Paiement annulé : rien n’a été débité.';
    zone.classList.toggle('ag-retour-ok', q === 'ok');
    zone.hidden = false;
    $('ag-retour-x').addEventListener('click', function (){ zone.hidden = true; });
    history.replaceState(null, '', location.pathname + location.hash);
  })();

  /* ---------- Calendly ---------- */
  (function (){
    var bloc = $('ag-calendly');
    var url = bloc && bloc.getAttribute('data-url');
    if (!url) return;
    bloc.hidden = false;
    $('parler').classList.add('ag-rdv-deux');
    $('acq-form-t').textContent = 'Ou laissez vos coordonnées';
    var pose = false;
    function charge(){
      if (pose) return; pose = true;
      var s = document.createElement('script');
      s.src = 'https://assets.calendly.com/assets/external/widget.js';
      s.async = true;
      s.onload = function (){
        if (!window.Calendly) return;
        Calendly.initInlineWidget({
          url: url + (url.indexOf('?') < 0 ? '?' : '&') + 'hide_gdpr_banner=1&primary_color=ec162e',
          parentElement: $('ag-calendly-cadre')
        });
      };
      s.onerror = function (){
        $('ag-calendly-cadre').innerHTML = '<a class="ag-btn ag-btn-ligne" target="_blank" ' +
          'rel="noopener" href="' + url.replace(/"/g, '') + '">Ouvrir l’agenda</a>';
      };
      document.head.appendChild(s);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es){
        if (es.some(function (e){ return e.isIntersecting; })) { charge(); io.disconnect(); }
      }, { rootMargin: '800px 0px' });
      io.observe(bloc);
    } else charge();
  })();

  /* ---------- le mouvement ----------
     Les blocs montent a leur arrivee, les chiffres comptent, le planning se
     remplit case a case, la courbe se trace. Rien de tout cela pour qui a
     demande a son systeme de reduire les animations. */
  (function (){
    var main = document.querySelector('main.ag');
    if (!main || calme || !('IntersectionObserver' in window)) return;
    main.classList.add('ag-anime');

    var groupes = [
      ['.ag-heros-dit > *', 90], ['.ag-heros-photo', 0], ['.ag-chiffres li', 110],
      ['.ag-centre > *', 80], ['.ag-carte', 90], ['.ag-planning-dit > *', 80],
      ['.ag-ecran', 0], ['.ag-etroit > :not(.ag-packs)', 60], ['.ag-packs li', 60], ['.ag-rdv', 0]
    ];
    var vus = [];
    groupes.forEach(function (g){
      tous(g[0]).forEach(function (el, i){
        if (el.classList.contains('ag-revele')) return;
        el.classList.add('ag-revele');
        el.style.setProperty('--d', (i * g[1]) + 'ms');
        vus.push(el);
      });
    });
    tous('.ag-agenda .ag-c').forEach(function (c, i){
      /* les cours d'abord, puis les essais qui arrivent un a un */
      var essai = !c.classList.contains('ag-cours');
      c.style.setProperty('--i', essai ? 4 + i : i * 0.3);
    });

    var io = new IntersectionObserver(function (es){
      es.forEach(function (e){
        if (!e.isIntersecting) return;
        e.target.classList.add('vu');
        io.unobserve(e.target);
        if (e.target.matches('.ag-chiffres li')) compte(e.target.querySelector('b'));
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    vus.forEach(function (el){
      io.observe(el);
      /* arrive, l'element rend ses propres transitions : sans cela, le survol
         d'une carte heriterait du delai et de la lenteur de son entree */
      el.addEventListener('transitionend', function fini(e){
        if (e.target !== el || e.propertyName !== 'transform') return;
        el.classList.remove('ag-revele');
        el.style.removeProperty('--d');
        el.removeEventListener('transitionend', fini);
      });
    });

    function compte(b){
      var m = /^(\d+)(.*)$/.exec(b.textContent);
      if (!m || m[1] === '0') return;
      var fin = Number(m[1]), reste = m[2], t0 = null;
      function pas(t){
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / 1100);
        b.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3))) + reste;
        if (k < 1) requestAnimationFrame(pas);
      }
      requestAnimationFrame(pas);
    }
  })();

  /* ---------- le bouton flottant ----------
     Il suit la lecture et s'efface quand le formulaire est a l'ecran : inutile
     d'inviter a prendre contact sous les yeux du formulaire. */
  var flottant = document.querySelector('.ag-flottant');
  var fin = $('contact');
  var heros = document.querySelector('.ag-heros');
  if (flottant && fin && 'IntersectionObserver' in window) {
    var vus2 = { fin: false, heros: true };
    var maj = function (){ flottant.classList.toggle('cache', vus2.fin || vus2.heros); };
    new IntersectionObserver(function (es){
      es.forEach(function (e){ vus2[e.target === fin ? 'fin' : 'heros'] = e.isIntersecting; });
      maj();
    }, { threshold: 0.05 }).observe(fin);
    if (heros) new IntersectionObserver(function (es){
      vus2.heros = es[es.length - 1].isIntersecting; maj();
    }, { rootMargin: '-60% 0px 0px 0px' }).observe(heros);
    maj();
  }

  /* ---------- le formulaire ---------- */
  var form = $('acq-form');
  if (!form) return;
  var erreur = $('a-erreur');
  var envoi = $('a-envoi');

  function dit(t){ erreur.textContent = t; erreur.hidden = !t; }

  form.addEventListener('submit', function (e){
    e.preventDefault();
    dit('');
    var manque = verifie(['a-club', 'a-ville', 'a-nom', 'a-mail']);
    if (manque) { manque.focus(); return; }

    var ligne = {
      club: $('a-club').value.trim(),
      ville: $('a-ville').value.trim(),
      nom: $('a-nom').value.trim(),
      mail: $('a-mail').value.trim(),
      tel: $('a-tel').value.trim() || null,
      pack: $('a-pack').value || null,
      message: $('a-mot').value.trim() || null
    };

    if (!(SB && SB.prete())) {
      dit('L’envoi a besoin du serveur. Écrivez-nous à contact@monclubcombat.fr.');
      return;
    }
    envoi.disabled = true;
    envoi.textContent = 'Envoi…';
    /* pas de returning : un visiteur n'a aucune lecture sur cette table */
    SB.client.from('contact_acquisition').insert(ligne).then(function (r){
      if (r.error) throw r.error;
      form.hidden = true;
      $('acq-merci').hidden = false;
    }).catch(function (err){
      envoi.disabled = false;
      envoi.textContent = 'Être rappelé';
      dit(SB.dire(err));
    });
  });
})();
