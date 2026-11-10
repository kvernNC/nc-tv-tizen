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
      else reject(new Error('HTTP ' + xhr.status + ' sur ' + url.split('?')[0]));
    };
    xhr.onerror = function () { reject(new Error('Erreur réseau sur ' + url.split('?')[0])); };
    xhr.ontimeout = function () { reject(new Error('Délai dépassé sur ' + url.split('?')[0])); };
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
        return signed;
      }); })
      .catch(function (e) { lastErr = e; console.log('[nctv] échec ' + raw + ' : ' + e.message); return next(); });
  }
  return next();
}

var CHANNELS = [
  {
    id: 'nc1ere',
    name: 'NC La 1ère',
    // Durée de vie du jeton ~6 h : on relance proprement avant expiration.
    refreshMs: 5 * 60 * 60 * 1000,
    // Plusieurs variantes, dans l'ordre de préférence. La version locale
    // (réservée au territoire) est essayée d'abord ; la version "monde"
    // sert de secours. La première qui répond est utilisée.
    candidates: [
      'https://simulcast-b.ftven.fr/simulcast/1er_Nouvelle_Caledonie/hls_1er_NC/1er_Nouvelle_Caledonie.m3u8',
      'https://simulcast-b.ftven.fr/simulcast/1er_Nouvelle_Caledonie/hls_nc_1er_NC/1er_Nouvelle_Caledonie.m3u8',
      'https://simulcast-b.ftven.fr/simulcast/1er_Nouvelle_Caledonie/hls_local_1er_NC/1er_Nouvelle_Caledonie.m3u8',
      'https://simulcast-b.ftven.fr/simulcast/1er_Nouvelle_Caledonie/hls_monde_1er_NC/1er_Nouvelle_Caledonie.m3u8'
    ],
    resolve: function () { return firstWorking(this.candidates); }
  },
  {
    id: 'caledonia',
    name: 'Caledonia',
    enabled: false, // À activer quand on connaîtra la source du direct (voir README).
    refreshMs: 0,
    resolve: function () {
      return Promise.reject(new Error('Source du direct Caledonia pas encore configurée'));
    }
  }
].filter(function (c) { return c.enabled !== false; });
