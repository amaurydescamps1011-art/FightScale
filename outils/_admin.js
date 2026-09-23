/* ---- le back-office ----
   Reserve a l'equipe : etre dans la table `equipe` est la seule condition, et
   c'est le RLS qui la fait respecter. Ce script ne cache pas une page qu'un
   curieux pourrait forcer, il affiche ce que la base accepte de lui donner : un
   visiteur qui ouvrirait admin.html ne verrait aucun club en attente, parce que
   la politique de lecture ne lui en renvoie aucun. */
(function (){
  var SB = window.MCC;
  var charge = document.getElementById('ad-charge');
  var erreur = document.getElementById('ad-erreur');
  function dit(m){ charge.textContent = m; charge.hidden = false; }
  function rate(m){ charge.hidden = true; erreur.textContent = m; erreur.hidden = false; }

  if (!SB || !SB.prete()) {
    rate('Le back-office a besoin d’une connexion au serveur, qui n’est pas disponible ici.');
    return;
  }
  var sb = SB.client;
  var ech = function (t){
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  /* Un slug lisible et stable : c'est l'URL de la fiche, elle ne doit plus bouger
     une fois publiee, donc on ne la pose qu'a la premiere publication. */
  function slugifie(nom, ville){
    return (nom + ' ' + (ville || ''))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  }

  SB.session().then(function (s){
    if (!s) { SB.exigeCompte(); dit('Connectez-vous avec un compte de l’équipe.'); return null; }
    return sb.from('equipe').select('membre_id').limit(1).then(function (r){
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) {
        rate('Ce compte ne fait pas partie de l’équipe Mon Club Combat.');
        return null;
      }
      return true;
    });
  }).then(function (ok){
    if (!ok) return;
    charge.hidden = true;
    document.getElementById('ad-corps').hidden = false;
    return recharge();
  }).catch(function (e){ rate(SB.dire(e)); });

  function recharge(){
    return sb.from('club').select('*').order('modifie_le', { ascending: false })
      .then(function (r){
        if (r.error) throw r.error;
        var tous = r.data || [];
        var attente = tous.filter(function (c){ return c.statut === 'en_attente'; });
        var enligne = tous.filter(function (c){ return c.statut === 'publie'; });

        document.getElementById('ad-attente').textContent = attente.length;
        document.getElementById('ad-publies').textContent = enligne.length;

        document.getElementById('ad-liste-bloc').hidden = false;
        document.getElementById('ad-vide').hidden = attente.length > 0;
        document.getElementById('ad-fiches').innerHTML = attente.map(carte).join('');

        document.getElementById('ad-ligne-bloc').hidden = enligne.length === 0;
        document.getElementById('ad-enligne').innerHTML = enligne.map(carte).join('');
      });
  }

  function carte(c){
    var d = (c.disciplines || []).join(' · ');
    var jours = Object.keys(c.horaires || {}).length;
    var enAttente = c.statut === 'en_attente';
    var pro = c.offre === 'pro';
    return '<li class="fiche" data-id="' + ech(c.id) + '">' +
      '<div class="fiche-tete"><b>' + ech(c.nom) + '</b>' +
        '<span class="fiche-lieu">' + ech([c.code_postal, c.ville].filter(Boolean).join(' ') || 'Ville non renseignée') + '</span></div>' +
      '<ul class="fiche-faits">' +
        '<li>' + (d ? ech(d) : 'Aucune discipline') + '</li>' +
        '<li>' + (jours ? jours + ' jours d’ouverture' : 'Aucun horaire') + '</li>' +
        '<li>' + ((c.photos || []).length) + ' photo' + ((c.photos || []).length > 1 ? 's' : '') + '</li>' +
        '<li>' + ech(c.tel || c.mail || 'Aucune coordonnée') + '</li>' +
        '<li>' + (c.offre === 'pro' ? 'Abonné Pro' : 'Fiche gratuite') + '</li>' +
      '</ul>' +
      (c.presentation ? '<p class="fiche-mot">' + ech(c.presentation) + '</p>' : '') +
      '<div class="fiche-actions">' +
        (enAttente
          ? '<button type="button" class="btn btn-rouge btn-mini" data-act="publie">Publier</button>' +
            '<button type="button" class="btn btn-ligne btn-mini" data-act="refuse">Refuser</button>'
          : '<button type="button" class="btn btn-ligne btn-mini" data-act="suspendu">Retirer de l’annuaire</button>' +
            /* tant que le paiement n'existe pas, c'est l'equipe qui ouvre le Pro a
               la main ; le jour ou Stripe est branche, c'est son webhook qui ecrit
               cette meme colonne et ce bouton ne sert plus qu'aux gestes commerciaux */
            (pro
              ? '<button type="button" class="btn btn-ligne btn-mini" data-offre="gratuit">Repasser en gratuit</button>'
              : '<button type="button" class="btn btn-ligne btn-mini" data-offre="pro">Activer le Pro</button>')) +
      '</div></li>';
  }

  document.querySelector('main').addEventListener('click', function (e){
    var b = e.target.closest('[data-act], [data-offre]');
    if (!b) return;
    var li = b.closest('.fiche');
    var id = li.dataset.id;

    /* changer l'offre ne touche pas au statut : une fiche reste publiee qu'elle
       soit gratuite ou Pro. Seule l'equipe passe ce trigger (club_offre_figee). */
    if (b.dataset.offre) {
      b.disabled = true;
      sb.from('club').update({ offre: b.dataset.offre }).eq('id', id)
        .then(function (r){ if (r.error) throw r.error; return recharge(); })
        .catch(function (err){ b.disabled = false; rate(SB.dire(err)); });
      return;
    }

    var act = b.dataset.act;
    var champs = { statut: act };

    if (act === 'refuse') {
      var motif = prompt('Pourquoi cette fiche n’est-elle pas retenue ? Le gérant le lira.');
      if (motif === null) return;
      champs.motif_refus = motif.trim() || 'Fiche incomplète.';
    }
    if (act === 'publie') {
      champs.publie_le = new Date().toISOString();
      champs.motif_refus = null;
    }

    b.disabled = true;
    var avant = Promise.resolve();
    /* le slug n'est pose qu'une fois : l'URL d'une fiche publiee ne doit plus bouger */
    if (act === 'publie') {
      avant = sb.from('club').select('slug, nom, ville').eq('id', id).single()
        .then(function (r){
          if (r.error) throw r.error;
          if (!r.data.slug) champs.slug = slugifie(r.data.nom, r.data.ville);
        });
    }
    avant.then(function (){
      return sb.from('club').update(champs).eq('id', id);
    }).then(function (r){
      if (r.error) throw r.error;
      return recharge();
    }).catch(function (err){
      b.disabled = false;
      rate(SB.dire(err));
    });
  });
})();
