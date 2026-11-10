/*
 * Chaînes supplémentaires tirées de la playlist ParaTV (projet communautaire qui
 * régénère plusieurs fois par jour des liens signés sur GitHub).
 * Au démarrage, l'app télécharge la playlist et ajoute ses chaînes à la suite
 * des nôtres. Chaque fois qu'on lance une chaîne, on relit le fichier ParaTV :
 * on a donc toujours le dernier lien signé publié.
 */
var PARATV_PLAYLIST = 'https://raw.githubusercontent.com/Paradise-91/ParaTV/main/playlists/paratv/group/france/france.m3u';

// Chaînes ParaTV ignorées (déjà présentes dans l'app, ou pas voulues).
// Comparaison sur le nom simplifié : minuscules, sans accents ni espaces.
var PARATV_SKIP = ['france2', 'france3', 'france4', 'france5', 'arte', 'franceinfo'];

var ParaTV = (function () {
  function simplify(name) {
    return name.replace(/^\s*\d+\.\s*/, '').replace(/\[.*?\]/g, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function cleanName(name) {
    return name.replace(/^\s*\d+\.\s*/, '').replace(/\[.*?\]/g, '').trim();
  }

  // Analyse le .m3u : [{ name, key, chno, sources: [{ url, ua }] }]
  function parse(m3u) {
    var lines = m3u.split(/\r?\n/), byKey = {}, list = [], cur = null, ua = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l.indexOf('#EXTINF') === 0) {
        var name = l.substring(l.lastIndexOf(',') + 1);
        var chno = /tvg-chno="(\d+)"/.exec(l);
        cur = { name: cleanName(name), key: simplify(name), chno: chno ? +chno[1] : 999 };
        ua = null;
      } else if (l.indexOf('#EXTVLCOPT:http-user-agent=') === 0) {
        ua = l.split('=').slice(1).join('=');
      } else if (l && l[0] !== '#' && cur) {
        if (PARATV_SKIP.indexOf(cur.key) < 0) {
          if (!byKey[cur.key]) { byKey[cur.key] = { name: cur.name, chno: cur.chno, sources: [] }; list.push(byKey[cur.key]); }
          byKey[cur.key].sources.push({ url: l, ua: ua });
          byKey[cur.key].chno = Math.min(byKey[cur.key].chno, cur.chno);
        }
        cur = null;
      }
    }
    return list.sort(function (a, b) { return a.chno - b.chno; });
  }

  // Une source est bonne si sa playlist ET la première sous-playlist répondent.
  function check(src) {
    var url = src.url + (src.url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(); // évite le cache
    return httpGetText(url).then(function (m3u) {
      var first = m3u.split(/\r?\n/).filter(function (l) { return l && l[0] !== '#'; })[0];
      if (!first) throw new Error('lien expiré ou vide');
      if (!/^https?:/.test(first)) return src;  // chemins relatifs : on fait confiance
      return httpGetText(first).then(function () { return src; });
    });
  }

  function firstSource(sources) {
    var i = 0, lastErr = null;
    function next() {
      if (i >= sources.length) return Promise.reject(lastErr || new Error('aucune source'));
      var s = sources[i++];
      return check(s).catch(function (e) { lastErr = e; return next(); });
    }
    return next();
  }

  return {
    // Renvoie (Promise) des chaînes au format de l'app.
    load: function () {
      return httpGetText(PARATV_PLAYLIST + '?t=' + Date.now()).then(function (m3u) {
        return parse(m3u).map(function (c) {
          return {
            name: c.name,
            refreshMs: 0, // en cas d'expiration : erreur -> nouvel essai -> lien frais relu
            resolve: function () {
              return firstSource(c.sources).then(function (s) { return { url: s.url, ua: s.ua }; });
            }
          };
        });
      });
    },
    _parse: parse
  };
})();
