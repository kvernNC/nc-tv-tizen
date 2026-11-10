/*
 * Mosaïque des chaînes (touche OK) : une case par chaîne avec l'image du programme en
 * cours (guide SFR / page La 1ère), le logo, le titre et une barre de progression.
 * La chaîne en cours continue derrière. Flèches pour se déplacer, OK pour zapper,
 * RETOUR pour fermer.
 */
var Mosaic = (function () {
  var COLS = 5;
  var open = false, sel = 0, onPick = null, tiles = [], refreshTimer = null, extras = [];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function setImage(t, url) {
    if (url && t.shot.getAttribute('data-src') !== url) {
      t.shot.setAttribute('data-src', url);
      t.shot.style.backgroundImage = 'url("' + url + '")';
      t.shot.className = 'shot';
    }
  }

  // Chaînes sans guide (Taratata, replay, radios) : leur propre description.
  function fillInfo(t, info) {
    info = info || {};
    t.title.textContent = info.title || info.text || '';
    t.time.textContent = info.title ? (info.text || '') : '';
    t.bar.style.width = '0';
    setImage(t, info.image);
  }

  function fillTile(t, ch, p) {
    if (!p) { t.title.textContent = ''; t.time.textContent = ''; t.bar.style.width = '0'; return; }
    t.title.textContent = p.title + (p.subtitle ? ' · ' + p.subtitle : '');
    t.time.textContent = Epg.hhmm(p.start) + ' – ' + Epg.hhmm(p.end) +
      (p.next ? '  ·  ensuite ' + p.next.title : '');
    var pct = Math.max(0, Math.min(100, (Date.now() - p.start) * 100 / (p.end - p.start)));
    t.bar.style.width = pct + '%';
    setImage(t, p.image);
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
    // Cases de réglage, après les chaînes.
    extras.forEach(function (x) {
      var tile = el('div', 'tile'), shot = el('div', 'shot noimg setting'), head = el('div', 'tile-head');
      var name = el('span', 'tile-name', 'Réglage');
      shot.setAttribute('data-name', '⚙');
      head.appendChild(name);
      var title = el('div', 'tile-title', x.label()), time = el('div', 'tile-time', 'OK pour changer');
      tile.appendChild(shot); tile.appendChild(head); tile.appendChild(title); tile.appendChild(time);
      grid.appendChild(tile);
      tiles.push({ el: tile, shot: shot, title: title, time: time, extra: x });
    });
  }

  function refreshPrograms() {
    CHANNELS.forEach(function (ch, i) {
      var t = tiles[i];
      if (!t) return;
      if (ch.info) { ch.info().then(function (info) { if (open && tiles[i] === t) fillInfo(t, info); }, function () {}); return; }
      Epg.now(ch).then(function (p) { if (open && tiles[i] === t) fillTile(t, ch, p); });
    });
  }

  function highlight() {
    tiles.forEach(function (t, i) { t.el.className = 'tile' + (i === sel ? ' selected' : ''); });
    // Faire défiler pour garder la ligne sélectionnée visible (3 lignes à l'écran).
    var row = Math.floor(sel / COLS), rows = Math.ceil(tiles.length / COLS);
    var first = Math.max(0, Math.min(row - 1, rows - 3));
    $('mosaic-grid').style.transform = 'translateY(' + (-first * 292) + 'px)';
    var t = tiles[sel];
    $('mosaic-sel').textContent = t && t.extra ? t.extra.label() : (sel + 1) + '  ' + CHANNELS[sel].name;
  }

  function clock() {
    var d = new Date();
    $('mosaic-clock').textContent = Epg.hhmm(d.getTime());
  }

  return {
    isOpen: function () { return open; },
    show: function (current, pick, settings) {
      onPick = pick;
      extras = settings || [];
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
        case KEY.ENTER:
          if (tiles[sel] && tiles[sel].extra) {   // case de réglage : on reste dans la mosaïque
            tiles[sel].extra.action();
            tiles[sel].title.textContent = tiles[sel].extra.label();
            break;
          }
          var s = sel; this.hide(); onPick(s); return true;
        case KEY.BACK: this.hide(); return true;
        default: return false;
      }
      highlight();
      return true;
    }
  };
})();
