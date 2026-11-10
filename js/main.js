(function () {
  var KEY = { ENTER: 13, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, BACK: 10009,
              CH_UP: 427, CH_DOWN: 428, INFO: 457, EXIT: 10182,
              FF: 417, NEXT: 10233, PLAY: 415, PLAYPAUSE: 10252, CAPTION: 10221 };
  var current = 0;
  var refreshTimer = null, retryTimer = null, osdTimer = null;
  var retryDelay = 3000;      // backoff : 3 s, 6 s, 12 s ... max 60 s
  var playToken = 0;          // invalide les callbacks d'une lecture précédente

  function $(id) { return document.getElementById(id); }

  // ---- Réglages mémorisés sur la TV ----
  function load(k, d) { try { var v = localStorage.getItem('nctv.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem('nctv.' + k, JSON.stringify(v)); } catch (e) {} }
  var subsOn = load('subs', false);

  var toastTimer = null;
  function toast(text) {
    $('toast').textContent = text;
    $('toast').className = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').className = 'hidden'; }, 2500);
  }

  function toggleSubs() {
    subsOn = !subsOn;
    save('subs', subsOn);
    Player.setSubtitles(subsOn);
    toast(subsOn ? 'Sous-titres activés (si la chaîne en propose)' : 'Sous-titres désactivés');
  }

  // ---- Écran des radios ----
  function showRadio(ch) {
    if (!ch.radio) { $('radio').className = 'hidden'; return; }
    var logo = $('radio-logo');
    $('radio-name').textContent = ch.name;
    $('radio-now').textContent = 'Radio en direct';
    $('radio-letter').textContent = ch.name.charAt(0);
    logo.style.display = ch.logo ? '' : 'none';
    $('radio-letter').style.display = ch.logo ? 'none' : '';
    if (ch.logo) { logo.onerror = function () { logo.style.display = 'none'; $('radio-letter').style.display = ''; }; logo.src = ch.logo; }
    $('radio').className = '';
  }

  function showStatus(text, isError) {
    if (Mosaic.isOpen()) return;
    $('status-text').textContent = text;
    $('status').className = isError ? 'error' : '';
  }
  function hideStatus() { $('status').className = 'hidden'; }

  var nowTitle = '';
  function showOsd() {
    if (Mosaic.isOpen()) return;
    $('osd-channel').textContent = (current + 1) + '  ' + CHANNELS[current].name;
    $('osd-title').textContent = nowTitle;
    $('osd-sub').textContent = '';
    if (!nowTitle) showProgram(CHANNELS[current]);
    var ch = CHANNELS[current];
    $('osd-hint').textContent = 'OK : mosaïque · CH+/CH− : chaîne' +
      (ch.continuous ? ' · ⏩ ou ▶❚❚ : ' + (ch.advance ? 'JT précédent' : 'prestation suivante') : '') + ' · RETOUR : quitter';
    $('osd').className = '';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { $('osd').className = 'hidden'; }, 6000);
  }

  // Programme en cours (guide SFR / page La 1ère), affiché dès qu'il arrive.
  function showProgram(ch) {
    Epg.now(ch).then(function (p) {
      if (!p || CHANNELS[current] !== ch || nowTitle) return;
      $('osd-title').textContent = p.title;
      $('osd-sub').textContent = Epg.hhmm(p.start) + ' – ' + Epg.hhmm(p.end) + (p.subtitle ? '  ·  ' + p.subtitle : '') +
        (p.next ? '     Ensuite : ' + Epg.hhmm(p.next.start) + ' ' + p.next.title : '');
    });
  }

  function clearTimers() { clearTimeout(refreshTimer); clearTimeout(retryTimer); }

  function start() {
    var ch = CHANNELS[current];
    var token = ++playToken;
    clearTimers();
    nowTitle = '';
    showRadio(ch);
    showOsd();
    showStatus('Connexion à ' + ch.name + '…');

    ch.resolve().then(function (res) {
      if (token !== playToken) return;
      var url = typeof res === 'string' ? res : res.url;
      var ua = res && res.ua;
      nowTitle = (res && res.title) || '';
      Player.play(url, {
        onBuffering: function (on) { if (token === playToken) on ? showStatus('Chargement…') : hideStatus(); },
        onPlaying: function () {
          if (token !== playToken) return;
          hideStatus();
          retryDelay = 3000;
          if (nowTitle) showOsd();
          if (ch.prefetch) ch.prefetch();   // prépare la vidéo suivante
          // Le jeton expire : on relance avant qu'il ne soit refusé.
          if (ch.refreshMs) refreshTimer = setTimeout(start, ch.refreshMs);
        },
        onEnded: ch.continuous ? function () { if (token === playToken) { if (ch.advance) ch.advance(); start(); } } : null,
        onMeta: function (title) { if (token === playToken && ch.radio && title) $('radio-now').textContent = '♪ ' + title; },
        onError: function (e) { if (token === playToken) scheduleRetry(e); }
      }, { ua: ua });
    }).catch(function (e) { if (token === playToken) scheduleRetry(e); });
  }

  function scheduleRetry(err) {
    console.log('[nctv] ' + err.message);
    clearTimers();
    showStatus(CHANNELS[current].name + ' : ' + err.message + ' — nouvel essai dans ' + Math.round(retryDelay / 1000) + ' s', true);
    retryTimer = setTimeout(start, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  function zap(delta) { goTo((current + delta + CHANNELS.length) % CHANNELS.length); }

  function goTo(index) {
    if (index === current) { showOsd(); return; }
    if (index < 0 || index >= CHANNELS.length) return;
    current = index;
    if (CHANNELS[index].reset) CHANNELS[index].reset();   // replay : on repart du dernier JT
    retryDelay = 3000;
    Player.stop();
    start();
  }

  // Saisie du numéro de chaîne : 1 ou 2 chiffres, validé après 1,5 s (ou dès qu'il
  // ne peut plus y avoir d'autre chiffre).
  var numBuf = '', numTimer = null;
  function typeDigit(d) {
    numBuf += d;
    $('numbuf').textContent = numBuf;
    $('numbuf').className = '';
    clearTimeout(numTimer);
    var n = +numBuf;
    if (numBuf.length >= 2 || n * 10 > CHANNELS.length) commitNumber();
    else numTimer = setTimeout(commitNumber, 1500);
  }
  function commitNumber() {
    clearTimeout(numTimer);
    var n = +numBuf;
    numBuf = '';
    $('numbuf').className = 'hidden';
    if (n >= 1 && n <= CHANNELS.length) goTo(n - 1);
  }

  function quit() {
    clearTimers();
    Player.stop();
    if (typeof Android !== 'undefined' && Android.exit) { Android.exit(); return; }
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    if (Mosaic.isOpen()) {
      if (Mosaic.key(e.keyCode, KEY)) e.preventDefault();
      return;
    }
    switch (e.keyCode) {
      case KEY.CH_UP: case KEY.UP: case KEY.RIGHT: zap(1); break;
      case KEY.CH_DOWN: case KEY.DOWN: case KEY.LEFT: zap(-1); break;
      case KEY.ENTER:
        $('osd').className = 'hidden';
        hideStatus();
        Mosaic.show(current, goTo, [{
          label: function () { return 'Sous-titres : ' + (subsOn ? 'activés' : 'désactivés'); },
          action: toggleSubs
        }]);
        break;
      case KEY.INFO: showOsd(); break;
      case KEY.FF: case KEY.NEXT: case KEY.PLAY: case KEY.PLAYPAUSE:
        if (CHANNELS[current].continuous) {   // prestation suivante / JT précédent
          if (CHANNELS[current].advance) CHANNELS[current].advance();
          Player.stop(); start();
        }
        break;
      case KEY.CAPTION: toggleSubs(); break;
      case KEY.BACK: case KEY.EXIT: quit(); break;
      default:
        if (e.keyCode >= 48 && e.keyCode <= 57) { typeDigit(e.keyCode - 48); break; } // 0 à 9
        return;
    }
    e.preventDefault();
  });

  // Application mise en arrière-plan (touche Home, source...) : on coupe,
  // et on relance un direct propre au retour.
  function onHidden() { clearTimers(); playToken++; Player.stop(); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) onHidden(); else window.__appVisible();
  });
  // Android TV : l'app prévient elle-même (onStop / onStart).
  window.__appHidden = onHidden;
  window.__appVisible = function () {
    if (Mosaic.isOpen()) Mosaic.hide();
    if (ParaTV.age() > 15 * 60000) refreshParaTV();   // retour de veille : liens ParaTV sûrement renouvelés
    start();
  };

  // Liste ParaTV : on la relit régulièrement (liens renouvelés, chaînes ajoutées).
  function refreshParaTV() {
    return ParaTV.refresh().then(function (added) {
      added.forEach(function (c) { CHANNELS.push(c); });
      if (added.length) console.log('[nctv] ' + added.length + ' nouvelles chaînes ParaTV');
    }).catch(function (e) { console.log('[nctv] ParaTV indisponible : ' + e.message); });
  }

  window.addEventListener('load', function () {
    ['ChannelUp', 'ChannelDown', 'Info', 'MediaFastForward', 'MediaTrackNext', 'MediaPlay', 'MediaPlayPause',
     'Caption', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
      try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* touche absente ou hors TV */ }
    });
    Player.setSubtitles(subsOn);
    start();
    // Chaînes ParaTV ajoutées à la suite, en arrière-plan.
    refreshParaTV();
    setInterval(refreshParaTV, 30 * 60000);
  });
})();
