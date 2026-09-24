/* ---- la page acquisition ----
   Deux choses : le choix de la duree d'engagement, qui recalcule les prix sous
   les yeux, et le formulaire « etre rappele », qui ecrit dans la table
   contact_acquisition. La base previent l'equipe par e-mail (voir
   previent_l_equipe() dans db/001_schema.sql). */
(function (){
  /* ---------- la duree d'engagement ---------- */
  var boutons = document.querySelectorAll('.acq-duree button');
  function euros(n){
    var s = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  }
  function applique(remise){
    Array.prototype.forEach.call(document.querySelectorAll('.acq-prix b[data-base]'), function (b){
      b.textContent = euros(Number(b.getAttribute('data-base')) * (100 - remise) / 100);
    });
    Array.prototype.forEach.call(boutons, function (x){
      x.setAttribute('aria-checked', String(Number(x.getAttribute('data-remise')) === remise));
    });
    var unite = euros(15 * (100 - remise) / 100);
    var t = document.querySelector('.acq-offres-bloc .section-titre');
    if (t) t.textContent = unite + ' la séance d’essai confirmée';
  }
  Array.prototype.forEach.call(boutons, function (x){
    x.addEventListener('click', function (){ applique(Number(x.getAttribute('data-remise'))); });
  });

  /* ---------- le formulaire ---------- */
  var form = document.getElementById('acq-form');
  if (!form) return;
  var erreur = document.getElementById('a-erreur');
  var envoi = document.getElementById('a-envoi');
  var SB = window.MCC || null;

  function dit(t){ erreur.textContent = t; erreur.hidden = !t; }

  form.addEventListener('submit', function (e){
    e.preventDefault();
    dit('');
    var manque = null;
    ['a-club', 'a-ville', 'a-nom', 'a-mail'].forEach(function (id){
      var c = document.getElementById(id);
      var vide = !c.value.trim() || (c.type === 'email' && c.value.indexOf('@') < 1);
      c.closest('.champ').classList.toggle('manque', vide);
      if (vide && !manque) manque = c;
    });
    if (manque) { manque.focus(); return; }

    var ligne = {
      club: document.getElementById('a-club').value.trim(),
      ville: document.getElementById('a-ville').value.trim(),
      nom: document.getElementById('a-nom').value.trim(),
      mail: document.getElementById('a-mail').value.trim(),
      tel: document.getElementById('a-tel').value.trim() || null,
      pack: document.getElementById('a-pack').value || null,
      message: document.getElementById('a-mot').value.trim() || null
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
      document.getElementById('acq-merci').hidden = false;
    }).catch(function (err){
      envoi.disabled = false;
      envoi.textContent = 'Être rappelé';
      dit(SB.dire(err));
    });
  });
})();
