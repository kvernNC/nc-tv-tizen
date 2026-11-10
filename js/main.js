(function () {
  var KEY = { ENTER: 13, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, BACK: 10009,
              CH_UP: 427, CH_DOWN: 428, INFO: 457, EXIT: 10182,
              FF: 417, NEXT: 10233, PLAY: 415, PLAYPAUSE: 10252 };
  var current = 0;
  var refreshTimer = null, retryTimer = null, osdTimer = null;
  var retryDelay = 3000;      // backoff : 3 s, 6 s, 12 s ... max 60 s
  var playToken = 0;          // invalide les callbacks d'une lecture précédente

  function $(id) { return document.getElementById(id); }

  function showStatus(text, isError) {
    $('status-text').textContent = text;
    $('status').className = isError ? 'error' : '';
  }
  function hideStatus() { $('status').className = 'hidden'; }

  var nowTitle = '';
  function showOsd() {
    $('osd-channel').textContent = (current + 1) + '  ' + CHANNELS[current].name;
    $('osd-title').textContent = nowTitle;
    $('osd-hint').textContent = 'CH+/CH− ou ◀ ▶ : changer de chaîne' +
      (CHANNELS[current].continuous ? ' · ⏩ ou ▶❚❚ : prestation suivante' : '') + ' · RETOUR : quitter';
    $('osd').className = '';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { $('osd').className = 'hidden'; }, 4000);
  }

  function clearTimers() { clearTimeout(refreshTimer); clearTimeout(retryTimer); }

  function start() {
    var ch = CHANNELS[current];
    var token = ++playToken;
    clearTimers();
    nowTitle = '';
    showOsd();
    showStatus('Connexion à ' + ch.name + '…');

    ch.resolve().then(function (res) {
      if (token !== playToken) return;
      var url = typeof res === 'string' ? res : res.url;
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
        onEnded: ch.continuous ? function () { if (token === playToken) start(); } : null,
        onError: function (e) { if (token === playToken) scheduleRetry(e); }
      });
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
    retryDelay = 3000;
    Player.stop();
    start();
  }

  function quit() {
    clearTimers();
    Player.stop();
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case KEY.CH_UP: case KEY.UP: case KEY.RIGHT: zap(1); break;
      case KEY.CH_DOWN: case KEY.DOWN: case KEY.LEFT: zap(-1); break;
      case KEY.ENTER: case KEY.INFO: showOsd(); break;
      case KEY.FF: case KEY.NEXT: case KEY.PLAY: case KEY.PLAYPAUSE:
        if (CHANNELS[current].continuous) { Player.stop(); start(); } // prestation suivante
        break;
      case KEY.BACK: case KEY.EXIT: quit(); break;
      default:
        if (e.keyCode >= 49 && e.keyCode <= 57) { goTo(e.keyCode - 49); break; } // touches 1 à 9
        return;
    }
    e.preventDefault();
  });

  // Application mise en arrière-plan (touche Home, source...) : on coupe,
  // et on relance un direct propre au retour.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimers(); playToken++; Player.stop(); }
    else start();
  });

  window.addEventListener('load', function () {
    try {
      ['ChannelUp', 'ChannelDown', 'Info', 'MediaFastForward', 'MediaTrackNext', 'MediaPlay', 'MediaPlayPause', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
        tizen.tvinputdevice.registerKey(k);
      });
    } catch (e) { /* hors TV */ }
    start();
  });
})();
