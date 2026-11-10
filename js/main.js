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
    $('osd-sub').textContent = '';
    if (!nowTitle) showProgram(CHANNELS[current]);
    $('osd-hint').textContent = 'CH+/CH− ou ◀ ▶ : changer de chaîne' +
      (CHANNELS[current].continuous ? ' · ⏩ ou ▶❚❚ : prestation suivante' : '') + ' · RETOUR : quitter';
    $('osd').className = '';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { $('osd').className = 'hidden'; }, 6000);
  }

  // Programme en cours (guide SFR / page La 1ère), affiché dès qu'il arrive.
  function showProgram(ch) {
    Epg.now(ch).then(function (p) {
      if (!p || CHANNELS[current] !== ch || nowTitle) return;
      $('osd-title').textContent = p.title;
      $('osd-sub').textContent = Epg.hhmm(p.start) + ' – ' + Epg.hhmm(p.end) + (p.subtitle ? '  ·  ' + p.subtitle : '');
    });
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
        onEnded: ch.continuous ? function () { if (token === playToken) start(); } : null,
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
        if (e.keyCode >= 48 && e.keyCode <= 57) { typeDigit(e.keyCode - 48); break; } // 0 à 9
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
      ['ChannelUp', 'ChannelDown', 'Info', 'MediaFastForward', 'MediaTrackNext', 'MediaPlay', 'MediaPlayPause', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
        tizen.tvinputdevice.registerKey(k);
      });
    } catch (e) { /* hors TV */ }
    start();
    // Chaînes ParaTV ajoutées à la suite, en arrière-plan.
    ParaTV.load().then(function (list) {
      list.forEach(function (c) { CHANNELS.push(c); });
      console.log('[nctv] ' + list.length + ' chaînes ParaTV ajoutées');
    }).catch(function (e) { console.log('[nctv] ParaTV indisponible : ' + e.message); });
  });
})();
