(function () {
  var KEY = { ENTER: 13, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, BACK: 10009,
              CH_UP: 427, CH_DOWN: 428, INFO: 457, EXIT: 10182 };
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

  function showOsd() {
    $('osd-channel').textContent = CHANNELS[current].name;
    $('osd').className = '';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { $('osd').className = 'hidden'; }, 4000);
  }

  function clearTimers() { clearTimeout(refreshTimer); clearTimeout(retryTimer); }

  function start() {
    var ch = CHANNELS[current];
    var token = ++playToken;
    clearTimers();
    showOsd();
    showStatus('Connexion à ' + ch.name + '…');

    ch.resolve().then(function (url) {
      if (token !== playToken) return;
      Player.play(url, {
        onBuffering: function (on) { if (token === playToken) on ? showStatus('Chargement…') : hideStatus(); },
        onPlaying: function () {
          if (token !== playToken) return;
          hideStatus();
          retryDelay = 3000;
          // Le jeton expire : on relance avant qu'il ne soit refusé.
          if (ch.refreshMs) refreshTimer = setTimeout(start, ch.refreshMs);
        },
        onError: function (e) { if (token === playToken) scheduleRetry(e); }
      });
    }).catch(function (e) { if (token === playToken) scheduleRetry(e); });
  }

  function scheduleRetry(err) {
    console.log('[nctv] ' + err.message);
    clearTimers();
    showStatus(err.message + ' — nouvel essai dans ' + Math.round(retryDelay / 1000) + ' s', true);
    retryTimer = setTimeout(start, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  function zap(delta) {
    if (CHANNELS.length < 2) { showOsd(); return; }
    current = (current + delta + CHANNELS.length) % CHANNELS.length;
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
      case KEY.BACK: case KEY.EXIT: quit(); break;
      default: return;
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
      ['ChannelUp', 'ChannelDown', 'Info'].forEach(function (k) {
        tizen.tvinputdevice.registerKey(k);
      });
    } catch (e) { /* hors TV */ }
    start();
  });
})();
