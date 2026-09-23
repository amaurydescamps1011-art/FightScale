/* ---------- suggestions de villes ----------
   Le champ « Où » propose les grandes villes dès la première lettre, comme sur
   les plateformes de réservation : flèches, Entrée, Échap, clic. La liste et
   ses coordonnées viennent du découpage communal réel (voir _villes.js). */
(function (racine){

  function aplati(s){
    return (s || '').toLowerCase().normalize ?
      (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '') :
      (s || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  var PIN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>';

  racine.villeParNom = function (saisie){
    var c = aplati(saisie);
    if (!c) return null;
    for (var i = 0; i < VILLES_FR.length; i++)
      if (aplati(VILLES_FR[i][0]) === c) return VILLES_FR[i];
    for (var j = 0; j < VILLES_FR.length; j++)
      if (aplati(VILLES_FR[j][0]).indexOf(c) === 0) return VILLES_FR[j];
    return null;
  };

  racine.villeLaPlusProche = function (lat, lon, maxKm){
    var choix = null, mini = 1e9;
    for (var i = 0; i < VILLES_FR.length; i++){
      var v = VILLES_FR[i];
      var dy = (v[1] - lat) * 111.32;
      var dx = (v[2] - lon) * 111.32 * Math.cos((v[1] + lat) / 2 * Math.PI / 180);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < mini){ mini = d; choix = v; }
    }
    return (maxKm && mini > maxKm) ? null : choix;
  };

  /* champ : l'input ; surChoix(ville) : ce qu'on fait quand une ville est retenue */
  racine.suggestions = function (champ, surChoix){
    var boite = document.createElement('ul');
    boite.className = 'sug';
    boite.setAttribute('role', 'listbox');
    boite.hidden = true;
    champ.parentNode.appendChild(boite);
    champ.setAttribute('role', 'combobox');
    champ.setAttribute('aria-autocomplete', 'list');
    champ.setAttribute('aria-expanded', 'false');
    champ.setAttribute('autocomplete', 'off');
    var lot = [], sel = -1;

    function ferme(){
      boite.hidden = true; sel = -1;
      champ.setAttribute('aria-expanded', 'false');
    }
    function marque(i){
      sel = i;
      Array.prototype.forEach.call(boite.children, function (li, n){
        li.setAttribute('aria-selected', String(n === i));
        if (n === i) li.scrollIntoView({ block: 'nearest' });
      });
    }
    function cherche(){
      var q = aplati(champ.value);
      if (!q){ lot = []; ferme(); return; }
      var debut = [], dedans = [];
      for (var i = 0; i < VILLES_FR.length; i++){
        var p = aplati(VILLES_FR[i][0]).indexOf(q);
        if (p === 0) debut.push(VILLES_FR[i]);
        else if (p > 0) dedans.push(VILLES_FR[i]);
      }
      lot = debut.concat(dedans).slice(0, 7);
      if (!lot.length){ ferme(); return; }
      boite.innerHTML = lot.map(function (v, i){
        return '<li role="option" aria-selected="false" data-i="' + i + '">' +
               PIN + '<span>' + v[0] + '</span></li>';
      }).join('');
      boite.hidden = false;
      champ.setAttribute('aria-expanded', 'true');
      marque(0);
    }
    function retient(i){
      if (i < 0 || i >= lot.length) return false;
      champ.value = lot[i][0];
      ferme();
      surChoix(lot[i]);
      return true;
    }

    champ.addEventListener('input', cherche);
    champ.addEventListener('focus', function (){ if (champ.value) cherche(); });
    champ.addEventListener('blur', function (){ setTimeout(ferme, 120); });
    champ.addEventListener('keydown', function (e){
      if (boite.hidden){
        if (e.key === 'ArrowDown'){ e.preventDefault(); cherche(); }
        return;
      }
      if (e.key === 'ArrowDown'){ e.preventDefault(); marque((sel + 1) % lot.length); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); marque((sel - 1 + lot.length) % lot.length); }
      else if (e.key === 'Escape'){ e.preventDefault(); ferme(); }
      else if (e.key === 'Enter'){ if (retient(sel)) e.preventDefault(); }
      else if (e.key === 'Tab'){ retient(sel); }
    });
    boite.addEventListener('pointerdown', function (e){
      var li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      retient(+li.dataset.i);
    });
  };
})(window);
