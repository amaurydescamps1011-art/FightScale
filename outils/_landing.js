/* ---- la page de conversion de l'agence ----
   La video se lance au clic (elle pese 8 Mo : rien n'est charge avant), la
   barre du bas suit la lecture au telephone et s'efface sur le formulaire, et
   le formulaire ecrit dans contact_acquisition, comme le panneau de la page
   acquisition : la base previent l'equipe par e-mail (previent_l_equipe()). */
(function (){
  var SB = window.MCC || null;
  var $ = function (id){ return document.getElementById(id); };

  /* ---------- la video ----------
     Elle part seule, en muet et en boucle (Amaury, 09/10/2026). Le bouton
     « Activer le son » la remet a zero, coupe la boucle et rend les commandes.
     Si le navigateur refuse la lecture automatique (economie de donnees,
     reduction des animations), le bouton devient « Regarder la video » et fait
     la meme chose. */
  var cadre = $('lp-video'), video = $('lp-vsl'), lecture = $('lp-lecture');
  if (video && lecture) {
    var bloque = function (){
      cadre.classList.add('bloque');
      lecture.setAttribute('aria-label', 'Lancer la vidéo avec le son');
    };
    var calme = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calme) { video.removeAttribute('autoplay'); video.pause(); bloque(); }
    else {
      var p0 = video.play();
      if (p0 && p0.catch) p0.catch(bloque);
    }
    lecture.addEventListener('click', function (){
      cadre.classList.add('joue');
      video.loop = false;
      video.muted = false;
      video.controls = true;
      try { video.currentTime = 0; } catch (e) {}
      var p = video.play();
      if (p && p.catch) p.catch(function (){});
      video.focus({ preventScroll: true });
    });
  }

  /* ---------- l'agenda, s'il existe ---------- */
  var bloc = $('ag-calendly');
  var agenda = bloc && bloc.getAttribute('data-url');
  var form = $('lp-form');
  if (agenda && form) {
    bloc.hidden = false; form.hidden = true;
    var sc = document.createElement('script');
    sc.src = 'https://assets.calendly.com/assets/external/widget.js';
    sc.async = true;
    sc.onload = function (){
      if (window.Calendly) Calendly.initInlineWidget({
        url: agenda + (agenda.indexOf('?') < 0 ? '?' : '&') + 'hide_gdpr_banner=1&primary_color=ec162e',
        parentElement: $('ag-calendly-cadre')
      });
    };
    document.head.appendChild(sc);
  }

  /* ---------- la barre du bas ----------
     Elle apparait une fois le bouton du heros passe et disparait quand le
     formulaire est a l'ecran : jamais deux boutons pareils l'un sur l'autre. */
  var barre = $('lp-barre'), agir = document.querySelector('.lp-agir'), appel = $('appel');
  if (barre && agir && appel && 'IntersectionObserver' in window) {
    var passe = false, surAppel = false;
    var maj = function (){ barre.classList.toggle('vue', passe && !surAppel); };
    new IntersectionObserver(function (es){
      var e = es[es.length - 1];
      passe = !e.isIntersecting && e.boundingClientRect.top < 0; maj();
    }).observe(agir);
    new IntersectionObserver(function (es){
      surAppel = es[es.length - 1].isIntersecting; maj();
    }, { rootMargin: '0px 0px -30% 0px' }).observe(appel);
  }

  /* ---------- le formulaire ---------- */
  if (!form) return;
  var erreur = $('l-erreur'), envoi = $('l-envoi');
  function dit(t){ erreur.textContent = t; erreur.hidden = !t; }
  function verifie(ids){
    var manque = null;
    ids.forEach(function (id){
      var c = $(id);
      var v = c.value.trim();
      var vide = !v || (c.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))
                   || (c.type === 'tel' && v.replace(/\D/g, '').length < 9);
      c.closest('.champ').classList.toggle('manque', vide);
      if (vide && !manque) manque = c;
    });
    return manque;
  }

  form.addEventListener('submit', function (e){
    e.preventDefault();
    dit('');
    var manque = verifie(['l-club', 'l-ville', 'l-nom', 'l-tel', 'l-mail']);
    if (manque) { manque.focus(); return; }
    if (!(SB && SB.prete())) {
      dit('L’envoi a besoin du serveur. Écrivez-nous à contact@monclubcombat.fr.');
      return;
    }
    var q = new URLSearchParams(location.search);
    var src = ['utm_source', 'utm_campaign', 'utm_content'].map(function (k){
      return q.get(k) ? k.replace('utm_', '') + ' : ' + q.get(k) : '';
    }).filter(Boolean).join(', ');
    var ligne = {
      club: $('l-club').value.trim(),
      ville: $('l-ville').value.trim(),
      nom: $('l-nom').value.trim(),
      tel: $('l-tel').value.trim(),
      mail: $('l-mail').value.trim(),
      message: 'Demande d’appel depuis la page agence' + (src ? ' (' + src + ')' : '') + '.'
    };
    envoi.disabled = true;
    envoi.textContent = 'Envoi…';
    /* pas de returning : un visiteur n'a aucune lecture sur cette table */
    SB.client.from('contact_acquisition').insert(ligne).then(function (r){
      if (r.error) throw r.error;
      form.hidden = true;
      $('lp-merci').hidden = false;
      if (window.fbq) fbq('track', 'Lead');
    }).catch(function (err){
      envoi.disabled = false;
      envoi.textContent = 'Réserver mon appel';
      dit(SB.dire ? SB.dire(err) : 'L’envoi n’a pas abouti. Réessayez dans un instant.');
    });
  });
})();
