/* ---- la page de conversion de l'agence ----
   La video part seule en muet (elle pese 8 Mo : rien n'est charge avant), la
   barre du bas suit la lecture au telephone et s'efface sur la carte de
   rendez-vous, et la carte porte le tunnel de prise de rendez-vous, meme
   mecanique que la page « reserver » de GenIA (Amaury, 19/10/2026), qui parle
   a la fonction Supabase `rdv` en simple fetch ; depuis le 20/10/2026, elle
   s'ouvre en plein ecran par-dessus la page. Depuis la refonte sur le
   modele Squale (19/10/2026), la page porte aussi un peu de mouvement : les
   modele Squale (19/10/2026), la page porte aussi un peu de mouvement :
   apparitions au defilement et les liens vers une question de la FAQ. */
(function (){
  var SB = window.MCC || null;
  var $ = function (id){ return document.getElementById(id); };
  var calme = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* la CSS ne cache les blocs a faire apparaitre que si le script tourne */
  document.documentElement.classList.add('js');

  /* ---------- les apparitions au defilement ----------
     Comme chez Squale : un bloc .reveal glisse en place quand il arrive a
     l'ecran, les freres en cascade (80 ms par rang, cinq au plus). Sans
     IntersectionObserver, ou si le visiteur prefere moins de mouvement, tout
     est visible tout de suite. */
  var blocs = document.querySelectorAll('.reveal');
  if (!calme && 'IntersectionObserver' in window) {
    var apparition = new IntersectionObserver(function (entrees){
      entrees.forEach(function (e){
        if (!e.isIntersecting) return;
        var el = e.target, rang = 0, frere = el;
        while ((frere = frere.previousElementSibling) && rang < 5) if (frere.classList.contains('reveal')) rang++;
        el.style.transitionDelay = (rang * 80) + 'ms';
        el.classList.add('in');
        apparition.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    blocs.forEach(function (el){ apparition.observe(el); });
  } else {
    blocs.forEach(function (el){ el.classList.add('in'); });
  }

  /* ---------- les liens vers une question de la FAQ ----------
     « Comprendre en detail comment ca marche », « Voir qui fait quoi »,
     « Ce qui est garanti » menent a un <details> : ferme a l'arrivee, il ne
     dirait rien. On l'ouvre avant d'y descendre, au clic comme a l'arrivee
     avec #faq-... dans l'adresse ou au retour arriere ; scroll-margin-top
     (CSS) cale la question sous le bandeau collant. Une cible qui n'est pas
     encore apparue (.reveal) est decalee de 24 px : on la met en place avant
     de defiler, sinon elle remonte de 24 px une fois arrivee a l'ecran et
     passe sous le bandeau. */
  var enPlace = function (el){
    if (el && el.classList.contains('reveal')) { el.style.transition = 'none'; el.classList.add('in'); }
  };
  var ouvreQuestion = function (hash, defile){
    var id = String(hash || '').replace(/^#/, '');
    if (!/^faq-/.test(id)) return false;
    var q = $(id);
    if (!q || q.tagName !== 'DETAILS') return false;
    q.open = true;
    enPlace(q);
    if (defile) q.scrollIntoView({ behavior: calme ? 'auto' : 'smooth', block: 'start' });
    return true;
  };
  document.addEventListener('click', function (e){
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!/^#faq-/.test(href)) { enPlace($(href.slice(1))); return; }
    if (!ouvreQuestion(href, true)) return;
    e.preventDefault();
    if (history.pushState) history.pushState(null, '', href);
  });
  window.addEventListener('hashchange', function (){ ouvreQuestion(location.hash, true); });
  if (location.hash) ouvreQuestion(location.hash, true);

  /* ---------- la video ----------
     Elle part seule, en muet et en boucle (Amaury, 09/10/2026), mais pas
     avant d'etre a l'ecran : elle pese 8 Mo et le HTML ne precharge que ses
     metadonnees, c'est l'approche (40 % visible) qui la lance, et elle se met
     en pause hors ecran. Le bouton « Touchez pour le son » la remet a zero
     avec le son, sans commandes : elle continue de tourner. Si le navigateur refuse la lecture
     automatique (economie de donnees, reduction des animations), le bouton
     devient « Regarder la video » et fait la meme chose. */
  var cadreVideo = $('lp-video'), video = $('lp-vsl'), lecture = $('lp-lecture');
  if (video && lecture) {
    var bloque = function (){
      cadreVideo.classList.add('bloque');
      lecture.setAttribute('aria-label', 'Lancer la vidéo avec le son');
    };
    var lance = function (){
      var p0 = video.play();
      if (p0 && p0.catch) p0.catch(bloque);
    };
    if (calme) { video.pause(); bloque(); }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es){
        var e = es[es.length - 1];
        if (cadreVideo.classList.contains('joue')) { if (e.isIntersecting) lance(); else video.pause(); return; }
        if (cadreVideo.classList.contains('bloque')) return;
        if (e.isIntersecting) lance(); else video.pause();
      }, { threshold: 0.4 }).observe(cadreVideo);
    } else lance();
    /* comme chez Squale (Amaury, 20/10/2026) : on touche pour le son, la
       video repart du debut et tourne, sans commandes ni pause */
    lecture.addEventListener('click', function (){
      cadreVideo.classList.add('joue');
      video.muted = false;
      try { video.currentTime = 0; } catch (e) {}
      var p = video.play();
      if (p && p.catch) p.catch(function (){});
      video.focus({ preventScroll: true });
    });
  }

  /* ---------- la barre du bas ----------
     Elle apparait une fois le bouton du heros passe et disparait quand un
     autre bouton d'appel est a l'ecran : jamais deux boutons pareils l'un sur
     l'autre. */
  var barre = $('lp-barre'), agir = document.querySelector('.lp-agir');
  if (barre && agir && 'IntersectionObserver' in window) {
    var passe = false, vus = new Map();
    var maj = function (){
      var surAppel = false;
      vus.forEach(function (v){ surAppel = surAppel || v; });
      barre.classList.toggle('vue', passe && !surAppel);
    };
    new IntersectionObserver(function (es){
      var e = es[es.length - 1];
      passe = !e.isIntersecting && e.boundingClientRect.top < 0; maj();
    }).observe(agir);
    document.querySelectorAll('.lp-agir-section').forEach(function (el){
      new IntersectionObserver(function (es){
        vus.set(el, es[es.length - 1].isIntersecting); maj();
      }, { rootMargin: '0px 0px -30% 0px' }).observe(el);
    });
  }

  /* ---------- la prise de rendez-vous ----------
     Amaury, 19/10/2026 : « exactement comme sur GenIA » ; 20/10/2026 : en
     plein ecran, et seulement les questions qui disent si la salle vaut un
     appel. Six ecrans (0 a 5) : gerant ou non, nombre d'adherents, prix de
     l'abonnement, le creneau, les coordonnees, la confirmation. Les ecrans sont ecrits dans le HTML ; ici on les enchaine,
     on dessine les jours et les heures, on envoie la reservation. Le serveur
     est la fonction Supabase `rdv` (supabase/functions/rdv, contrat dans son
     LISEZ-MOI), appelee en simple fetch : la page n'a pas besoin du client
     Supabase. Les tests posent window.MCC_RDV_API avant les scripts pour
     viser un serveur local. */
  var rdv = $('rdv');
  if (!rdv) return;
  var API = window.MCC_RDV_API || (SB && SB.RDV_API)
    || 'https://qhbutuhdmyajlgorbhxf.supabase.co/functions/v1/rdv';
  var ENTETES = { 'content-type': 'application/json' };
  if (SB && SB.CLE_PUBLIQUE) ENTETES.apikey = SB.CLE_PUBLIQUE;
  var TOTAL = 6;
  /* les textes qui changent en cours de route (plan de textes rdv-textes.json) */
  var T = {
    bouton: 'Confirmer le RDV',
    enCours: 'Confirmation...',
    erreurs: {
      identite: 'Merci d’indiquer votre prénom et votre nom.',
      email: 'Adresse e-mail invalide.',
      format: 'Choisissez le format : Google Meet ou téléphone.',
      numero: 'Merci d’indiquer le numéro où nous vous appelons.',
      numero_court: 'Ce numéro semble incomplet : vérifiez-le.',
      club: 'Merci d’indiquer le nom de votre club et sa ville.',
      reseau: 'Problème de connexion. Vérifiez votre réseau et réessayez.',
      limite: 'Nous avons déjà reçu plusieurs demandes avec cette adresse aujourd’hui. Réessayez demain, ou écrivez-nous à contact@monclubcombat.fr.',
      serveur: 'Erreur de notre côté. Réessayez dans un instant, ou écrivez-nous à contact@monclubcombat.fr.'
    }
  };
  var etat = { ecran: 0, d: {}, creneaux: [], jour: null, meet: true, resultat: null, envoye: {}, envoi: false };
  /* un appel qui ne repond jamais (reseau mobile qui flotte) : on n'attend pas
     sans fin, au bout de quinze secondes c'est une panne ou un probleme reseau */
  var DELAI_MS = 15000;
  function appelle(url, init){
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var minuteur = ctrl ? setTimeout(function (){ ctrl.abort(); }, DELAI_MS) : null;
    var options = Object.assign({}, init || {});
    if (ctrl) options.signal = ctrl.signal;
    return fetch(url, options).then(function (r){ clearTimeout(minuteur); return r; },
      function (e){ clearTimeout(minuteur); throw e; });
  }

  /* les dates s'ecrivent en heure de Paris, quel que soit le telephone */
  var fmtJourCle = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  var fmtJourHaut = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' });
  var fmtJourNum = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });
  var fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  var fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit' });

  /* Le pixel Meta : memes evenements que GenIA, chacun une seule fois, et
     seulement si le pixel est la. 0 BookingStarted · 1 Etape1_Objectif ·
     2 Etape2_Activite · 3 InitiateCheckout · 4 Etape3_Entreprise +
     Etape4_Coordonnees · 5 Lead + Schedule. */
  function pixel(ev, perso){ if (typeof window.fbq === 'function') window.fbq(perso ? 'trackCustom' : 'track', ev); }
  function uneFois(cle, ev, perso){ if (!etat.envoye[cle]) { etat.envoye[cle] = 1; pixel(ev, perso); } }
  var EVENEMENTS = { 1: ['Etape1_Objectif'], 2: ['Etape2_Activite'], 4: ['Etape3_Entreprise', 'Etape4_Coordonnees'] };

  function montre(n){
    etat.ecran = Math.max(0, Math.min(TOTAL - 1, n));
    for (var i = 0; i < TOTAL; i++) $('rdv-e' + i).hidden = (i !== etat.ecran);
    $('rdv-prog').style.width = Math.round(etat.ecran / (TOTAL - 1) * 100) + '%';
    /* une fois confirme, le titre « Reservez votre appel » et son sous-titre
       n'ont plus rien a dire au-dessus de « C'est confirme ! » */
    rdv.classList.toggle('est-fini', etat.ecran === 5);
    (EVENEMENTS[etat.ecran] || []).forEach(function (ev, i){ uneFois('e' + etat.ecran + i, ev, true); });
    if (etat.ecran === 3) chargeCreneaux();
    if (etat.ecran === 4) prepareCoordonnees();
    if (etat.ecran === 5) montreSucces();
  }

  /* le plein ecran : chaque lien #appel l'ouvre au lieu de faire defiler la
     page, la croix ou Echap le ferme et rend le focus au bouton d'origine.
     Tant qu'il est ouvert, la page dessous ne defile plus (CSS) et Tab tourne
     dans le plein ecran. Une adresse qui finit par #appel l'ouvre aussi. */
  var modale = $('appel'), fermer = $('lp-fermer'), avant = null;
  function focusQuestion(){
    var q = $('rdv-e' + etat.ecran).querySelector('.lp-rdv-q, .lp-rdv-succes-t');
    if (q) { try { q.focus({ preventScroll: true }); } catch (e) { q.focus(); } }
  }
  function ouvre(){
    if (!modale.hidden) return;
    avant = document.activeElement;
    modale.hidden = false;
    document.documentElement.classList.add('modale-ouverte');
    modale.scrollTop = 0;
    focusQuestion();
  }
  function ferme(){
    if (modale.hidden) return;
    modale.hidden = true;
    document.documentElement.classList.remove('modale-ouverte');
    if (location.hash === '#appel' && history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    if (avant && avant.focus) { try { avant.focus({ preventScroll: true }); } catch (e) {} }
  }
  document.addEventListener('click', function (e){
    var a = e.target && e.target.closest ? e.target.closest('a[href="#appel"]') : null;
    if (!a) return;
    e.preventDefault();
    ouvre();
  });
  fermer.addEventListener('click', ferme);
  document.addEventListener('keydown', function (e){
    if (modale.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); ferme(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(modale.querySelectorAll('button, a[href], input'), function (el){
      return !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null;
    });
    if (!f.length) return;
    var premier = f[0], dernier = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === premier || !modale.contains(document.activeElement))) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  });
  if (location.hash === '#appel') ouvre();

  /* a chaque ecran, on remonte en haut du plein ecran et la question du
     nouvel ecran prend le focus : le lecteur d'ecran l'annonce, le clavier
     repart de la */
  function va(n){
    montre(n);
    modale.scrollTop = 0;
    focusQuestion();
  }
  rdv.querySelectorAll('[data-retour]').forEach(function (b){
    b.addEventListener('click', function (){ va(etat.ecran - 1); });
  });

  /* les cartes a coche : un groupe par question, la valeur dans data-v */
  function choisit(groupe, v){
    groupe.querySelectorAll('.lp-rdv-carte').forEach(function (c){
      c.setAttribute('aria-pressed', c.getAttribute('data-v') === v ? 'true' : 'false');
    });
  }
  function surCartes(groupe, fn){
    groupe.querySelectorAll('.lp-rdv-carte').forEach(function (c){
      c.addEventListener('click', function (){
        var v = c.getAttribute('data-v');
        etat.d[groupe.getAttribute('data-cle')] = v;
        choisit(groupe, v);
        fn(v);
      });
    });
  }
  function libelle(groupe){
    var c = groupe.querySelector('.lp-rdv-carte[aria-pressed="true"]');
    return c ? c.textContent.trim() : '';
  }
  function surEntree(input, fn){
    input.addEventListener('keydown', function (e){ if (e.key === 'Enter') { e.preventDefault(); fn(); } });
  }

  /* ecrans 0 a 2 : une question par ecran, un tap choisit et passe au suivant */
  var questions = ['situation', 'discipline', 'objectif'].map(function (cle, i){
    var groupe = rdv.querySelector('#rdv-e' + i + ' [data-cle="' + cle + '"]');
    surCartes(groupe, function (){
      if (i === 0) uneFois('debut', 'BookingStarted', true);
      setTimeout(function (){ va(i + 1); }, 160);
    });
    return groupe;
  });

  /* ecran 3 : les creneaux. Le serveur les donne en UTC, deja tries ; on les
     range par jour de Paris, un bandeau de jours qui defile, la grille des
     heures du jour choisi. S'il ne repond pas, on le dit et on laisse
     reessayer, au lieu d'afficher « aucun creneau » (faux et decourageant). */
  var attente = $('rdv-attente'), panne = $('rdv-panne'), vide = $('rdv-vide'), reessayer = $('rdv-reessayer');
  var jours = $('rdv-jours'), heures = $('rdv-heures'), pris = $('rdv-pris');
  function calMontre(quoi){
    attente.hidden = quoi !== 'attente'; panne.hidden = quoi !== 'panne'; vide.hidden = quoi !== 'vide';
    jours.hidden = heures.hidden = quoi !== 'cal';
  }
  var chargement = false;
  function chargeCreneaux(){
    uneFois('ic', 'InitiateCheckout', false);
    if (etat.creneaux.length) return dessineCal();
    if (chargement) return;
    chargement = true;
    reessayer.disabled = true;
    calMontre('attente');
    var depuis = Date.now();
    appelle(API + '/disponibilites', { headers: ENTETES })
      .then(function (r){ if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j){
        chargement = false; reessayer.disabled = false;
        etat.meet = !!j.meet;
        etat.creneaux = (j.creneaux || []).map(function (iso){ return new Date(iso); })
          .filter(function (d){ return !isNaN(d) && d.getTime() > Date.now(); })
          .sort(function (a, b){ return a - b; });
        dessineCal();
      })
      .catch(function (){
        /* une connexion refusee revient en quelques millisecondes : sans ce
           temps mort, « Reessayer » semblerait ne rien faire */
        var reste = Math.max(0, 450 - (Date.now() - depuis));
        setTimeout(function (){ chargement = false; reessayer.disabled = false; etat.creneaux = []; calMontre('panne'); }, reste);
      });
  }
  reessayer.addEventListener('click', function (){ etat.creneaux = []; chargeCreneaux(); });

  function dessineCal(){
    if (!etat.creneaux.length) return calMontre('vide');
    var parJour = {}, ordre = [];
    etat.creneaux.forEach(function (d){
      var k = fmtJourCle.format(d);
      if (!parJour[k]) { parJour[k] = []; ordre.push(k); }
      parJour[k].push(d);
    });
    if (!etat.jour || !parJour[etat.jour]) etat.jour = ordre[0];
    jours.textContent = '';
    ordre.forEach(function (k){
      var d = parJour[k][0];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lp-rdv-jour'; b.setAttribute('data-j', k);
      b.setAttribute('aria-pressed', k === etat.jour ? 'true' : 'false');
      b.appendChild(document.createTextNode(fmtJourHaut.format(d)));
      var n = document.createElement('b'); n.textContent = fmtJourNum.format(d); b.appendChild(n);
      b.addEventListener('click', function (){
        etat.jour = k;
        jours.querySelectorAll('.lp-rdv-jour').forEach(function (x){
          x.setAttribute('aria-pressed', x.getAttribute('data-j') === k ? 'true' : 'false');
        });
        dessineHeures(parJour[k]);
        jours.scrollTo({ left: b.offsetLeft - (jours.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
      });
      jours.appendChild(b);
    });
    dessineHeures(parJour[etat.jour]);
    calMontre('cal');
    var sel = jours.querySelector('[aria-pressed="true"]');
    if (sel) jours.scrollLeft = Math.max(0, sel.offsetLeft - 8);
  }
  /* l'heure deja choisie reste marquee : celui qui revient des coordonnees
     pour en changer voit laquelle il avait prise */
  function dessineHeures(liste){
    heures.textContent = '';
    liste.forEach(function (d){
      var iso = d.toISOString();
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lp-rdv-heure'; b.textContent = fmtHeure.format(d);
      b.setAttribute('data-iso', iso);
      b.setAttribute('aria-pressed', etat.d.debut === iso ? 'true' : 'false');
      b.addEventListener('click', function (){ etat.d.debut = iso; pris.hidden = true; va(4); });
      heures.appendChild(b);
    });
  }

  /* ecran 4 : les coordonnees. Le numero n'est demande que si l'appel se fait
     par telephone ; sans Google Agenda cote serveur (meet:false), il n'y a
     que le telephone, deja choisi. */
  var form = $('rdv-form'), erreur = $('rdv-erreur'), confirmer = $('rdv-confirmer');
  var formats = rdv.querySelector('.lp-rdv-formats'), fmtMeet = $('rdv-fmt-meet'), fmtTel = $('rdv-fmt-tel');
  var telChamp = $('rdv-tel-champ');
  function dit(t){ erreur.textContent = t || ''; erreur.hidden = !t; }
  function prepareCoordonnees(){
    $('rdv-recap-date').textContent = fmtLong.format(new Date(etat.d.debut));
    dit('');
    fmtMeet.hidden = !etat.meet;
    formats.classList.toggle('est-seul', !etat.meet);
    if (!etat.meet) etat.d.format = 'telephone';
    choisit(formats, etat.d.format || '');
    telChamp.hidden = etat.d.format !== 'telephone';
  }
  surCartes(formats, function (v){
    telChamp.hidden = v !== 'telephone';
    formats.classList.remove('manque');
    dit('');
    /* le focus va au numero, sauf si le gerant tape deja dans un autre champ */
    if (v === 'telephone') setTimeout(function (){
      var a = document.activeElement;
      if (!a || a.tagName !== 'INPUT' || !form.contains(a)) $('rdv-tel').focus();
    }, 40);
  });

  /* un champ signale en rouge redevient normal des qu'on y ecrit, et le
     message qui le visait s'efface avec lui : une carte rouge qui dit encore
     « invalide » au-dessus d'un champ corrige, c'est faux */
  form.querySelectorAll('input').forEach(function (c){
    c.addEventListener('input', function (){
      var ch = c.closest('.champ'); if (ch) ch.classList.remove('manque');
      dit('');
    });
  });
  var EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
  /* le premier probleme du formulaire, comme GenIA : son message, les champs
     a cerner (ceux-la seulement, pour que le rouge dise la meme chose que le
     message) et ou mettre le focus */
  function probleme(){
    var d = etat.d, vides = function (ids){ return ids.filter(function (id){ return !$(id).value.trim(); }); };
    var v = vides(['rdv-prenom', 'rdv-nom']);
    if (v.length) return { message: T.erreurs.identite, champs: v };
    if (!EMAIL.test(d.email)) return { message: T.erreurs.email, champs: ['rdv-email'] };
    if (!d.format) return { message: T.erreurs.format, champs: [], formats: true, focus: fmtMeet.hidden ? fmtTel : fmtMeet };
    if (d.format === 'telephone') {
      var chiffres = d.telephone.replace(/\D/g, '').length;
      if (!chiffres) return { message: T.erreurs.numero, champs: ['rdv-tel'] };
      if (chiffres < 9) return { message: T.erreurs.numero_court, champs: ['rdv-tel'] };
    }
    v = vides(['rdv-club', 'rdv-ville']);
    if (v.length) return { message: T.erreurs.club, champs: v };
    return null;
  }
  form.addEventListener('submit', function (e){
    e.preventDefault();
    if (etat.envoi) return;
    var d = etat.d;
    d.prenom = $('rdv-prenom').value.trim(); d.nom = $('rdv-nom').value.trim();
    d.email = $('rdv-email').value.trim(); d.telephone = $('rdv-tel').value.trim();
    d.club = $('rdv-club').value.trim(); d.ville = $('rdv-ville').value.trim();
    form.querySelectorAll('.champ.manque').forEach(function (c){ c.classList.remove('manque'); });
    formats.classList.remove('manque');
    var p = probleme();
    if (p) {
      dit(p.message);
      p.champs.forEach(function (id){ $(id).closest('.champ').classList.add('manque'); });
      if (p.formats) formats.classList.add('manque');
      var f = p.focus || (p.champs.length ? $(p.champs[0]) : null);
      if (f) f.focus();
      return;
    }
    dit('');
    envoie();
  });

  /* le message que le serveur renvoie, dit avec nos mots */
  function messageDe(statut, j){
    var code = (j && j.erreur) || '', champ = (j && j.champ) || '';
    if (statut === 429) return T.erreurs.limite;
    if (code === 'email_invalide') return T.erreurs.email;
    if (code === 'format_invalide' || code === 'format_indisponible') return T.erreurs.format;
    if (code === 'champ_manquant' || code === 'champ_trop_long') {
      if (champ === 'telephone') return T.erreurs.numero;
      if (champ === 'prenom' || champ === 'nom') return T.erreurs.identite;
      if (champ === 'club' || champ === 'ville') return T.erreurs.club;
      if (champ === 'email') return T.erreurs.email;
    }
    return T.erreurs.serveur;
  }

  function envoie(){
    var d = etat.d;
    /* les trois reponses partent avec leur libelle dans les champs que le
       serveur connait deja : situation = gerant, discipline = adherents,
       objectif = abonnement (le mail d'Amaury les nomme ainsi) */
    var corps = {
      debut: d.debut, prenom: d.prenom, nom: d.nom, email: d.email, format: d.format,
      club: d.club, ville: d.ville,
      situation: libelle(questions[0]), discipline: libelle(questions[1]), objectif: libelle(questions[2])
    };
    /* le numero ne part que s'il sert : celui tape puis cache en revenant a
       Google Meet n'est pas envoye */
    if (d.format === 'telephone' && d.telephone) corps.telephone = d.telephone;
    /* d'ou vient le gerant : les utm de l'adresse, pour les campagnes */
    var q = new URLSearchParams(location.search), source = {};
    ['utm_source', 'utm_campaign', 'utm_content'].forEach(function (k){
      if (q.get(k)) source[k] = q.get(k).slice(0, 120);
    });
    if (Object.keys(source).length) corps.source = source;
    var piege = $('rdv-site').value.trim();
    if (piege) corps.site_web = piege;

    etat.envoi = true;
    confirmer.disabled = true; confirmer.textContent = T.enCours;
    var rendu = function (){ etat.envoi = false; confirmer.disabled = false; confirmer.textContent = T.bouton; };
    appelle(API + '/reserver', { method: 'POST', headers: ENTETES, body: JSON.stringify(corps) })
      .then(function (r){
        return r.json().catch(function (){ return {}; }).then(function (j){ return { statut: r.status, ok: r.ok, j: j }; });
      })
      .then(function (x){
        rendu();
        /* le creneau vient d'etre pris : retour aux creneaux, rafraichis, avec le mot */
        if (x.statut === 409) { etat.creneaux = []; pris.hidden = false; va(3); return; }
        if (!x.ok) { dit(messageDe(x.statut, x.j)); return; }
        pixel('Lead'); pixel('Schedule');
        etat.resultat = x.j || {};
        va(5);
      })
      .catch(function (){ rendu(); dit(T.erreurs.reseau); });
  }

  /* ecran 5 : c'est confirme */
  function montreSucces(){
    var r = etat.resultat || {}, d = etat.d;
    var debut = new Date(r.debut || d.debut);
    $('rdv-succes-date').textContent = fmtLong.format(isNaN(debut) ? new Date(d.debut) : debut);
    var lien = typeof r.lien_meet === 'string' && /^https:\/\//.test(r.lien_meet) ? r.lien_meet : '';
    $('rdv-succes-meet').hidden = !lien;
    if (lien) { var a = $('rdv-succes-lien'); a.href = lien; a.textContent = lien; }
    $('rdv-succes-sans').hidden = !!lien || d.format !== 'meet';
    $('rdv-succes-tel').hidden = d.format !== 'telephone';
    $('rdv-succes-num').textContent = d.telephone || '';
  }

  montre(0);
})();
