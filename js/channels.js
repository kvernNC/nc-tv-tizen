/*
 * Liste des chaînes. Chaque chaîne a une fonction resolve() qui renvoie
 * (via une Promise) une URL HLS directement lisible par le lecteur.
 *
 * NC La 1ère : flux "simulcast" de France TV. L'URL de base est fixe ; on la
 * fait signer par le service de jeton hdfauth (même principe que
 * catchuptvandmore). Le jeton dans le chemin reste valable ~6 h.
 * Le flux est chiffré en AES-128 avec une clé publique (géré nativement par AVPlay).
 */
var FTV_TOKEN_URL = 'https://hdfauth.ftven.fr/esi/TA';

function httpGetText(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs || 15000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else reject(new Error('indisponible (HTTP ' + xhr.status + ')'));
    };
    xhr.onerror = function () { reject(new Error('erreur réseau')); };
    xhr.ontimeout = function () { reject(new Error('délai dépassé')); };
    xhr.send();
  });
}

function signFranceTv(rawUrl) {
  var url = FTV_TOKEN_URL + '?format=json&url=' + encodeURIComponent(rawUrl);
  return httpGetText(url).then(function (txt) {
    var signed = JSON.parse(txt).url;
    if (!signed) throw new Error('Réponse du service de jeton invalide');
    return signed;
  });
}

// Signe chaque URL candidate et garde la première dont la playlist répond 200.
function firstWorking(candidates) {
  var i = 0, lastErr = null;
  function next() {
    if (i >= candidates.length) return Promise.reject(lastErr || new Error('Aucun flux disponible'));
    var raw = candidates[i++];
    return signFranceTv(raw)
      .then(function (signed) { return httpGetText(signed, 10000).then(function () {
        console.log('[nctv] flux retenu : ' + raw);
        return { raw: raw, signed: signed };
      }); })
      .catch(function (e) { lastErr = e; console.log('[nctv] échec ' + raw + ' : ' + e.message); return next(); });
  }
  return next();
}

/*
 * AJOUTER UNE CHAÎNE : une ligne { name, urls }.
 * - urls : une ou plusieurs adresses "simulcast" France TV NON signées, par ordre
 *   de préférence ; l'app signe et prend la première qui répond.
 * - Le script tools/test_stream.py lit cette même liste pour tester chaque chaîne.
 * Seules les chaînes servies par les serveurs "simulcast" marchent avec ce principe
 * (pas France 2/3/5, qui passent par un système de pubs dynamiques).
 */
var SIMULCAST = 'https://simulcast-b.ftven.fr/simulcast/';
var SIMULCAST_P = 'https://simulcast-p.ftven.fr/simulcast/';
var SIMULCAST_MEDIAS = 'https://simulcast-frmedias-p.ftven.fr/simulcast/';

var CHANNEL_LIST = [
  { name: 'NC La 1ère', epg: { la1ere: 'nouvellecaledonie' }, urls: [
      SIMULCAST + '1er_Nouvelle_Caledonie/hls_1er_NC/1er_Nouvelle_Caledonie.m3u8',        // locale (devinée)
      SIMULCAST + '1er_Nouvelle_Caledonie/hls_nc_1er_NC/1er_Nouvelle_Caledonie.m3u8',     // locale (devinée)
      SIMULCAST + '1er_Nouvelle_Caledonie/hls_local_1er_NC/1er_Nouvelle_Caledonie.m3u8',  // locale (devinée)
      SIMULCAST + '1er_Nouvelle_Caledonie/hls_monde_1er_NC/1er_Nouvelle_Caledonie.m3u8'   // monde (vérifiée)
  ] },
  { name: 'France 2',        epg: { sfr: '4' },    urls: [SIMULCAST_P + 'France_2/hls_fr2/France_2.m3u8'] },                // vérifiée depuis la Calédonie
  { name: 'France 3',        epg: { sfr: '80' },   urls: [SIMULCAST_P + 'France_3/hls_fr3/France_3.m3u8'] },                // vérifiée
  { name: 'France 4',        epg: { sfr: '78' },   urls: [SIMULCAST_P + 'France_4/hls_fr4/France_4.m3u8'] },                // vérifiée
  { name: 'France 5',        epg: { sfr: '47' },   urls: [SIMULCAST_P + 'France_5/hls_fr5/France_5.m3u8'] },                // vérifiée
  { name: 'franceinfo',      epg: { sfr: '2111' }, urls: [SIMULCAST_P + 'France_Info/hls_monde_frinfo/France_Info.m3u8'] }, // vérifiée
  { name: 'Taratata', taratata: true },  // prestations au hasard (voir js/taratata.js)
  { name: 'Arte',            epg: { sfr: '111' },  urls: [SIMULCAST_MEDIAS + 'Arte/hls_arte/Arte.m3u8'] },                  // vérifiée
  { name: 'TV5 Monde',       epg: { sfr: '205' },  urls: [SIMULCAST_MEDIAS + 'TV5_Monde/hls_tv5_monde/TV5_Monde.m3u8'] },   // vérifiée
  { name: 'France 24',       epg: { sfr: '529' },  urls: [SIMULCAST_MEDIAS + 'France_24/hls_fr24/France_24.m3u8'] }         // vérifiée
];

// Jeton valable ~6 h : relance propre toutes les 5 h.
var CHANNELS = CHANNEL_LIST.map(function (c) {
  if (c.taratata) return {
    name: 'Taratata',
    continuous: true,
    resolve: function () { return Taratata.next(); },
    prefetch: function () { Taratata.prefetch(); }
  };
  return {
    name: c.name,
    epg: c.epg,
    refreshMs: 5 * 60 * 60 * 1000,
    resolve: function () {
      // On essaie d'abord l'adresse qui a marché la dernière fois (zapping plus rapide).
      var order = c.best ? [c.best].concat(c.urls.filter(function (u) { return u !== c.best; })) : c.urls;
      return firstWorking(order).then(function (r) { c.best = r.raw; return r.signed; });
    }
  };
});
