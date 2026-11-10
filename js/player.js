/*
 * Lecteur vidéo, selon la plateforme :
 *  - TV Samsung (Tizen) : webapis.avplay (lecteur natif Samsung) ;
 *  - Android TV : ExoPlayer, piloté via l'objet "Android" fourni par l'app (MainActivity) ;
 *  - navigateur PC : balise <video> (debug).
 */
var Player = (function () {
  var hasAvplay = typeof webapis !== 'undefined' && webapis.avplay;
  var hasAndroid = typeof Android !== 'undefined' && Android.play;
  var video = null;
  var cb = {};

  if (hasAndroid) {
    // La vidéo est affichée SOUS la page : fond transparent, pas d'objet AVPlay.
    var obj = document.getElementById('av-player');
    if (obj) obj.parentNode.removeChild(obj);
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    // Événements envoyés par ExoPlayer.
    window.NativePlayer = {
      onEvent: function (type, detail) {
        if (type === 'buffering') cb.onBuffering && cb.onBuffering(true);
        else if (type === 'ready') cb.onBuffering && cb.onBuffering(false);
        else if (type === 'playing') cb.onPlaying && cb.onPlaying();
        else if (type === 'ended') cb.onEnded ? cb.onEnded() : (cb.onError && cb.onError(new Error('Fin du flux')));
        else if (type === 'error') cb.onError && cb.onError(new Error('Erreur lecteur : ' + detail));
      }
    };
  }

  function closeAv() {
    try { webapis.avplay.stop(); } catch (e) {}
    try { webapis.avplay.close(); } catch (e) {}
  }

  function play(url, callbacks, opts) {
    cb = callbacks || {};
    opts = opts || {};
    if (hasAndroid) { Android.play(url, opts.ua || ''); return; }
    if (!hasAvplay) return playHtml5(url);

    closeAv();
    try {
      webapis.avplay.open(url);
      if (opts.ua) { try { webapis.avplay.setStreamingProperty('USER_AGENT', opts.ua); } catch (e) {} }
      webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
      webapis.avplay.setListener({
        onbufferingstart: function () { cb.onBuffering && cb.onBuffering(true); },
        onbufferingcomplete: function () { cb.onBuffering && cb.onBuffering(false); },
        onstreamcompleted: function () { cb.onEnded ? cb.onEnded() : (cb.onError && cb.onError(new Error('Fin du flux'))); },
        onerror: function (type) { cb.onError && cb.onError(new Error('Erreur lecteur : ' + type)); },
        onevent: function () {}
      });
      webapis.avplay.prepareAsync(function () {
        webapis.avplay.play();
        cb.onPlaying && cb.onPlaying();
      }, function (err) {
        cb.onError && cb.onError(new Error('Préparation impossible : ' + (err && err.name || err)));
      });
    } catch (e) {
      cb.onError && cb.onError(e);
    }
  }

  function playHtml5(url) {
    if (!video) {
      var obj = document.getElementById('av-player');
      video = document.createElement('video');
      video.id = 'av-player';
      video.autoplay = true;
      video.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
      obj.parentNode.replaceChild(video, obj);
      video.addEventListener('waiting', function () { cb.onBuffering && cb.onBuffering(true); });
      video.addEventListener('playing', function () { cb.onBuffering && cb.onBuffering(false); cb.onPlaying && cb.onPlaying(); });
      video.addEventListener('ended', function () { cb.onEnded && cb.onEnded(); });
      video.addEventListener('error', function () { cb.onError && cb.onError(new Error('Erreur <video>')); });
    }
    video.src = url;
    video.play().catch(function () {});
  }

  function stop() {
    if (hasAndroid) Android.stop();
    else if (hasAvplay) closeAv();
    else if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  }

  return { play: play, stop: stop };
})();
