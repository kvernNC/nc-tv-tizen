/*
 * Programme en cours, affiché dans le bandeau.
 *  - epg: { sfr: '4' }                -> guide SFR TV (un JSON par jour, ~1,4 Mo compressé)
 *  - epg: { la1ere: 'nouvellecaledonie' } -> page "direct TV" de la1ere.franceinfo.fr
 * Epg.now(ch) renvoie une Promise de { title, subtitle, start, end } (dates en ms) ou null.
 */
var Epg = (function () {
  var SFR_URL = 'https://static-cdn.tv.sfr.net/data/epg/gen8/guide_web_';
  var sfrDays = {};      // 'AAAAMMJJ' -> Promise<{ id: [programmes allégés] }>
  var la1ereCache = {};  // région -> { until, slots }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Heure de Paris sans dépendre d'Intl (absent des vieux Tizen) :
  // heure d'été du dernier dimanche de mars 1h UTC au dernier dimanche d'octobre 1h UTC.
  function lastSunday(year, month) { // month 0-11, renvoie le jour du mois
    var d = new Date(Date.UTC(year, month + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
  }
  function parisDayKey(ms) {
    var y = new Date(ms).getUTCFullYear();
    var start = Date.UTC(y, 2, lastSunday(y, 2), 1), end = Date.UTC(y, 9, lastSunday(y, 9), 1);
    var p = new Date(ms + (ms >= start && ms < end ? 2 : 1) * 3600000);
    return p.getUTCFullYear() + pad(p.getUTCMonth() + 1) + pad(p.getUTCDate());
  }

  function loadSfrDay(key) {
    if (!sfrDays[key]) {
      sfrDays[key] = httpGetText(SFR_URL + key + '.json', 30000).then(function (txt) {
        var all = JSON.parse(txt).epg || {}, out = {};
        // On ne garde que les champs utiles (mémoire de la TV).
        for (var id in all) {
          out[id] = (all[id] || []).map(function (p) {
            var sub = p.subTitle || '';
            if (p.seasonNumber || p.episodeNumber) {
              sub = (p.seasonNumber ? 'S' + p.seasonNumber : '') + (p.episodeNumber ? 'E' + p.episodeNumber : '') + (sub ? ' · ' + sub : '');
            }
            var img = null, imgs = p.images || [];
            for (var k = 0; k < imgs.length && !img; k++) if (imgs[k].type === 'landscape' && !imgs[k].withTitle) img = imgs[k].url;
            for (k = 0; k < imgs.length && !img; k++) if (imgs[k].type === 'landscape') img = imgs[k].url;
            if (img) img = img.replace(/^http:/, 'https:') + '?w=480';
            return { title: p.title, subtitle: sub, start: p.startDate, end: p.endDate, image: img };
          });
        }
        return out;
      });
      sfrDays[key].catch(function () { delete sfrDays[key]; }); // on réessaiera plus tard
    }
    return sfrDays[key];
  }

  function findAt(list, t) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].start <= t && t < list[i].end) return list[i];
    return null;
  }

  function sfrNow(id) {
    var t = Date.now();
    return loadSfrDay(parisDayKey(t)).then(function (day) {
      var p = findAt(day[id], t);
      if (p) return p;
      // Programme commencé la veille (autour de minuit à Paris).
      return loadSfrDay(parisDayKey(t - 6 * 3600000)).then(function (prev) { return findAt(prev[id], t); });
    });
  }

  function unescapeJs(s) {
    return s.replace(/\\u([0-9a-fA-F]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
            .replace(/\\(.)/g, '$1');
  }

  function la1ereNow(region) {
    var t = Date.now(), c = la1ereCache[region];
    var fromCache = c && t < c.until ? Promise.resolve(c.slots) :
      httpGetText('https://la1ere.franceinfo.fr/' + region + '/direct-tv.html').then(function (html) {
        var slots = [], re = /beginDate:"([^"]+)",endDate:"([^"]+)"/g, m;
        while ((m = re.exec(html))) {
          var ctx = html.substring(Math.max(0, m.index - 2500), m.index);
          var progs = ctx.match(/programLabel:"((?:[^"\\]|\\.)*)"/g);
          var prog = progs && /programLabel:"(.*)"/.exec(progs[progs.length - 1]);
          var lab = ctx.match(/[,{]label:"((?:[^"\\]|\\.)*)"/g);
          slots.push({
            title: prog ? unescapeJs(prog[1]).trim() : '',
            subtitle: lab ? unescapeJs(lab[lab.length - 1].replace(/^[,{]label:"|"$/g, '')) : '',
            start: Date.parse(m[1]), end: Date.parse(m[2])
          });
        }
        la1ereCache[region] = { until: t + 5 * 60000, slots: slots };
        return slots;
      });
    return fromCache.then(function (slots) {
      var p = findAt(slots, t);
      if (p && p.subtitle && /^(Émission|Épisode) du /.test(p.subtitle)) p.subtitle = ''; // sans intérêt
      return p;
    });
  }

  return {
    now: function (ch) {
      if (!ch || !ch.epg) return Promise.resolve(null);
      var p = ch.epg.sfr ? sfrNow(ch.epg.sfr) : ch.epg.la1ere ? la1ereNow(ch.epg.la1ere) : Promise.resolve(null);
      return p.catch(function (e) { console.log('[nctv] guide indisponible : ' + e.message); return null; });
    },
    // Heure locale de la TV, ex. "20:10"
    hhmm: function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    _parisDayKey: parisDayKey
  };
})();
