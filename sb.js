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

  return {
    client: client, prete: prete, session: session, monClub: monClub,
    dire: dire, exigeCompte: exigeCompte, URL_BASE: URL_BASE
  };
})();
