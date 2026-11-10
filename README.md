# NC TV — direct NC La 1ère sur TV Samsung (Tizen)

Une application Tizen qui ouvre directement le direct de **NC La 1ère** en plein écran,
sans passer par le site web, avec quelques chaînes France TV et une chaîne Taratata en plus.

## Chaînes

| N° | Chaîne | État |
|---|---|---|
| 1 | NC La 1ère | ✅ vérifiée (version « monde » ; versions locales essayées d'abord) |
| 2 | franceinfo | ✅ vérifiée |
| 3 | TV5 Monde | ✅ vérifiée |
| 4 | France 24 | ❓ refusée depuis l'étranger, à tester depuis la Calédonie |
| 5 | Arte | ❓ idem |
| 6 | Réunion La 1ère | ❓ idem |
| 7 | Taratata | ✅ vérifiée : prestations au hasard de mytaratata.com (1994 → aujourd'hui), enchaînées en continu, jusqu'en 720p |

La chaîne Taratata choisit une émission au hasard, puis une prestation (sans les interviews),
affiche l'artiste et le titre, et prépare la suivante pendant la lecture. Les vidéos sont
hébergées par mytaratata.com sur le serveur `media.grandprix.tv` (malgré le nom, c'est bien
leur hébergeur vidéo), avec le MP4 de `videos.mytaratata.com` en secours.

**Ajouter une chaîne** : une ligne `{ name, urls }` dans `CHANNEL_LIST` (`js/channels.js`).
Ça ne marche que pour les chaînes servies en « simulcast » par France TV (pas France 2/3/5,
qui passent par un système de pubs dynamiques). Pour **retirer** une chaîne qui ne
marche pas chez toi, supprimer sa ligne. Puis refaire le `.wgt` (voir plus bas).

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
| CH+ / CH− / ◀ ▶ ▲ ▼ | Chaîne suivante/précédente |
| 1 à 9 | Aller directement à la chaîne n° |
| ⏩ / ▶❚❚ | Taratata : passer à la prestation suivante |
| OK / INFO | Affiche le nom de la chaîne |
| RETOUR / EXIT | Quitter |

## Tester depuis ton PC

```
python3 tools/test_stream.py
```
Ce script teste chaque chaîne de `js/channels.js` depuis chez toi (`[OK ]` / `[NON]`) et
donne une URL à coller dans VLC. Si une version locale de NC La 1ère répond `[OK ]`, l'app
l'utilisera automatiquement.

## Installer sur la TV avec Apps2Samsung (recommandé)

[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) crée le certificat et signe
l'application tout seul : il suffit de lui donner le fichier `.wgt` **non signé**.

### 1. Fabriquer le fichier `.wgt`

```
python3 tools/build_wgt.py
```
→ crée `dist/NC-TV.wgt` (une simple archive des fichiers de l'app). Le relancer après
chaque modification du code.

### 2. Mode développeur sur la TV (déjà fait si Moonlight est installé)

1. Bouton **Home** → **Apps**.
2. Taper **12345** à la télécommande (ou sur le clavier à l'écran).
3. Passer **Developer mode** sur **ON** et saisir l'**adresse IP locale du PC**
   (Windows : `ipconfig` → « Adresse IPv4 » ; Linux/Mac : `ip addr` / `ifconfig`).
4. Redémarrer la TV. Si le PC ne la trouve pas ensuite : débrancher la TV 15 s puis rebrancher.

PC et TV doivent être sur le même réseau. Si l'IP du PC a changé depuis l'installation de
Moonlight, mets à jour l'IP dans le mode développeur.

### 3. Installer

1. Lancer Apps2Samsung sur le PC ; il détecte la TV.
2. Au lieu d'une app du catalogue, **choisir ton propre fichier `.wgt`** →
   sélectionner `dist/NC-TV.wgt`.
3. Choisir la TV, puis **Install**. Apps2Samsung réutilise le certificat (et la connexion
   au compte Samsung) déjà utilisés pour Moonlight.
4. « NC TV » apparaît dans **Apps** sur la TV.

Variante en ligne de commande (sans interface) :
```
apps2samsung-cli sign dist/NC-TV.wgt -o dist/NC-TV-signed.wgt --tv <IP_TV>
```
(signe seulement ; à installer ensuite avec `tizen install` ou `sdb`.)

### Mettre à jour l'app

Refaire `python3 tools/build_wgt.py`, puis réinstaller avec Apps2Samsung **sur le même PC**
(même certificat). Si la TV refuse la mise à jour pour cause de certificat différent,
désinstaller « NC TV » sur la TV puis réinstaller.

## Installer avec Tizen Studio / CLI (alternative)

Avec un profil de certificat Samsung existant :

```
tizen build-web -- .
tizen package -t wgt -s <ton_profil_certificat> -- .buildResult
sdb connect <IP_TV>
tizen install -n "NC TV.wgt" -- .buildResult
```
