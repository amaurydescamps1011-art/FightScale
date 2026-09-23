/* Un faux Supabase, en memoire, pour eprouver le parcours sans reseau.
   Il n'imite pas le RLS (la base locale s'en charge, voir db/rls_test.sh) : il
   imite l'API du client, pour que backend.cjs exerce le vrai code des pages —
   noms de champs, ordre des gestionnaires, enchainement des promesses. */
/* L'etat survit d'une page a l'autre par sessionStorage : sans cela, chaque
   navigation repartirait sans session et les pages protegees renverraient a la
   connexion. C'est ce que fait un vrai serveur, en moins bien. */
window.__FAUX_LIT__ = function (){
  try { return JSON.parse(sessionStorage.getItem('faux') || 'null'); } catch (e) { return null; }
};
window.__FAUX_ECRIT__ = function (){
  try { sessionStorage.setItem('faux', JSON.stringify(window.__FAUX__)); } catch (e) {}
};

window.supabase = {
  createClient: function (){
    var S = window.__FAUX__ = window.__FAUX__ || window.__FAUX_LIT__() || {
      session: null, users: {}, club: [], club_membre: [], demande: [], equipe: [],
      fichiers: []
    };
    var sauve = window.__FAUX_ECRIT__;
    var uid = function (){ return S.session && S.session.user.id; };
    var neuf = function (){ return 'id-' + Math.random().toString(36).slice(2, 10); };

    /* un constructeur de requete : select/update/eq/order/limit/single, thenable */
    function Req(table){
      var f = { table: table, op: 'select', filtres: [], un: false, champs: null };
      var api = {
        select: function (){ if (f.op !== 'update') f.op = 'select'; return api; },
        update: function (c){ f.op = 'update'; f.champs = c; return api; },
        insert: function (c){ f.op = 'insert'; f.champs = c; return api; },
        eq: function (k, v){ f.filtres.push([k, v]); return api; },
        order: function (){ return api; },
        limit: function (){ return api; },
        single: function (){ f.un = true; return api; },
        then: function (ok, ko){ return execute().then(ok, ko); }
      };
      function lignes(){
        return S[f.table].filter(function (r){
          return f.filtres.every(function (p){ return r[p[0]] === p[1]; });
        });
      }
      function execute(){
        return new Promise(function (res){
          var l;
          if (f.op === 'insert') {
            /* le depot d'une demande : la vraie politique n'accepte qu'un club
               publie, abonne Pro, et le statut « recue ». On refait ce controle
               ici pour que le test echoue si la page envoie autre chose */
            var c = f.champs;
            var vise = S.club.filter(function (x){ return x.id === c.club_id; })[0];
            if (!vise || vise.statut !== 'publie' || vise.offre !== 'pro'
                || c.statut !== 'recue') {
              res({ data: null, error: { message: 'new row violates row-level security policy' } });
              return;
            }
            var ligne = {};
            Object.keys(c).forEach(function (k){ ligne[k] = c[k]; });
            ligne.id = ligne.id || neuf();
            ligne.cree_le = ligne.cree_le || new Date().toISOString();
            S[f.table].push(ligne);
            sauve();
            res({ data: f.un ? ligne : [ligne], error: null });
            return;
          }
          if (f.table === 'club' && f.op === 'select' && !f.filtres.length) {
            /* la politique de lecture : les publies, plus les siens ; l'equipe voit tout */
            var admin = S.equipe.some(function (e){ return e.membre_id === uid(); });
            var miens = S.club_membre.filter(function (m){ return m.membre_id === uid(); })
                                     .map(function (m){ return m.club_id; });
            l = S.club.filter(function (c){
              return admin || c.statut === 'publie' || miens.indexOf(c.id) >= 0; });
          } else if (f.table === 'club_membre' && f.op === 'select') {
            l = S.club_membre.filter(function (m){ return m.membre_id === uid(); })
              .map(function (m){
                var c = S.club.filter(function (x){ return x.id === m.club_id; })[0];
                return { club_id: m.club_id, club: c };
              });
          } else if (f.table === 'equipe' && f.op === 'select') {
            l = S.equipe.filter(function (e){ return e.membre_id === uid(); });
          } else {
            l = lignes();
          }
          if (f.op === 'update') {
            l.forEach(function (r){ Object.keys(f.champs).forEach(function (k){ r[k] = f.champs[k]; }); });
          }
          sauve();
          res({ data: f.un ? (l[0] || null) : l, error: null });
        });
      }
      return api;
    }

    return {
      auth: {
        signUp: function (o){
          if (S.users[o.email]) return Promise.resolve({ error: { message: 'User already registered' } });
          S.users[o.email] = { id: neuf(), mdp: o.password, meta: (o.options || {}).data || {} };
          if (window.__CONFIRME_MAIL__) return Promise.resolve({ data: { session: null, user: {} }, error: null });
          S.session = { user: { id: S.users[o.email].id, email: o.email,
                                user_metadata: S.users[o.email].meta } };
          sauve();
          return Promise.resolve({ data: { session: S.session }, error: null });
        },
        signInWithPassword: function (o){
          var u = S.users[o.email];
          if (!u || u.mdp !== o.password)
            return Promise.resolve({ error: { message: 'Invalid login credentials' } });
          S.session = { user: { id: u.id, email: o.email, user_metadata: u.meta } };
          sauve();
          return Promise.resolve({ data: { session: S.session }, error: null });
        },
        getSession: function (){ return Promise.resolve({ data: { session: S.session } }); }
      },
      from: function (t){ return Req(t); },
      rpc: function (nom, args){
        if (nom !== 'creer_mon_club') return Promise.resolve({ error: { message: 'inconnu' } });
        if (!uid()) return Promise.resolve({ error: { message: 'Il faut etre connecte' } });
        if (S.club_membre.some(function (m){ return m.membre_id === uid(); }))
          return Promise.resolve({ error: { message: 'Ce compte gere deja un club' } });
        var id = neuf();
        S.club.push({ id: id, nom: args.nom_salle, statut: 'brouillon',
                      disciplines: [], horaires: {}, photos: [], offre: 'gratuit' });
        S.club_membre.push({ club_id: id, membre_id: uid() });
        sauve();
        return Promise.resolve({ data: id, error: null });
      },
      storage: { from: function (){ return { upload: function (chemin){
        S.fichiers.push(chemin); sauve();
        return Promise.resolve({ data: { path: chemin }, error: null });
      } }; } }
    };
  }
};
