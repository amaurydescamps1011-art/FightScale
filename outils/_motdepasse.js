/* ---- nouveau mot de passe ----
   On arrive ici par le lien recu par e-mail. Supabase met un jeton de
   recuperation dans l'adresse et ouvre une session limitee : tant qu'elle est
   la, updateUser suffit. Sans elle, le lien est expire ou deja utilise. */
(function (){
  var SB = window.MCC;
  var charge = document.getElementById('mdp-charge');
  var erreur = document.getElementById('mdp-erreur');
  var form = document.getElementById('mdp-form');

  function rate(msg){ charge.hidden = true; erreur.textContent = msg; erreur.hidden = false; }

  if (!SB || !SB.prete()) {
    rate('Cette page a besoin d’une connexion au serveur, qui n’est pas disponible ici.');
    return;
  }

  /* Le jeton arrive dans le fragment (#access_token=…), que le client lit tout
     seul ; il lui faut un instant, d'ou l'ecoute de l'evenement en plus. */
  var reglee = false;
  function ouvre(){
    if (reglee) return;
    reglee = true;
    charge.hidden = true;
    form.hidden = false;
    document.getElementById('mdp-1').focus();
  }
  SB.client.auth.onAuthStateChange(function (ev, session){
    if (session) ouvre();
  });
  SB.session().then(function (s){
    if (s) { ouvre(); return; }
    setTimeout(function (){
      if (!reglee) rate('Ce lien n’est plus valable. Demandez-en un nouveau depuis la ' +
                        'fenêtre de connexion.');
    }, 2500);
  });

  form.addEventListener('submit', function (e){
    e.preventDefault();
    erreur.hidden = true;
    var a = document.getElementById('mdp-1').value;
    var b = document.getElementById('mdp-2').value;
    if (a.length < 8) { erreur.textContent = 'Huit caractères au minimum.'; erreur.hidden = false; return; }
    if (a !== b) { erreur.textContent = 'Les deux mots de passe ne sont pas les mêmes.'; erreur.hidden = false; return; }
    var envoi = document.getElementById('mdp-envoi');
    envoi.disabled = true;
    envoi.textContent = 'Un instant…';
    SB.client.auth.updateUser({ password: a }).then(function (r){
      if (r.error) throw r.error;
      form.hidden = true;
      document.getElementById('mdp-fait').hidden = false;
    }).catch(function (err){
      envoi.disabled = false;
      envoi.textContent = 'Enregistrer';
      erreur.textContent = SB.dire(err);
      erreur.hidden = false;
    });
  });
})();
