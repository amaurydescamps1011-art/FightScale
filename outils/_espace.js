/* ---- l'espace club ----
   Ce que le gerant vient y chercher : ou en est sa fiche, et qui veut essayer
   sa salle. Cette deuxieme partie est le suivi de prospects que le cahier des
   charges appelle le CRM : une demande n'est pas une ligne a lire et a oublier,
   c'est quelqu'un a rappeler.

   Le suivi tient dans la table `demande` : l'etape, une note libre, une date de
   relance. Ce qui manque encore, et qui est annonce comme tel : les campagnes,
   les etiquettes, la fusion de doublons, l'historique des changements, et les
   relances envoyees par e-mail (il faut un fournisseur d'envoi).

   Tout ce qui est ecrit ici appartient au club : la politique `demande_suivi`
   ne laisse un gerant lire et modifier que les demandes de son propre club. */
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

  /* Le parcours d'un prospect, dans l'ordre. Les deux dernieres etapes sont des
     fins : on n'en revient pas, et elles ne s'enchainent pas aux autres. */
  var ETAPES = [
    ['recue',     'Reçue'],
    ['contactee', 'Contactée'],
    ['confirmee', 'Confirmée'],
    ['honoree',   'Venue'],
    ['adherent',  'Adhérente'],
    ['absente',   'Absente'],
    ['annulee',   'Perdue']
  ];
  var SUIVI = {};
  ETAPES.forEach(function (e){ SUIVI[e[0]] = e[1]; });

  /* Ce qu'on propose apres chaque etape. Un bouton par suite probable, plutot
     qu'une liste deroulante de sept entrees ou le gerant doit chercher. */
  var SUITE = {
    recue:     ['contactee', 'confirmee', 'annulee'],
    contactee: ['confirmee', 'annulee'],
    confirmee: ['honoree', 'absente'],
    honoree:   ['adherent', 'annulee'],
    absente:   ['contactee', 'annulee'],
    adherent:  [],
    annulee:   ['contactee']
  };

  var clubCourant = null;
  var tout = [];            /* tous les prospects, dans l'ordre d'arrivee */
  var filtre = 'tous';
  var cherche = '';

  SB.session().then(function (s){
    if (!s) { SB.exigeCompte(); dit('Connectez-vous pour accéder à votre espace club.'); return null; }
    return SB.monClub();
  }).then(function (club){
    if (club === null) return;
    if (!club) {
      rate('Aucun club n’est rattaché à ce compte. Passez par « Référencer ma salle » pour le créer.');
      return;
    }
    clubCourant = club;
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

    complet(club);

    if (club.statut === 'publie' && club.slug) {
      var voir = document.getElementById('esp-voir');
      voir.href = 'salle.html?s=' + encodeURIComponent(club.slug);
      voir.hidden = false;
    }
    return prospects(club);
  }).catch(function (e){ rate(SB.dire(e)); });

  /* ---------- l'etat de la fiche, poste par poste ----------
     Un club gratuit ne recoit pas de demande : sans ce bloc, son espace ne lui
     dit rien du tout. La fiche, elle, est a lui quel que soit le palier, et
     c'est la seule chose sur laquelle il peut avancer aujourd'hui. Chaque ligne
     manquante renvoie au formulaire, a l'endroit qui la remplit. */
  var OUI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4.5 12.6 9.6 17.7 19.5 6.9"/></svg>';
  var NON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M12 7v7M12 17.4v.2"/></svg>';

  function complet(club){
    var h = club.horaires || {};
    var jours = 0;
    for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) jours++;
    var gratuit = (club.offre || 'gratuit') !== 'pro';

    var lignes = [
      ['Adresse et ville', !!(club.adresse && club.ville), 'Sans elles, votre salle ne sort dans aucune recherche de ville.'],
      ['Disciplines', (club.disciplines || []).length > 0, 'Ce sont elles qui vous font apparaître dans les pages de discipline.'],
      ['Présentation', !!(club.presentation && club.presentation.trim().length > 60),
       'Trois ou quatre phrases sur votre salle : c’est ce qu’on lit avant de venir.'],
      ['Photos', (club.photos || []).length > 0,
       'Une salle avec photos est nettement plus contactée qu’une salle sans.'],
      ['Horaires d’ouverture', jours > 0, 'Ils affichent « ouvert aujourd’hui » sur votre fiche.'],
      ['Planning des cours', (club.cours || []).length > 0,
       gratuit ? 'Le planning se voit sur votre fiche, et c’est sur ces cours que se réservent les séances d’essai en Pro.'
               : 'C’est sur ces cours que se réservent les séances d’essai.'],
      ['Téléphone ou e-mail', !!(club.tel || club.mail),
       gratuit ? 'Ils ne sont pas affichés sans abonnement, mais il nous faut un moyen de vous joindre.'
               : 'Ils sont affichés sur votre fiche, c’est par là qu’on vous contacte.']
    ];

    var faits = lignes.filter(function (l){ return l[1]; }).length;
    document.getElementById('esp-complet').hidden = false;
    document.getElementById('esp-complet-mot').textContent = faits === lignes.length
      ? 'Votre fiche est complète.'
      : faits + ' éléments sur ' + lignes.length + ' sont remplis. Voici ce qu’il reste.';

    document.getElementById('esp-check').innerHTML = lignes.map(function (l){
      return '<li class="' + (l[1] ? 'ok' : 'manque') + '">' +
        '<span class="esp-puce">' + (l[1] ? OUI : NON) + '</span>' +
        '<span class="esp-check-mot"><b>' + ech(l[0]) + '</b>' +
        (l[1] ? '' : '<span>' + ech(l[2]) +
           ' <a href="referencer.html">Le remplir</a></span>') +
        '</span></li>';
    }).join('');
  }

  /* ---------- lecture ---------- */
  function prospects(club){
    return sb.from('demande').select('*').eq('club_id', club.id)
      .order('cree_le', { ascending: false })
      .then(function (r){
        if (r.error) throw r.error;
        tout = r.data || [];
        document.getElementById('esp-demandes-bloc').hidden = false;
        chiffres();
        entetes();
        rend();
      });
  }

  function compte(etats){
    return tout.filter(function (d){ return etats.indexOf(d.statut) >= 0; }).length;
  }

  function chiffres(){
    /* Sur une fiche gratuite, annoncer des chiffres a zero ne dit rien : le bloc
       sert alors a expliquer ce que le Pro apporterait. */
    var gratuit = (clubCourant.offre || 'gratuit') !== 'pro';
    var compteurs = document.querySelector('.esp-chiffres');
    if (compteurs) compteurs.hidden = gratuit && !tout.length;
    document.getElementById('esp-nb').textContent = tout.length;
    document.getElementById('esp-nb-ok').textContent =
      compte(['confirmee', 'honoree', 'adherent']);
    document.getElementById('esp-nb-adh').textContent = compte(['adherent']);
  }

  function entetes(){
    var gratuit = (clubCourant.offre || 'gratuit') !== 'pro';
    document.getElementById('esp-oeil').textContent =
      gratuit ? 'Mon Club Combat Pro' : 'Ce que vous avez reçu';
    document.getElementById('esp-titre').textContent =
      gratuit ? 'Recevez vos demandes de séance d’essai' : 'Vos prospects';
    document.getElementById('esp-vide').textContent = gratuit
      ? 'Sans abonnement, votre fiche ne montre ni votre téléphone ni votre e-mail, et '
        + 'ne prend pas de réservation. Avec Mon Club Combat Pro, la demande arriverait '
        + 'ici, vous la confirmeriez d’un bouton et vous suivriez chaque prospect '
        + 'jusqu’à l’adhésion.'
      : 'Aucune demande pour l’instant. Elles arriveront ici dès que votre fiche '
        + 'sera en ligne.';
  }

  /* ---------- la barre : étapes, recherche, export ---------- */
  function rendFiltres(){
    var zone = document.getElementById('esp-filtres');
    var chips = [['tous', 'Tous', tout.length]];
    ETAPES.forEach(function (e){
      var n = compte([e[0]]);
      /* une etape que personne n'a atteinte n'est pas un filtre utile */
      if (n) chips.push([e[0], e[1], n]);
    });
    zone.innerHTML = chips.map(function (c){
      return '<button type="button" class="esp-chip" data-filtre="' + c[0] + '"' +
        (filtre === c[0] ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        ech(c[1]) + '<span>' + c[2] + '</span></button>';
    }).join('');
  }

  /* Une date de relance qui est passee, ou qui tombe aujourd'hui, est ce que le
     gerant doit faire maintenant. Tout le reste attend. */
  function aujourdhui(){
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
           '-' + ('0' + d.getDate()).slice(-2);
  }
  function duJour(d){
    return !!d.relance && d.relance <= aujourdhui() &&
           ['adherent', 'annulee'].indexOf(d.statut) < 0;
  }

  function rappel(){
    var n = tout.filter(duJour).length;
    var p = document.getElementById('esp-rappel');
    p.hidden = !n;
    if (n) p.textContent = n === 1
      ? 'Un prospect est à relancer aujourd’hui.'
      : n + ' prospects sont à relancer aujourd’hui.';
  }

  function visibles(){
    var q = cherche.trim().toLowerCase();
    return tout.filter(function (d){
      if (filtre !== 'tous' && d.statut !== filtre) return false;
      if (!q) return true;
      return [d.nom, d.mail, d.tel, d.discipline, d.notes]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function rend(){
    rendFiltres();
    rappel();
    document.getElementById('esp-barre').hidden = !tout.length;
    document.getElementById('esp-vide').hidden = tout.length > 0;
    var l = visibles();
    document.getElementById('esp-demandes').innerHTML = l.map(ligne).join('');
    document.getElementById('esp-rien').hidden = !(tout.length && !l.length);
  }

  function ligne(d){
    var quand = new Date(d.cree_le).toLocaleDateString('fr-FR',
      { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    var suites = SUITE[d.statut] || [];
    return '<li class="demande' + (duJour(d) ? ' dem-urgent' : '') +
             '" data-id="' + ech(d.id) + '">' +
      '<div class="dem-qui"><b>' + ech(d.nom) + '</b>' +
        '<span class="dem-quand">' + ech(quand) + '</span></div>' +
      '<ul class="dem-coord">' +
        '<li><a href="mailto:' + ech(d.mail) + '">' + ech(d.mail) + '</a></li>' +
        (d.tel ? '<li><a href="tel:' + ech(d.tel.replace(/\s/g, '')) + '">' + ech(d.tel) + '</a></li>' : '') +
        (d.discipline ? '<li>' + ech(d.discipline) + '</li>' : '') +
        (d.creneau ? '<li>' + ech(d.creneau) + '</li>' : '') +
      '</ul>' +
      (d.message ? '<p class="dem-mot">' + ech(d.message) + '</p>' : '') +
      '<div class="dem-suivi">' +
        '<span class="dem-etat dem-' + ech(d.statut) + '">' + ech(SUIVI[d.statut] || d.statut) + '</span>' +
        suites.map(function (e){
          return '<button type="button" class="btn btn-ligne btn-mini" data-suivi="' +
                 e + '">' + ech(SUIVI[e]) + '</button>';
        }).join('') +
      '</div>' +
      /* La note et la relance ne partent qu'au moment ou le champ perd le focus :
         un enregistrement a chaque touche ferait une requete par lettre. */
      '<div class="dem-fiche">' +
        '<label class="dem-relance">Rappeler le' +
          '<input type="date" data-champ="relance" value="' + ech(d.relance || '') + '">' +
        '</label>' +
        '<label class="dem-notes">Notes' +
          '<textarea rows="2" data-champ="notes" placeholder="Ce que vous vous êtes dit, ce qu’il faut penser à faire…">' +
            ech(d.notes || '') + '</textarea>' +
        '</label>' +
      '</div>' +
      '</li>';
  }

  /* ---------- écriture ---------- */
  function enregistre(id, champs, apres){
    return sb.from('demande').update(champs).eq('id', id).select().single()
      .then(function (r){
        if (r.error) throw r.error;
        for (var i = 0; i < tout.length; i++)
          if (tout[i].id === id) { tout[i] = r.data; break; }
        if (apres) apres(r.data);
      });
  }

  var liste = document.getElementById('esp-demandes');

  /* Le suivi porte la regle metier d'Amaury : une demande recue n'est pas un lead,
     seule une reservation confirmee en est un. Ce sont ces boutons qui font la
     bascule, et c'est de la que sortent les chiffres du haut de page. */
  liste.addEventListener('click', function (e){
    var b = e.target.closest ? e.target.closest('[data-suivi]') : null;
    if (!b) return;
    var li = b.closest('.demande');
    b.disabled = true;
    enregistre(li.dataset.id, { statut: b.dataset.suivi })
      .then(function (){ chiffres(); rend(); })
      .catch(function (err){ b.disabled = false; rate(SB.dire(err)); });
  });

  liste.addEventListener('change', function (e){
    var c = e.target.closest ? e.target.closest('[data-champ]') : null;
    if (!c || c.dataset.champ !== 'relance') return;
    var li = c.closest('.demande');
    var champs = {}; champs.relance = c.value || null;
    enregistre(li.dataset.id, champs).then(rend)
      .catch(function (err){ rate(SB.dire(err)); });
  });

  liste.addEventListener('focusout', function (e){
    var c = e.target.closest ? e.target.closest('[data-champ="notes"]') : null;
    if (!c) return;
    var li = c.closest('.demande');
    var avant = '';
    for (var i = 0; i < tout.length; i++)
      if (tout[i].id === li.dataset.id) avant = tout[i].notes || '';
    if (c.value === avant) return;          /* rien n'a change : pas de requete */
    enregistre(li.dataset.id, { notes: c.value || null })
      .catch(function (err){ rate(SB.dire(err)); });
  }, true);

  /* ---------- filtres, recherche, export ---------- */
  document.getElementById('esp-filtres').addEventListener('click', function (e){
    var b = e.target.closest ? e.target.closest('[data-filtre]') : null;
    if (!b) return;
    filtre = b.dataset.filtre;
    rend();
  });

  var champCherche = document.getElementById('esp-cherche');
  champCherche.addEventListener('input', function (){
    cherche = champCherche.value;
    rend();
  });

  /* L'export sert a deux choses : emporter ses prospects dans son propre outil,
     et pouvoir partir. Un club qui sait qu'il peut recuperer ses donnees
     s'abonne plus volontiers. Tout se fait dans le navigateur, le fichier ne
     passe par aucun serveur. */
  document.getElementById('esp-csv').addEventListener('click', function (){
    var COLS = [
      ['Nom', 'nom'], ['E-mail', 'mail'], ['Téléphone', 'tel'],
      ['Discipline', 'discipline'], ['Créneau souhaité', 'creneau'],
      ['Message', 'message'], ['Étape', null], ['Notes', 'notes'],
      ['Relance', 'relance'], ['Reçue le', null]
    ];
    var cell = function (v){
      v = v == null ? '' : String(v);
      return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var lignes = [COLS.map(function (c){ return cell(c[0]); }).join(';')];
    visibles().forEach(function (d){
      lignes.push(COLS.map(function (c){
        if (c[0] === 'Étape') return cell(SUIVI[d.statut] || d.statut);
        if (c[0] === 'Reçue le') return cell(new Date(d.cree_le).toLocaleString('fr-FR'));
        return cell(d[c[1]]);
      }).join(';'));
    });
    /* Le BOM est ce qui fait qu'Excel ouvre les accents correctement, et le
       point-virgule ce qui lui fait separer les colonnes en francais. */
    var blob = new Blob(['﻿' + lignes.join('\r\n')],
      { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prospects-' + aujourdhui() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function (){ URL.revokeObjectURL(a.href); }, 1000);
  });
})();
