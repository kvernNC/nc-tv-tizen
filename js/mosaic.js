/*
 * Mosaïque des chaînes (touche OK) : une case par chaîne avec l'image du programme en
 * cours (guide SFR / page La 1ère), le logo, le titre et une barre de progression.
 * La chaîne en cours continue derrière. Flèches pour se déplacer, OK pour zapper,
 * RETOUR pour fermer.
 */
var Mosaic = (function () {
  var COLS = 5;
  var open = false, sel = 0, onPick = null, tiles = [], refreshTimer = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function fillTile(t, ch, p) {
    if (ch.continuous) { // Taratata
      t.title.textContent = 'Prestations au hasard, en continu';
      t.time.textContent = '';
      t.bar.style.width = '0';
      return;
    }
    if (!p) { t.title.textContent = ''; t.time.textContent = ''; t.bar.style.width = '0'; return; }
    t.title.textContent = p.title + (p.subtitle ? ' · ' + p.subtitle : '');
    t.time.textContent = Epg.hhmm(p.start) + ' – ' + Epg.hhmm(p.end);
    var pct = Math.max(0, Math.min(100, (Date.now() - p.start) * 100 / (p.end - p.start)));
    t.bar.style.width = pct + '%';
    if (p.image && t.shot.getAttribute('data-src') !== p.image) {
      t.shot.setAttribute('data-src', p.image);
      t.shot.style.backgroundImage = 'url("' + p.image + '")';
      t.shot.className = 'shot';
    }
  }

  function build() {
    var grid = $('mosaic-grid');
    grid.innerHTML = '';
    tiles = CHANNELS.map(function (ch, i) {
      var tile = el('div', 'tile'), shot = el('div', 'shot'), head = el('div', 'tile-head');
      var num = el('span', 'tile-num', String(i + 1));
      var logo = el('img', 'tile-logo');
      var name = el('span', 'tile-name', ch.name);
      if (ch.logo) {
        shot.className = 'shot logo';
        shot.style.backgroundImage = 'url("' + ch.logo + '")';  // en attendant l'image du programme
        logo.src = ch.logo;
        logo.onerror = function () {
          logo.style.display = 'none'; name.style.display = '';
          if (shot.className === 'shot logo') { shot.className = 'shot noimg'; shot.style.backgroundImage = ''; shot.setAttribute('data-name', ch.name); }
        };
        name.style.display = 'none';
      } else { logo.style.display = 'none'; shot.className = 'shot noimg'; shot.setAttribute('data-name', ch.name); }
      var title = el('div', 'tile-title'), time = el('div', 'tile-time');
      var prog = el('div', 'tile-prog'), bar = el('div', 'tile-bar');
      prog.appendChild(bar);
      shot.appendChild(prog);
      head.appendChild(num); head.appendChild(logo); head.appendChild(name);
      tile.appendChild(shot); tile.appendChild(head); tile.appendChild(title); tile.appendChild(time);
      grid.appendChild(tile);
      return { el: tile, shot: shot, title: title, time: time, bar: bar };
    });
  }

  function refreshPrograms() {
    CHANNELS.forEach(function (ch, i) {
      var t = tiles[i];
      if (!t) return;
      if (ch.continuous) { fillTile(t, ch, null); return; }
      Epg.now(ch).then(function (p) { if (open && tiles[i] === t) fillTile(t, ch, p); });
    });
  }

  function highlight() {
    tiles.forEach(function (t, i) { t.el.className = 'tile' + (i === sel ? ' selected' : ''); });
    // Faire défiler pour garder la ligne sélectionnée visible (3 lignes à l'écran).
    var row = Math.floor(sel / COLS), rows = Math.ceil(tiles.length / COLS);
    var first = Math.max(0, Math.min(row - 1, rows - 3));
    $('mosaic-grid').style.transform = 'translateY(' + (-first * 292) + 'px)';
    var ch = CHANNELS[sel];
    $('mosaic-sel').textContent = (sel + 1) + '  ' + ch.name;
  }

  function clock() {
    var d = new Date();
    $('mosaic-clock').textContent = Epg.hhmm(d.getTime());
  }

  return {
    isOpen: function () { return open; },
    show: function (current, pick) {
      onPick = pick;
      sel = current;
      open = true;
      build();
      highlight();
      clock();
      $('mosaic').className = '';
      refreshPrograms();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(function () { clock(); refreshPrograms(); }, 30000);
    },
    hide: function () {
      open = false;
      clearInterval(refreshTimer);
      $('mosaic').className = 'hidden';
      $('mosaic-grid').innerHTML = '';
      tiles = [];
    },
    // Renvoie true si la touche a été traitée.
    key: function (code, KEY) {
      var n = tiles.length;
      switch (code) {
        case KEY.LEFT: sel = (sel - 1 + n) % n; break;
        case KEY.RIGHT: sel = (sel + 1) % n; break;
        case KEY.UP: if (sel - COLS >= 0) sel -= COLS; break;
        case KEY.DOWN: sel = Math.min(n - 1, sel + COLS); break;
        case KEY.CH_UP: sel = Math.max(0, sel - COLS * 3); break;   // page précédente
        case KEY.CH_DOWN: sel = Math.min(n - 1, sel + COLS * 3); break; // page suivante
        case KEY.ENTER: var s = sel; this.hide(); onPick(s); return true;
        case KEY.BACK: this.hide(); return true;
        default: return false;
      }
      highlight();
      return true;
    }
  };
})();
