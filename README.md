# NC TV — direct NC La 1ère sur TV Samsung (Tizen)

Une application Tizen qui ouvre directement le direct de **NC La 1ère** en plein écran,
sans passer par le site web.

## Comment ça marche

1. L'app demande au service de jeton de France TV (`hdfauth.ftven.fr/esi/TA`) de signer
   l'URL du flux (même principe que catchuptvandmore).
2. Elle essaie d'abord les variantes **locales** du flux (réservées au territoire),
   puis la variante **« monde »** (`hls_monde_1er_NC`, testée et fonctionnelle) en secours.
3. Le flux HLS (jusqu'en 1080p, chiffré AES-128 avec une clé publique) est lu par le
   lecteur natif Samsung (AVPlay).
4. Le jeton dure environ 6 h : l'app relance le flux toutes les 5 h. En cas de coupure,
   elle réessaie toute seule (3 s, 6 s, 12 s… jusqu'à 60 s).

## Télécommande

| Touche | Action |
|---|---|
| CH+ / CH− / ◀ ▶ ▲ ▼ | Chaîne suivante/précédente (quand Caledonia sera ajoutée) |
| OK / INFO | Affiche le nom de la chaîne |
| RETOUR / EXIT | Quitter |

## Tester depuis ton PC

```
python3 tools/test_stream.py
```
Ce script liste les variantes qui répondent depuis chez toi et donne une URL à coller dans
VLC. **Si une variante locale répond `[OK ]`, dis-le-moi** : c'est celle que l'app utilisera.

## Installer sur la TV (Tizen Studio / CLI)

Prérequis : TV en mode développeur (Apps → taper 12345 → Developer mode ON, IP de ton PC),
et un profil de certificat Samsung (le même que pour Moonlight convient).

```
tizen build-web -- .
tizen package -t wgt -s <ton_profil_certificat> -- .buildResult
sdb connect <IP_TV>
tizen install -n "NC TV.wgt" -- .buildResult
```

## Caledonia

Pas encore active (`enabled: false` dans `js/channels.js`) : le site caledonia.nc refuse les
connexions depuis l'extérieur, je n'ai pas pu voir comment le direct est diffusé.
Pour l'ajouter, il me faut, depuis la Calédonie : la page du direct ouverte dans Chrome →
F12 → onglet **Réseau** → filtre `m3u8` → l'URL qui apparaît (et l'en-tête de la page
si un jeton est visible).
