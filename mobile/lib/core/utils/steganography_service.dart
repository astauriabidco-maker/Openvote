import 'dart:math';

class SteganographyService {
  static final List<String> _templates = [
    "Salut [NOM], voici le code pour la réunion : [PAYLOAD]",
    "Code de validation pour ta commande : [PAYLOAD]. Ne partage pas ce code.",
    "J'ai bien reçu le colis réf [PAYLOAD], merci.",
    "Votre rendez-vous est confirmé. Réf: [PAYLOAD]. Merci de votre ponctualité.",
    "Confirmation de transfert: [PAYLOAD]. Montant: 5000 XAF.",
  ];

  static final List<String> _names = ["Musa", "Kofi", "Amadou", "Fatou", "Jean", "Abou", "Bakary"];

  /// Masque le payload dans un template aléatoire.
  static String mask(String payload) {
    final random = Random();
    final template = _templates[random.nextInt(_templates.length)];
    final name = _names[random.nextInt(_names.length)];

    return template
        .replaceAll("[NOM]", name)
        .replaceAll("[PAYLOAD]", payload);
  }
}
