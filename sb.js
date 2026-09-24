/* ---- le lien avec la base ----
   Une seule copie de la configuration et du client, partagee par toutes les pages.

   La cle est « publishable » : elle est publique par construction, elle part
   dans le code de la page et n'importe qui peut la lire. Ce qui protege les
   donnees, ce sont les politiques d'acces de db/001_schema.sql, pas le secret
   de cette cle. La cle « secret », elle, n'a rien a faire ici.

   Le site doit continuer a s'afficher quand la base n'est pas joignable : dans
   un Artifact, le CSP interdit toute requete reseau, et la maquette doit rester
   consultable. D'ou MCC.prete() : les pages qui ecrivent retombent sur leur
   comportement de demonstration quand il renvoie faux. */
window.MCC = (function (){
  var URL_BASE = 'https://qhbutuhdmyajlgorbhxf.supabase.co';
  var CLE = 'sb_publishable_ic423KpP-683uMEhyzVSxQ_ow2i6hN2';

  var client = null;
  if (window.supabase && window.supabase.createClient) {
    try {
      client = window.supabase.createClient(URL_BASE, CLE, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch (e) { client = null; }
  }

  function prete(){ return !!client; }

  /* La session du navigateur, ou null. Toutes les pages protegees passent par la. */
  function session(){
    if (!client) return Promise.resolve(null);
    return client.auth.getSession()
      .then(function (r){ return (r.data && r.data.session) || null; })
      .catch(function (){ return null; });
  }

  /* Le club du compte connecte, avec son statut, ou null s'il n'en gere aucun.
     La politique de lecture fait le tri : inutile de filtrer sur le membre ici. */
  function monClub(){
    if (!client) return Promise.resolve(null);
    return client.from('club_membre').select('club_id, club(*)').limit(1)
      .then(function (r){
        if (r.error || !r.data || !r.data.length) return null;
        return r.data[0].club || null;
      })
      .catch(function (){ return null; });
  }

  /* Le club du compte, cree s'il n'existe pas encore. Amaury, 24/09/2026 : la
     creation de compte doit mener droit a l'espace club, sans page entre les
     deux. C'est donc la premiere page ouverte apres l'inscription (l'espace
     club, ou la fiche) qui cree le club, avec le nom saisi dans la fenetre
     (?nom=), ou celui garde dans le compte, ou « Ma salle ». */
  function assureMonClub(nom){
    if (!client) return Promise.resolve(null);
    return monClub().then(function (club){
      if (club) return club;
      return client.auth.getUser().then(function (u){
        var moi = u && u.data && u.data.user;
        if (!moi) return null;
        var n = nom || (moi.user_metadata && moi.user_metadata.nom_salle) || 'Ma salle';
        return client.rpc('creer_mon_club', { nom_salle: n }).then(function (r){
          if (r.error) throw r.error;
          return monClub();
        });
      });
    });
  }

  /* ---- le profil du compte ----
     Amaury, 23/09/2026 : un compte doit etre un vrai compte, « au moins qu'il
     ait un profil de compte et qu'il soit enregistre quelque part », meme en
     gratuit et meme sans club. La ligne vit dans la table `profil`, une par
     compte, que chacun est seul a lire et a ecrire (politiques profil_*).

     Elle nait avec le compte, par un trigger sur auth.users. Si ce trigger n'a
     pas pu etre pose (un projet ou Supabase refuse d'y toucher), on la cree au
     premier passage : d'ou l'upsert plutot qu'un simple select. */
  function monProfil(){
    if (!client) return Promise.resolve(null);
    return client.auth.getUser().then(function (u){
      var moi = u && u.data && u.data.user;
      if (!moi) return null;
      return client.from('profil').select('*').eq('membre_id', moi.id).maybeSingle()
        .then(function (r){
          if (r.error) throw r.error;
          if (r.data) return r.data;
          /* pas de ligne : on la cree, avec ce que l'inscription nous a laisse */
          var meta = moi.user_metadata || {};
          return client.from('profil')
            .insert({ membre_id: moi.id,
                      nom: meta.full_name || meta.name || null })
            .select().single()
            .then(function (r2){ return r2.error ? null : r2.data; });
        });
    }).catch(function (){ return null; });
  }

  /* Ce que le gerant modifie sur sa page « Mon compte ». On renvoie la ligne
     enregistree, pas ce qui a ete envoye : ce qui s'affiche apres coup est ce
     que la base a vraiment garde. */
  function poseProfil(champs){
    if (!client) return Promise.reject(new Error('Hors ligne'));
    return client.auth.getUser().then(function (u){
      var moi = u && u.data && u.data.user;
      if (!moi) throw new Error('Il faut etre connecte.');
      champs.membre_id = moi.id;
      return client.from('profil').upsert(champs, { onConflict: 'membre_id' })
        .select().single();
    }).then(function (r){ if (r.error) throw r.error; return r.data; });
  }

  /* Membre de l'equipe Mon Club Combat ? La politique equipe_lecture ne rend que
     sa propre ligne : si elle sort, c'est qu'on en est. Sert a montrer le lien
     du back-office dans le menu, et seulement a ca -- c'est le RLS qui garde
     le back-office, pas ce menu. */
  function estAdmin(){
    if (!client) return Promise.resolve(false);
    return client.from('equipe').select('membre_id').limit(1)
      .then(function (r){ return !!(!r.error && r.data && r.data.length); })
      .catch(function (){ return false; });
  }

  /* Se deconnecter, puis revenir a l'accueil : rester sur une page d'espace club
     apres la deconnexion ne montrerait qu'une erreur. */
  function deconnexion(){
    if (!client) return Promise.resolve();
    return client.auth.signOut().catch(function (){});
  }

  /* Les messages de Supabase sont en anglais et parlent de tables : on les
     traduit, parce qu'ils arrivent tels quels sous les yeux d'un gerant. */
  function dire(err){
    if (!err) return '';
    var m = (err.message || String(err));
    if (/Invalid login credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
    if (/User already registered|already been registered/i.test(m))
      return 'Un compte existe déjà avec cette adresse. Connectez-vous.';
    if (/Password should be at least/i.test(m)) return 'Le mot de passe doit faire huit caractères au minimum.';
    if (/Unable to validate email|invalid format/i.test(m)) return 'Cette adresse e-mail n’est pas valide.';
    if (/Email not confirmed/i.test(m)) return 'Il faut d’abord confirmer votre adresse, le lien est dans votre boîte mail.';
    /* Deux reglages du projet Supabase, et deux messages anglais qui arrivaient
       tels quels sous les yeux d'un gerant. Le premier est le fournisseur e-mail
       eteint, le second la creation de compte fermee pour tout le projet. */
    if (/Email signups are disabled|email provider.*disabled/i.test(m))
      return 'La création de compte par e-mail est fermée pour l’instant. Réessayez plus tard, ou passez par « Continuer avec Google ».';
    if (/Signups not allowed|signup is disabled/i.test(m))
      return 'Les inscriptions sont fermées pour l’instant. Réessayez plus tard.';
    if (/gere deja un club|already/i.test(m)) return 'Ce compte gère déjà un club.';
    if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m))
      return 'La connexion au serveur a échoué. Vérifiez votre réseau et réessayez.';
    return m;
  }

  /* Demande au visiteur d'ouvrir une session. La fenetre de creation de compte
     est posee sur toutes les pages : on l'ouvre plutot que de creer une page de
     connexion de plus. Si elle manque, on renvoie a la page de vente, ou elle est. */
  function exigeCompte(){
    var voile = document.getElementById('voile');
    var bascule = document.getElementById('fen-vers-connexion');
    if (!voile) { location.href = 'clubs.html'; return; }
    if (bascule) bascule.click();
    var ouvreur = document.querySelector('[data-compte]');
    if (ouvreur) { ouvreur.click(); return; }
    /* aucune ancre cliquable sur cette page : on ouvre la fenetre a la main */
    voile.hidden = false;
    document.body.classList.add('fige');
  }


  /* ---- les clubs publies, dans la forme que le site sait deja afficher ----
     Toutes les pages lisent un tableau global SALLES, ecrit au build. Un club
     valide, lui, arrive de la base. Plutot que de doubler chaque rendu, on met
     le club dans exactement la meme forme, on le pousse dans SALLES, et on
     previent la page par un evenement : elle refait son rendu, une seule fois.

     Ce qu'un vrai club n'a pas, il ne l'a pas : ni note, ni avis, ni
     equipements, ni nombre d'adherents. Ces champs restent vides et les blocs
     correspondants disparaissent, plutot que d'etre remplis d'invente. */
  var JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var LIBELLE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  function sansAccent(t){
    return String(t || '').normalize
      ? String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      : String(t || '');
  }

  /* Le sigle sert de pastille quand la salle n'a pas de photo : les initiales
     des mots du nom, trois au plus. « Team Ouragan Boxe » donne TOB. */
  function sigleDe(nom){
    var mots = sansAccent(nom).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    if (!mots.length) return '??';
    if (mots.length === 1) return mots[0].slice(0, 3);
    return mots.slice(0, 3).map(function (m){ return m[0]; }).join('');
  }

  function hhmm(t){ return String(t || '').replace(':', 'h'); }

  /* L'amplitude affichee sur la fiche : la plus tot des ouvertures, la plus
     tard des fermetures. Sans horaires saisis, on n'affiche rien. */
  function amplitude(h){
    var tot = null, tard = null;
    JOURS.forEach(function (j){
      var p = h && h[j];
      if (!p || !p[0] || !p[1]) return;
      if (tot === null || p[0] < tot) tot = p[0];
      if (tard === null || p[1] > tard) tard = p[1];
    });
    return tot ? hhmm(tot) + ' – ' + hhmm(tard) : '';
  }

  function lienPhoto(chemin){
    return URL_BASE + '/storage/v1/object/public/photos-clubs/' + chemin;
  }

  /* Le planning que le club a saisi, range par jour et remis dans l'ordre des
     heures. C'est la meme liste qui s'affiche sur la fiche et qui alimente le
     choix de la seance d'essai : un pratiquant reserve un cours qui existe,
     jamais un creneau invente (Amaury, 23/09/2026). */
  function coursDuJour(liste, jour){
    return (liste || []).filter(function (x){ return +x.jour === jour && x.de && x.a; })
      .sort(function (a, b){ return a.de < b.de ? -1 : a.de > b.de ? 1 : 0; })
      .map(function (x){
        return { id: x.id || '', de: hhmm(x.de), a: hhmm(x.a),
                 quoi: x.quoi || '', niveau: x.niveau || '' };
      });
  }

  function enSalle(c){
    var h = c.horaires || {};
    var jourJs = new Date().getDay();
    var auj = JOURS[(jourJs + 6) % 7];
    var coord = coordsVille(c.ville, c.lat, c.lon);
    var detail = {
      id: c.id,
      reel: true,
      slug: c.slug || c.id,
      adresse: c.adresse || '',
      cp: c.code_postal || '',
      tel: c.tel || '',
      mail: c.mail || '',
      site: (c.site || '').replace(/^https?:\/\//, ''),
      insta: (c.instagram || '').replace(/^@/, ''),
      fb: c.facebook || '',
      presentation: (c.presentation || '').split(/\n\s*\n/).filter(function (p){ return p.trim(); }),
      photos: (c.photos || []).map(lienPhoto),
      planning: LIBELLE.map(function (nom, i){
        var p = h[JOURS[i]];
        return { jour: nom, heures: (p && p[0] && p[1]) ? [hhmm(p[0]), hhmm(p[1])] : null,
                 cours: coursDuJour(c.cours, i) };
      }),
      equipements: [],
      avis: []
    };
    /* la 9e case est le drapeau Pro : c'est lui qui ouvre la reservation en
       ligne, sur la fiche comme sur les cartes de resultats */
    return [c.nom, sigleDe(c.nom), c.ville || '', coord[0], coord[1],
            c.disciplines || [], null, 0, c.offre === 'pro',
            amplitude(h), !!(h[auj] && h[auj][0]), detail];
  }

  /* Un club saisit une adresse, pas des coordonnees. Faute de mieux on prend
     celles de sa ville, ce qui suffit a situer la salle sur la carte ; sans
     ville connue, le plan et l'itineraire se cachent. */
  function coordsVille(ville, lat, lon){
    if (typeof lat === 'number' && typeof lon === 'number') return [lat, lon];
    var l = window.VILLES_FR || [];
    var cle = sansAccent(ville).toLowerCase().replace(/[^a-z]/g, '');
    for (var i = 0; i < l.length; i++)
      if (sansAccent(l[i][0]).toLowerCase().replace(/[^a-z]/g, '') === cle)
        return [l[i][1], l[i][2]];
    return [null, null];
  }

  /* `annuaire` et pas `club` : c'est une vue, et la seule lecture publique qui
     reste. Elle ne rend que les clubs publies, et elle remplace par null le
     telephone, l'e-mail, le site et les reseaux d'un club sans abonnement --
     les coordonnees sont ce que le Pro achete (Amaury, 23/09/2026), donc la
     base ne les donne a personne, pas meme a qui refait la requete a la main. */
  function clubsPublies(){
    if (!client) return Promise.resolve([]);
    return client.from('annuaire').select('*')
      .then(function (r){ return (r.error || !r.data) ? [] : r.data; })
      .catch(function (){ return []; });
  }

  /* Remplit le tableau SALLES de la page avec les clubs en ligne, puis previent.
     On pousse dans le tableau existant au lieu de le remplacer : les fonctions
     deja ecrites tiennent une reference dessus. */
  function chargeSalles(){
    if (!client) return Promise.resolve([]);
    /* Les pages d'annuaire n'embarquent pas le jeu de demonstration : elles
       n'ont pas de SALLES du tout, et c'est tres bien. On leur en donne un vide
       plutot que de refuser de charger. */
    if (!window.SALLES) window.SALLES = [];
    return clubsPublies().then(function (lignes){
      var ajoutees = lignes.map(enSalle);
      var connus = {};
      window.SALLES.forEach(function (s){ connus[s[11].slug] = true; });
      ajoutees.forEach(function (s){
        if (!connus[s[11].slug]) window.SALLES.push(s);
      });
      try {
        document.dispatchEvent(new CustomEvent('mcc:salles', { detail: ajoutees }));
      } catch (e) {
        var ev = document.createEvent('Event');
        ev.initEvent('mcc:salles', false, false);
        document.dispatchEvent(ev);
      }
      return ajoutees;
    });
  }

  /* ---- les vues d'une fiche ----
     Le chiffre que le gerant veut voir en premier, et celui qui vend le Pro :
     tant de personnes ont regarde la salle, aucune n'a pu appeler.

     On ne compte qu'une fois par navigateur et par jour : rafraichir sa propre
     fiche dix fois ne doit pas gonfler le chiffre. Si le navigateur refuse le
     stockage local (navigation privee stricte), on compte quand meme -- mieux
     vaut un chiffre un peu haut que pas de chiffre. L'ecriture passe par
     `compte_vue()`, qui n'accepte qu'un club publie et n'ajoute que un. */
  function compteVue(clubId){
    if (!client || !clubId) return Promise.resolve(false);
    var cle = 'mcc-vu-' + clubId + '-' + new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(cle)) return Promise.resolve(false);
      localStorage.setItem(cle, '1');
    } catch (e) { /* pas de stockage : on compte quand meme */ }
    /* Compter une visite ne doit jamais abimer la fiche : si l'appel part mal,
       on l'oublie. C'est un chiffre, pas la page. */
    try {
      return client.rpc('compte_vue', { cible: clubId })
        .then(function (){ return true; })
        .catch(function (){ return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  /* Les vues des `jours` derniers jours, du plus ancien au plus recent, avec les
     jours sans visite remis a zero : un graphique troue mentirait sur la forme. */
  function vuesDuClub(clubId, jours){
    if (!client || !clubId) return Promise.resolve([]);
    var depuis = new Date(Date.now() - (jours - 1) * 864e5).toISOString().slice(0, 10);
    return client.from('vue_fiche').select('jour, n')
      .eq('club_id', clubId).gte('jour', depuis)
      .then(function (r){
        var par = {};
        (r.data || []).forEach(function (x){ par[x.jour] = x.n; });
        var out = [];
        for (var i = jours - 1; i >= 0; i--) {
          var j = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
          out.push({ jour: j, n: par[j] || 0 });
        }
        return out;
      })
      .catch(function (){ return []; });
  }

  /* ---- les demandes pas encore traitees ----
     Une demande « recue » est une demande que le gerant n'a pas encore ouverte :
     c'est ce que la pastille du bandeau compte. Des qu'il la fait avancer d'une
     etape, elle sort du compte, donc la pastille se vide en travaillant, sans
     qu'on ait besoin d'une colonne « lue » de plus. */
  function nouvellesDemandes(clubId){
    if (!client || !clubId) return Promise.resolve(0);
    return client.from('demande').select('id')
      .eq('club_id', clubId).eq('statut', 'recue')
      .then(function (r){ return (r.data || []).length; })
      .catch(function (){ return 0; });
  }

  /* ---- vouloir passer au Pro ----
     Stripe n'est pas branche : le gerant le dit d'un bouton, l'equipe ouvre
     l'abonnement a la main. Une ligne par club, donc appuyer deux fois ne fait
     pas deux demandes -- la seconde revient en doublon, et on la lit comme un
     succes plutot que d'afficher une erreur a quelqu'un qui a bien demande. */
  function veutLePro(clubId){
    if (!client || !clubId) return Promise.reject(new Error('Hors ligne'));
    return session().then(function (s){
      if (!s) throw new Error('Il faut être connecté');
      return client.from('interet_pro')
        .insert({ club_id: clubId, membre_id: s.user.id });
    }).then(function (r){
      if (r && r.error && !/duplicate key|already exists/i.test(r.error.message)) throw r.error;
      return true;
    });
  }

  /* La demande en cours, s'il y en a une : la page dit « c'est note » plutot que
     de reproposer un bouton sur lequel il a deja appuye. */
  function monInteretPro(clubId){
    if (!client || !clubId) return Promise.resolve(null);
    return client.from('interet_pro').select('cree_le, repondu_le')
      .eq('club_id', clubId).maybeSingle()
      .then(function (r){ return (r && r.data) || null; })
      .catch(function (){ return null; });
  }

  /* Le depot d'une demande de seance d'essai. La politique d'acces n'accepte
     que le statut « recue » et un club publie : c'est la le garde-fou, pas ici. */
  function deposeDemande(clubId, champs){
    if (!client) return Promise.reject(new Error('Hors ligne'));
    return client.from('demande').insert({
      club_id: clubId, statut: 'recue',
      nom: champs.nom, mail: champs.mail, tel: champs.tel || null,
      discipline: champs.discipline || null, creneau: champs.creneau || null,
      cours_id: champs.cours_id || null,
      message: champs.message || null
    }).then(function (r){ if (r.error) throw r.error; return true; });
  }

  return {
    client: client, prete: prete, session: session, monClub: monClub,
    assureMonClub: assureMonClub,
    monProfil: monProfil, poseProfil: poseProfil, estAdmin: estAdmin,
    deconnexion: deconnexion,
    dire: dire, exigeCompte: exigeCompte, URL_BASE: URL_BASE,
    enSalle: enSalle, clubsPublies: clubsPublies, chargeSalles: chargeSalles,
    deposeDemande: deposeDemande, lienPhoto: lienPhoto,
    compteVue: compteVue, vuesDuClub: vuesDuClub,
    nouvellesDemandes: nouvellesDemandes,
    veutLePro: veutLePro, monInteretPro: monInteretPro
  };
})();
