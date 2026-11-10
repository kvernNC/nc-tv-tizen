# NC TV

Application pour **TV Samsung (Tizen)** et **Android TV / Google TV** (Chromecast avec
Google TV…) : le direct de **NC La 1ère** en plein écran, plus une trentaine de chaînes, une
mosaïque pour zapper et le programme en cours.

![Mosaïque](docs/mosaique.png)

## Chaînes

| N° | Chaîne |
|---|---|
| 1 | NC La 1ère |
| 2 à 5 | France 2, 3, 4, 5 |
| 6 | franceinfo |
| 7 | Taratata (prestations au hasard, en continu) |
| 8 | Arte |
| 9 | TV5 Monde |
| 10 | France 24 |
| 11 | JT NC La 1ère en replay : le dernier JT (19h30 ou 12h00), puis les précédents |
| 12 à 15 | Radios : NC La 1ère Radio, Radio Rythme Bleu, Radio Djiido, NIA Pacifique |
| 16 et + | TF1, LCP, TMC, TFX, Gulli, BFM TV, CNews, LCI, CStar, T18, NOVO19, TF1 Séries Films, L'Équipe, Sport en France, Le Figaro TV, Canal+ en clair, Public Sénat, Europe 1 TV… |

Les chaînes 16 et suivantes viennent de la playlist du projet
[ParaTV](https://github.com/Paradise-91/ParaTV) : si ce projet s'arrête, elles disparaissent.

## Télécommande

| Touche | Action |
|---|---|
| OK | Mosaïque des chaînes |
| CH+ / CH− / ◀ ▶ ▲ ▼ | Chaîne suivante / précédente |
| 0 à 9 | Aller à la chaîne n° (ex. 1 puis 6 → chaîne 16) |
| INFO | Chaîne, programme en cours et suivant |
| ⏩ / ▶❚❚ | Taratata : prestation suivante · JT : édition précédente |
| Sous-titres | Activer / désactiver les sous-titres (aussi dans la mosaïque, dernière case) |
| RETOUR | Quitter (ou fermer la mosaïque) |

Dans la mosaïque : flèches pour choisir, CH+/CH− pour changer de page, OK pour regarder.

Sur la télécommande de la Chromecast (sans touches chaînes ni chiffres) : ▲ ▼ pour zapper,
OK pour la mosaïque, RETOUR pour quitter.

## Installation sur TV Samsung

1. Télécharger **NC-TV.wgt** dans la dernière
   [release](https://github.com/kvernNC/nc-tv-tizen/releases/latest).
2. Mettre la TV en mode développeur (déjà fait si Moonlight est installé) :
   **Home → Apps**, taper **12345**, passer **Developer mode** sur **ON**, saisir l'IP du PC,
   puis redémarrer la TV.
3. Lancer [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) sur le PC, choisir
   son propre fichier `.wgt` → `NC-TV.wgt`, puis **Install**.

« NC TV » apparaît ensuite dans **Apps** sur la TV. Pour une mise à jour, refaire l'étape 3
avec la nouvelle version (depuis le même PC).

## Installation sur Android TV / Google TV

1. Activer les options développeur : **Paramètres → Système → À propos**, cliquer 7 fois
   sur **Build de l'OS Android TV**.
2. Installer l'app **Downloader** (AFTVnews) depuis le Play Store.
3. **Paramètres → Applications → Sécurité et restrictions → Sources inconnues** :
   autoriser **Downloader**.
4. Dans Downloader, saisir l'adresse
   `https://github.com/kvernNC/nc-tv-tizen/releases/latest/download/NC-TV.apk`,
   puis **Installer**.

« NC TV » apparaît dans **Vos applications**. Pour une mise à jour, refaire l'étape 4 :
la nouvelle version s'installe par-dessus l'ancienne.
