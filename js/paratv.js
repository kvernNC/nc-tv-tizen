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
var PARATV_SKIP = ['france2', 'france3', 'france4', 'france5', 'arte', 'franceinfo',
                   'rmcstory', 'rmcdecouverte', 'canal32']; // ne marchent pas depuis la Calédonie

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
        var chno = /tvg-chno="(\d+)"/.exec(l), sfr = /epg-s="(\d+)"/.exec(l), logo = /tvg-logo="([^"]+)"/.exec(l);
        cur = { name: cleanName(name), key: simplify(name), chno: chno ? +chno[1] : 999, sfr: sfr && sfr[1], logo: logo && logo[1] };
        ua = null;
      } else if (l.indexOf('#EXTVLCOPT:http-user-agent=') === 0) {
        ua = l.split('=').slice(1).join('=');
      } else if (l && l[0] !== '#' && cur) {
        if (PARATV_SKIP.indexOf(cur.key) < 0) {
          if (!byKey[cur.key]) { byKey[cur.key] = { name: cur.name, chno: cur.chno, sfr: cur.sfr, logo: cur.logo, sources: [] }; list.push(byKey[cur.key]); }
          if (!byKey[cur.key].sfr) byKey[cur.key].sfr = cur.sfr;
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

  // ParaTV renomme ses fichiers à chaque mise à jour (TF1, TMC, LCI... toutes les ~4 h) :
  // on garde une fiche par chaîne et on remplace ses adresses quand on relit la playlist.
  var entries = {};      // clé -> { name, logo, sfr, sources }
  var lastLoad = 0, pending = null;

  function makeChannel(key) {
    var e = entries[key];
    return {
      name: e.name,
      logo: e.logo,
      epg: e.sfr ? { sfr: e.sfr } : null,
      refreshMs: 0, // en cas d'expiration : erreur -> nouvel essai -> lien frais relu
      resolve: function () {
        function attempt() {
          return firstSource(entries[key].sources).then(function (s) { return { url: s.url, ua: s.ua }; });
        }
        // Lien mort ou expiré : on relit la playlist ParaTV (nouveaux noms de fichiers) et on réessaie.
        return attempt().catch(function () {
          console.log('[nctv] ' + e.name + ' : lien ParaTV périmé, mise à jour de la playlist');
          return refresh(true).then(attempt);
        });
      }
    };
  }

  // Relit la playlist ; renvoie les chaînes NOUVELLES (à ajouter dans l'app).
  function refresh(force) {
    if (pending) return pending;
    if (!force && Date.now() - lastLoad < 60000) return Promise.resolve([]);
    pending = httpGetText(PARATV_PLAYLIST + '?t=' + Date.now()).then(function (m3u) {
      var added = [];
      parse(m3u).forEach(function (c) {
        var key = simplify(c.name);
        if (entries[key]) {
          entries[key].sources = c.sources;       // nouvelles adresses
          entries[key].logo = entries[key].logo || c.logo;
          entries[key].sfr = entries[key].sfr || c.sfr;
        } else {
          entries[key] = { name: c.name, logo: c.logo, sfr: c.sfr, sources: c.sources };
          added.push(makeChannel(key));
        }
      });
      lastLoad = Date.now();
      pending = null;
      return added;
    }, function (err) { pending = null; throw err; });
    return pending;
  }

  return {
    // Premier chargement : toutes les chaînes ParaTV, au format de l'app.
    load: function () { return refresh(true); },
    // Rafraîchissement (veille, minuterie) : renvoie les chaînes apparues entre-temps.
    refresh: function () { return refresh(true); },
    age: function () { return lastLoad ? Date.now() - lastLoad : Infinity; },
    _parse: parse
  };
})();
