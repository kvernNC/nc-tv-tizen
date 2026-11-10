/*
 * Chaîne "JT NC La 1ère (replay)" : lance le dernier JT de NC La 1ère (19h30 ou 12h00),
 * puis enchaîne sur les éditions précédentes.
 *  1. derniers contenus de la région (API de l'app France TV) -> on garde les JT ;
 *  2. k7.ftven.fr/videos/<id> -> adresse du replay (DASH .../manifest.mpd) ;
 *  3. même fichier en HLS (.../master.m3u8), signé par le service de jeton France TV.
 */
var Replay = (function () {
  var LIST_URL = 'https://api-mobile.yatta.francetv.fr/generic/taxonomy/la1ere_nouvelle-caledonie/contents?platform=apps';
  var JT = ['la1ere_nouvelle-caledonie_journal-de-19h30-de-nouvelle-caledonie',
            'la1ere_nouvelle-caledonie_le-journal-de-12h00'];
  var cache = null;   // { until, items }
  var index = 0;      // 0 = le plus récent

  function image(it) {
    var imgs = it.images || [], best = null;
    for (var i = 0; i < imgs.length; i++) {
      var u = imgs[i].urls || {};
      if (imgs[i].type === 'vignette_16x9' || (!best && u['w:400'])) best = u['w:400'] || u['w:800'] || best;
    }
    return best;
  }

  function loadList() {
    if (cache && Date.now() < cache.until) return Promise.resolve(cache.items);
    function page(n) { return httpGetText(LIST_URL + '&page=' + n).then(function (t) { return JSON.parse(t).items || []; }); }
    return page(0).then(function (a) {
      var jts = a.filter(isJt);
      return jts.length >= 4 ? jts : page(1).then(function (b) { return jts.concat(b.filter(isJt)); });
    }).then(function (items) {
      items.sort(function (x, y) { return (y.broadcast_begin_date || 0) - (x.broadcast_begin_date || 0); });
      var list = items.map(function (it) {
        return {
          id: it.si_id,
          title: (it.program && it.program.label) || 'JT',
          subtitle: (it.title || '').replace(/^Édition du /, ''),
          start: (it.broadcast_begin_date || 0) * 1000,
          duration: it.duration || 0,
          image: image(it)
        };
      });
      cache = { until: Date.now() + 10 * 60000, items: list };
      return list;
    });
  }

  function isJt(it) { return it && it.si_id && it.program && JT.indexOf(it.program.program_path) >= 0; }

  function streamUrl(id) {
    var k7 = 'https://k7.ftven.fr/videos/' + id +
      '?country_code=NC&capabilities=drm&os=androidtv&diffusion_mode=tunnel_first&offline=false';
    return httpGetText(k7).then(function (t) {
      var v = JSON.parse(t).video;
      if (!v || !v.url) throw new Error('replay indisponible');
      var url = v.url.replace(/\/manifest\.mpd$/, '/master.m3u8');   // même vidéo en HLS
      var tok = v.token;
      if (tok && typeof tok === 'object') tok = tok.akamai || tok.drm;
      tok = tok || FTV_TOKEN_URL + '?format=json';
      return httpGetText(tok + (tok.indexOf('?') < 0 ? '?' : '&') + 'url=' + encodeURIComponent(url))
        .then(function (r) { return JSON.parse(r).url; });
    });
  }

  return {
    // Pour la chaîne : { url, title } de l'édition courante.
    resolve: function () {
      return loadList().then(function (list) {
        if (!list.length) throw new Error('aucun JT disponible');
        if (index >= list.length) index = 0;
        var it = list[index];
        return streamUrl(it.id).then(function (url) {
          return { url: url, title: it.title + ' · ' + it.subtitle };
        });
      });
    },
    advance: function () { index++; },       // édition précédente
    reset: function () { index = 0; },       // retour au plus récent
    // Pour la mosaïque / le bandeau : dernier JT disponible.
    info: function () {
      return loadList().then(function (list) {
        var it = list[0];
        return it ? { title: it.title + ' · ' + it.subtitle, image: it.image, text: 'Dernier JT en replay' } : null;
      });
    }
  };
})();
