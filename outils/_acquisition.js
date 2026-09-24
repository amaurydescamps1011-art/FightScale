/* ---- la page acquisition ----
   Le choix de la duree d'engagement, qui recalcule les prix sous les yeux ; le
   paiement des packs, sur les pages de Stripe (liens de paiement) ; le panneau
   « En discuter », qui ouvre l'agenda Calendly ou, faute d'agenda, le petit
   formulaire « etre rappele » qui ecrit dans la table contact_acquisition. La base previent l'equipe par e-mail dans les deux cas
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

  /* ---------- la duree d'engagement ----------
     Le bouton « Choisir » de chaque pack suit la duree choisie ici. */
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
  }
  boutons.forEach(function (x){
    x.addEventListener('click', function (){ applique(Number(x.getAttribute('data-remise'))); });
  });

  /* ---------- le paiement d'un pack ----------
     « Choisir » mene a la page de paiement de Stripe du pack, a la duree
     d'engagement choisie : un lien de paiement par pack et par duree, crees
     dans Stripe. Stripe y demande la carte, l'adresse de facturation, le nom
     du club et sa ville ; le webhook `paiement-stripe` cree la commande.
     Amaury, 24/09/2026 : notre caisse maison « donne le moins confiance au
     monde ». */
  tous('.ag-packs li[data-pack]').forEach(function (li){
    var b = li.querySelector('.ag-choisir');
    var cle = li.getAttribute('data-pack');
    b.setAttribute('aria-label', 'Choisir le pack ' + PACKS[cle][0]);
    b.addEventListener('click', function (){
      var liens = SB && SB.stripe && SB.stripe.packs && SB.stripe.packs[cle];
      var url = liens && liens[String(DUREE[remise])];
      if (!url) {
        /* sans lien, on ne fait pas semblant : on ouvre le panneau pour en
           discuter, pack deja note */
        var sel = $('a-pack'); if (sel) sel.value = cle;
        ouvre(b);
        return;
      }
      b.classList.add('part');
      location.href = url;
    });
  });

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

  /* ---------- le panneau « En discuter » ----------
     Amaury, 24/09/2026 : plutot qu'un formulaire en bas de page, « un pop-up
     sur le cote (...) et la ca ouvre sur un Calendly ». Tout element marque
     data-parler l'ouvre ; Echap, la croix et le voile le referment, et le
     focus revient au bouton qui l'a ouvert. */
  var panneau = $('parler'), voile = $('ag-voile'), avant = null;
  var bloc = $('ag-calendly');
  var agenda = bloc && bloc.getAttribute('data-url');
  if (agenda) {
    bloc.hidden = false;
    var f0 = $('acq-form'); if (f0) f0.hidden = true;
    panneau.classList.add('ag-panneau-large');
  }
  var pose = false;
  function calendly(){
    if (!agenda || pose) return; pose = true;
    var sc = document.createElement('script');
    sc.src = 'https://assets.calendly.com/assets/external/widget.js';
    sc.async = true;
    sc.onload = function (){
      if (!window.Calendly) return;
      Calendly.initInlineWidget({
        url: agenda + (agenda.indexOf('?') < 0 ? '?' : '&') + 'hide_gdpr_banner=1&primary_color=ec162e',
        parentElement: $('ag-calendly-cadre')
      });
    };
    sc.onerror = function (){
      $('ag-calendly-cadre').innerHTML = '<a class="ag-btn ag-btn-ligne" target="_blank" ' +
        'rel="noopener" href="' + agenda.replace(/"/g, '') + '">Ouvrir l’agenda</a>';
    };
    document.head.appendChild(sc);
  }
  function ouvre(depuis){
    if (!panneau) return;
    avant = depuis || document.activeElement;
    panneau.hidden = false; voile.hidden = false;
    document.documentElement.classList.add('ag-fige');
    requestAnimationFrame(function (){ panneau.classList.add('ouvert'); voile.classList.add('ouvert'); });
    calendly();
    var premier = panneau.querySelector('input:not([type=hidden]), .ag-pan-x');
    if (premier) setTimeout(function (){ premier.focus({ preventScroll: true }); }, 60);
  }
  function ferme(){
    if (!panneau || panneau.hidden) return;
    panneau.classList.remove('ouvert'); voile.classList.remove('ouvert');
    document.documentElement.classList.remove('ag-fige');
    setTimeout(function (){ panneau.hidden = true; voile.hidden = true; }, calme ? 0 : 260);
    if (avant && avant.focus) avant.focus({ preventScroll: true });
  }
  document.addEventListener('click', function (e){
    var d = e.target.closest && e.target.closest('[data-parler]');
    if (!d) return;
    e.preventDefault();
    ouvre(d);
  });
  if (panneau) {
    $('ag-pan-x').addEventListener('click', ferme);
    voile.addEventListener('click', ferme);
    document.addEventListener('keydown', function (e){
      if (panneau.hidden) return;
      if (e.key === 'Escape') { ferme(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(
        panneau.querySelectorAll('button, input:not([type=hidden]), a[href], iframe'),
        function (x){ return x.offsetParent !== null; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    if (location.hash === '#parler') ouvre();
  }

  /* ---------- le mouvement ----------
     Les blocs montent a leur arrivee, les chiffres comptent, le planning se
     remplit case a case, la courbe se trace. Rien de tout cela pour qui a
     demande a son systeme de reduire les animations. */
  (function (){
    var main = document.querySelector('main.ag');
    if (!main || calme || !('IntersectionObserver' in window)) return;
    main.classList.add('ag-anime');

    var groupes = [
      ['.ag-heros-dit > *', 90], ['.ag-heros-photo', 0],
      ['.ag-centre > *', 80], ['.ag-carte', 90], ['.ag-planning-dit > *', 80],
      ['.ag-ecran', 0], ['.ag-etroit > :not(.ag-packs)', 60], ['.ag-packs li', 60]
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
     Il apparait une fois le heros passe (le heros porte deja « En discuter »)
     et suit la lecture jusqu'en bas. */
  var flottant = document.querySelector('.ag-flottant');
  var heros = document.querySelector('.ag-heros');
  if (flottant && heros && 'IntersectionObserver' in window) {
    flottant.classList.add('cache');
    new IntersectionObserver(function (es){
      flottant.classList.toggle('cache', es[es.length - 1].isIntersecting);
    }, { rootMargin: '-60% 0px 0px 0px' }).observe(heros);
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
      message: null
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
