# Guide d'Installation Mobile - Openvote

Ce document décrit les étapes nécessaires pour compiler, configurer et exécuter l'application mobile Openvote.

## Prérequis

- **Flutter SDK** : Version stable récente (>= 3.0.0).
- **Dart SDK** : Inclus avec Flutter.
- **Environnement de développement** : VS Code, Android Studio, ou IntelliJ avec les plugins Flutter/Dart installés.
- **Appareil/Émulateur** : Android ou iOS.

## Installation

1. **Naviguer dans le dossier mobile** :
   ```bash
   cd mobile
   ```

2. **Installer les dépendances** :
   ```bash
   flutter pub get
   ```
   Cela installera notamment `sqflite_sqlcipher` pour la base de données chiffrée.

## Configuration de la Sécurité

### Chiffrement Local (SQLCipher)
L'application utilise une base de données SQLite chiffrée par SQLCipher. 
Aucune configuration de clé statique n'est requise dans le code source (`AndroidManifest` ou autre) car le mot de passe est demandé à l'utilisateur à chaque démarrage de session "réelle" (après le mode camouflage).

### Fonctionnalités de Sécurité Intégrées
- **Mode Camouflage (Leurre)** :
  - L'application démarre sur une fausse calculatrice.
  - **Code d'accès** : Tapez `123+456=` pour accéder à l'écran de login.
- **Duress PIN (Code de Détresse)** :
  - Sur l'écran de login/déverrouillage DB, si vous entrez le code `0000`, **toutes les données locales sont instantanément supprimées**.
- **Obfuscation SMS** :
  - Utilitaire `EncodingHelper` intégré pour masquer les données JSON dans des messages anodins.

## Compilation et Exécution

### Lancer en mode Debug
```bash
flutter run
```

### Créer un APK (Android)
```bash
flutter build apk --release
```
L'APK se trouvera dans `build/app/outputs/flutter-apk/app-release.apk`.

### Créer une archive iOS (Nécessite Xcode)
```bash
flutter build ios --release
```

## Dépannage

- **Erreur SQLCipher** : Si vous rencontrez des problèmes liés à `sqlcipher`, assurez-vous que votre configuration Android (`android/app/build.gradle`) ou Podfile (iOS) est compatible. Généralement, `flutter pub get` gère cela automatiquement.
- **Wipe d'urgence** : Si vous avez déclenché le code `0000` par erreur, les données sont perdues définitivement. Il faut recréer un compte ou réinitialiser la base de données locale.
