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
      /* une ligne par compte, posee a l'inscription par un trigger en base */
      profil: [],
      /* une ligne par club et par jour, comptee par la fonction compte_vue */
      vue_fiche: [],
      /* `annuaire` est une vue, pas une table : elle est calculee a la lecture */
      annuaire: [],
      fichiers: []
    };
    /* Les jeux d'essai des tests posent leur propre etat dans sessionStorage, et
       certains ont ete ecrits avant l'arrivee d'une table. Sans ces valeurs par
       defaut, une lecture sur une table absente casse la page entiere -- c'est
       ce qui est arrive a la fiche le jour ou `vue_fiche` est apparue. */
    ['users', 'club', 'club_membre', 'demande', 'equipe', 'profil', 'vue_fiche',
     'annuaire', 'fichiers'].forEach(function (t){
      if (!S[t]) S[t] = (t === 'users') ? {} : [];
    });
    var sauve = window.__FAUX_ECRIT__;
    var uid = function (){ return S.session && S.session.user.id; };
    var neuf = function (){ return 'id-' + Math.random().toString(36).slice(2, 10); };

    /* un constructeur de requete : select/update/eq/order/limit/single, thenable */
    function Req(table){
      var f = { table: table, op: 'select', filtres: [], bornes: [], un: false,
                champs: null };
      var api = {
        /* `select()` ne change pas l'operation : il dit seulement ce qu'on veut
           en retour. Il remettait `op` a 'select', ce qui annulait l'upsert de
           `.upsert(...).select().single()` -- la ligne n'etait alors jamais
           ecrite, et le profil semblait s'enregistrer sans rien garder. */
        select: function (){ return api; },
        update: function (c){ f.op = 'update'; f.champs = c; return api; },
        insert: function (c){ f.op = 'insert'; f.champs = c; return api; },
        upsert: function (c){ f.op = 'upsert'; f.champs = c; return api; },
        eq: function (k, v){ f.filtres.push([k, v]); return api; },
        gte: function (k, v){ f.bornes.push([k, v]); return api; },
        order: function (){ return api; },
        limit: function (){ return api; },
        single: function (){ f.un = true; return api; },
        maybeSingle: function (){ f.un = true; return api; },
        then: function (ok, ko){ return execute().then(ok, ko); }
      };
      function lignes(){
        return S[f.table].filter(function (r){
          return f.filtres.every(function (p){ return r[p[0]] === p[1]; })
            && f.bornes.every(function (p){ return r[p[0]] >= p[1]; });
        });
      }
      function execute(){
        return new Promise(function (res){
          var l;
          if (f.op === 'upsert') {
            /* Le profil du compte : une ligne par membre, ecrasee sur place. La
               vraie base le fait par `on conflict (membre_id)`, avec des
               politiques qui interdisent d'ecrire celle d'un autre -- c'est
               db/rls_test.sh qui l'eprouve, pas ce faux serveur. */
            var u = f.champs;
            var deja = S[f.table].filter(function (r){ return r.membre_id === u.membre_id; })[0];
            if (deja) {
              Object.keys(u).forEach(function (k){ deja[k] = u[k]; });
            } else {
              deja = {};
              Object.keys(u).forEach(function (k){ deja[k] = u[k]; });
              S[f.table].push(deja);
            }
            sauve();
            res({ data: f.un ? deja : [deja], error: null });
            return;
          }
          if (f.op === 'insert') {
            /* le depot d'une demande : la vraie politique n'accepte qu'un club
               publie, abonne Pro, et le statut « recue ». On refait ce controle
               ici pour que le test echoue si la page envoie autre chose */
            var c = f.champs;
            var vise = S.club.filter(function (x){ return x.id === c.club_id; })[0];
            /* et, depuis le 23/09/2026, le cours choisi doit exister dans le
               planning du club -- tant qu'il n'en a pas saisi, le texte libre
               passe encore (club_a_ce_cours, dans 001_schema.sql) */
            var planning = (vise && vise.cours) || [];
            var bonCours = c.cours_id
              ? planning.some(function (x){ return x.id === c.cours_id; })
              : planning.length === 0;
            if (!vise || vise.statut !== 'publie' || vise.offre !== 'pro'
                || c.statut !== 'recue' || !bonCours) {
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
          if (f.table === 'annuaire' && f.op === 'select') {
            /* La vue publique : les clubs publies, et les coordonnees d'un club
               gratuit remplacees par null. On la refait ici pour que les pages
               soient eprouvees sur ce que la base rend vraiment -- si une page
               affichait le telephone d'un club gratuit, le test le verrait. */
            l = S.club.filter(function (c){ return c.statut === 'publie'; })
              .map(function (c){
                var v = {}, pro = c.offre === 'pro';
                Object.keys(c).forEach(function (k){ v[k] = c[k]; });
                delete v.contact_nom;
                ['tel', 'mail', 'site', 'instagram', 'facebook'].forEach(function (k){
                  if (!pro) v[k] = null;
                });
                return v;
              })
              .filter(function (r){
                return f.filtres.every(function (q){ return r[q[0]] === q[1]; });
              });
          } else if (f.table === 'club' && f.op === 'select' && !f.filtres.length) {
            /* la table, elle, n'est plus lisible publiquement : un gerant voit
               son club, l'equipe voit tout, et personne d'autre ne voit rien */
            var admin = S.equipe.some(function (e){ return e.membre_id === uid(); });
            var miens = S.club_membre.filter(function (m){ return m.membre_id === uid(); })
                                     .map(function (m){ return m.club_id; });
            l = S.club.filter(function (c){
              return admin || miens.indexOf(c.id) >= 0; });
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
          /* ce que fait le trigger `profil_a_l_inscription` en base */
          S.profil.push({ membre_id: S.users[o.email].id, nom: null, tel: null, fonction: null,
                          cree_le: new Date().toISOString() });
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
        getSession: function (){ return Promise.resolve({ data: { session: S.session } }); },
        getUser: function (){
          return Promise.resolve({ data: { user: S.session ? S.session.user : null } });
        },
        /* la session est deja ouverte : Supabase change le mot de passe sans
           passer par un e-mail, et c'est ce que fait la page « Mon compte » */
        updateUser: function (o){
          if (!S.session) return Promise.resolve({ error: { message: 'Il faut etre connecte' } });
          if (o && o.password) {
            if (o.password.length < 8)
              return Promise.resolve({ error: { message: 'Password should be at least 8 characters' } });
            var mail = S.session.user.email;
            if (S.users[mail]) S.users[mail].mdp = o.password;
            sauve();
          }
          return Promise.resolve({ data: { user: S.session.user }, error: null });
        },
        signOut: function (){ S.session = null; sauve(); return Promise.resolve({ error: null }); }
      },
      from: function (t){ return Req(t); },
      rpc: function (nom, args){
        if (nom === 'compte_vue') {
          /* Comme en base : seule la fiche d'un club publie est comptee, et une
             seule ligne existe par club et par jour. Un club en attente ne doit
             rien accumuler, sinon son tableau de bord mentirait le jour ou il
             passe en ligne. */
          var pub = S.club.filter(function (c){
            return c.id === args.cible && c.statut === 'publie'; })[0];
          if (!pub) return Promise.resolve({ data: null, error: null });
          var jour = new Date().toISOString().slice(0, 10);
          var ligne = S.vue_fiche.filter(function (v){
            return v.club_id === args.cible && v.jour === jour; })[0];
          if (ligne) ligne.n += 1;
          else S.vue_fiche.push({ club_id: args.cible, jour: jour, n: 1 });
          sauve();
          return Promise.resolve({ data: null, error: null });
        }
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
