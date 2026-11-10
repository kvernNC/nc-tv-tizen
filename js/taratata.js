/*
 * Chaîne "Taratata" : enchaîne au hasard des prestations de mytaratata.com.
 * 1. une page au hasard de la liste des émissions (/taratata/page/N)
 * 2. une émission au hasard sur cette page
 * 3. une prestation au hasard dans l'émission (on ignore les interviews)
 * 4. sur la page de la prestation : titre (<h1>) + vidéo "Live"
 *    - data-url  -> playlist HLS (576p/720p) : on prend la meilleure qualité
 *    - data-source -> MP4 576p en secours
 */
var Taratata = (function () {
  var ROOT = 'https://mytaratata.com';
  var maxPage = 0;
  var history = [];          // évite de revoir les mêmes prestations
  var prefetched = null;     // prochaine prestation préparée pendant la lecture

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }
  function decode(s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }

  function getMaxPage() {
    if (maxPage) return Promise.resolve(maxPage);
    return httpGetText(ROOT + '/taratata').then(function (html) {
      var nums = (html.match(/\/taratata\/page\/(\d+)/g) || []).map(function (m) { return +m.split('/').pop(); });
      maxPage = Math.max.apply(null, nums.concat([1]));
      return maxPage;
    });
  }

  function randomPerformanceUrl() {
    return getMaxPage().then(function (n) {
      var page = 1 + Math.floor(Math.random() * n);
      return httpGetText(ROOT + '/taratata/page/' + page);
    }).then(function (html) {
      var eps = uniq(html.match(/\/taratata\/\d+(?=")/g) || []);
      if (!eps.length) throw new Error('aucune émission trouvée');
      return httpGetText(ROOT + pick(eps));
    }).then(function (html) {
      var perfs = uniq(html.match(/\/taratata\/\d+\/[a-z0-9-]+(?=")/g) || [])
        .filter(function (u) { return u.indexOf('interview') < 0 && u.indexOf('fait-son-taratata') < 0; });
      var fresh = perfs.filter(function (u) { return history.indexOf(u) < 0; });
      if (!perfs.length) throw new Error('aucune prestation trouvée');
      return pick(fresh.length ? fresh : perfs);
    });
  }

  function bestVariant(masterUrl, mp4) {
    return httpGetText(masterUrl).then(function (m3u) {
      var best = null, bestBw = -1, lines = m3u.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var bw = /BANDWIDTH=(\d+)/.exec(lines[i]);
        if (bw && lines[i + 1] && +bw[1] > bestBw) { bestBw = +bw[1]; best = lines[i + 1].trim(); }
      }
      if (!best) throw new Error('playlist vide');
      return /^https?:/.test(best) ? best : masterUrl.replace(/[^\/]*$/, '') + best;
    }).catch(function () { if (mp4) return mp4; throw new Error('vidéo introuvable'); });
  }

  function load(path) {
    return httpGetText(ROOT + path).then(function (html) {
      var h1 = /<h1>([\s\S]*?)<\/h1>/.exec(html);
      var hls = /data-url='([^']+\/videos\/\d+)'/.exec(html);
      var mp4 = /data-source="([^"]+\.mp4)"/.exec(html);
      if (!hls && !mp4) throw new Error('pas de vidéo sur ' + path);
      history.push(path); if (history.length > 100) history.shift();
      var title = h1 ? decode(h1[1].trim()) : '';
      var p = hls ? bestVariant(hls[1], mp4 && mp4[1]) : Promise.resolve(mp4[1]);
      return p.then(function (url) { return { url: url, title: title }; });
    });
  }

  function fetchOne(tries) {
    return randomPerformanceUrl().then(load).catch(function (e) {
      if (tries > 1) return fetchOne(tries - 1);
      throw e;
    });
  }

  return {
    // Renvoie { url, title } ; utilise la prestation préparée à l'avance si dispo.
    next: function () {
      var p = prefetched || fetchOne(3);
      prefetched = null;
      return p.catch(function () { return fetchOne(3); });
    },
    // Appelé pendant la lecture pour que l'enchaînement soit quasi instantané.
    prefetch: function () {
      if (!prefetched) { prefetched = fetchOne(3); prefetched.catch(function () { prefetched = null; }); }
    }
  };
})();
