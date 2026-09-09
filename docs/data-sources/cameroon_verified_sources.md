# Sources verifiees pour peupler la base Cameroun

Derniere verification web: 2026-09-09.

Objectif: peupler la base OpenVote avec des donnees traçables sur la population, le decoupage territorial, les elections anterieures et les textes legaux. Chaque import devrait conserver au minimum: organisme, titre du document, URL, date de publication/edition, date de consultation, type de donnee, granularite, annee de reference, niveau de confiance.

## Niveaux de confiance proposes

- `official`: source primaire publique provenant d'une institution competente: BUCREP, INS, ELECAM, Presidence, Assemblee Nationale, Conseil Constitutionnel.
- `official_estimate`: source officielle mais donnee estimee/projetee, pas un recensement brut.
- `secondary_check`: source non primaire utile pour recouper ou localiser un document, mais pas comme source de verite en base.
- `unverified`: document sans provenance institutionnelle claire, a exclure des imports automatiques.

## Population et geographie

### BUCREP - publications officielles

- URL: https://bucrep.org/publications/
- Organisme: Bureau Central des Recensements et des Etudes de Population.
- Documents pertinents:
  - `Rapport de Presentation des Resultats du 3e RGPH`
  - `Atlas du 3e RGPH`
  - `La Population du Cameroun en 2010`
  - `Projections Demographiques (2015)`
  - `Projections Demographiques (2023)`
- Usage conseille:
  - Recensement 2005: base historique stable pour regions/departements.
  - Projections 2023: population recente par region, departement et commune/arrondissement quand disponible.
- Niveau: `official` pour RGPH 2005, `official_estimate` pour projections.

### ANADOC / INS - catalogue du RGPH 2005

- URL: https://stat.cm/nada/index.php/catalog/89
- Organisme: Archive Nationale des Donnees du Cameroun / INS.
- Document: `CAMEROUN - Recensement General de la Population et de l'Habitat (2005)`.
- Documents telechargeables mentionnes:
  - `Etat et structures de la population`
  - `Indicateurs Etat et structures de la population`
  - questionnaires et documentation technique.
- Usage conseille:
  - Source de verification pour les chiffres RGPH 2005.
  - Source metadata fiable: producteur, version, dates, documentation.
- Niveau: `official`.

### INS Cameroun - annuaires statistiques regionaux

- URL principale: https://ins-cameroun.cm/
- Exemple Centre 2024: https://ins-cameroun.cm/statistique/annuaire-statistique-2024-de-la-region-du-centre/
- Exemple Centre edition 2025: https://ins-cameroun.cm/statistique/annuaire-statistique-de-la-region-du-centre-edition-2025/
- Usage conseille:
  - Valider les chiffres regionaux recents.
  - Extraire contexte administratif: nombre de departements, arrondissements, communes.
  - Ne pas supposer que toutes les regions ont la meme annee d'edition disponible.
- Niveau: `official` ou `official_estimate` selon le tableau.

## Elections anterieures

### ELECAM - documentation officielle

- URL FR: https://portail.elecam.cm/fr/documentation/
- URL EN: https://portail.elecam.cm/en/documentation-2/
- Organisme: Elections Cameroon.
- Documents pertinents:
  - `Rapport Election Presidentielle de 2018`
  - `Rapport general sur le deroulement de l'election presidentielle du 09 octobre 2011`
  - `Rapport general sur le deroulement du double scrutin legislatif et municipal du 30 septembre 2013`
  - `General report on the conduct of the February 9, 2020 twin legislative and municipal election`
  - `General report on conduct of the 12 March 2023 election of senators`
  - listes de bureaux de vote pour la presidentielle 2025 par region.
- Usage conseille:
  - Importer les elections, dates, types de scrutin, candidats/listes, bureaux de vote et indicateurs disponibles.
  - Marquer les resultats definitifs comme `official` seulement si le document les proclame officiellement ou s'il renvoie au Conseil Constitutionnel.
- Niveau: `official`.

### ELECAM - presidentielle 2018

- URL: https://portail.elecam.cm/download/rapport-election-presidentielle-de-2018/
- Usage conseille:
  - Document prioritaire pour importer la presidentielle 2018.
  - A croiser avec la decision de proclamation du Conseil Constitutionnel si disponible.
- Niveau: `official`.

### Presidence - convocation presidentielle 2025

- URL FR: https://prc.cm/fr/actualites/actes/decrets/7865-decret-n-2025-305-du-11-juillet-2025-portant-convocation-du-corps-electoral-en-vue-de-l-election-du-president-de-la-republique
- URL EN: https://www.prc.cm/en/news/the-acts/decrees/7864-decree-no-2025-305-of-11-july-2025-convening-the-electorate-for-the-election-of-the-president-of-the-republic
- Document: decret no 2025/305 du 11 juillet 2025.
- Usage conseille:
  - Creer l'evenement electoral presidentiel du 12 octobre 2025 avec source officielle.
- Niveau: `official`.

### Ministere de la Communication - presidentielle 2025

- URL: https://www.mincom.gov.cm/presidentielle-2025/
- Usage conseille:
  - Source institutionnelle de contexte et communiques.
  - Ne remplace pas la proclamation du Conseil Constitutionnel pour les resultats definitifs.
- Niveau: `official` pour les communiques, mais source secondaire pour les resultats electoraux.

## Textes legaux

### Presidence de la Republique - lois

- Code electoral modifie en 2026:
  - FR: https://prc.cm/fr/actualites/actes/lois/8245-loi-n-2026-003-du-14-avril-2026-modifiant-et-completant-certaines-dispositions-de-la-loi-n-2012-001-du-19-avril-2012-portant-code-electoral
  - EN: https://prc.cm/en/news/the-acts/laws/8242-law-no-2026-003-of-14-april-2026-to-amend-and-supplement-some-provisions-of-law-no-2012-001-of-19-april-2012-relating-to-the-electoral-code
- Liste generale des lois:
  - EN: https://www.prc.cm/en/news/the-acts/laws
- Usage conseille:
  - Source prioritaire pour les lois promulguees et modifications recentes.
  - Importer le PDF, le texte brut extrait, et la version linguistique.
- Niveau: `official`.

### Assemblee Nationale - instruments juridiques

- URL: https://www.assnat.cm/index.php/fr/national-assembly/governing-instrument
- Documents pertinents:
  - Constitution.
  - Reglement interieur de l'Assemblee Nationale.
  - Code electoral.
- Usage conseille:
  - Source complementaire pour textes structurants.
  - Utile pour verifier les versions historiques ou parlementaires.
- Niveau: `official`.

### ELECAM - textes et lois

- URL: https://portail.elecam.cm/fr/documentation/
- Documents pertinents:
  - `CODE ELECTORAL`
  - decrets de convocation.
  - resolutions de candidatures.
  - decisions sur format des bulletins et affiches.
- Usage conseille:
  - Source prioritaire pour documents operationnels electoraux.
  - Croiser les lois promulguees avec la Presidence.
- Niveau: `official`.

## Sources a eviter comme source de verite

- Scribd, Doczz, blogs et agregateurs: utiles pour retrouver un document manquant, mais a exclure des imports officiels sauf si le PDF contient une provenance institutionnelle verifiable et qu'il est ensuite recoupe avec une source primaire.
- Presse generaliste: utile pour chronologie et contexte, pas pour chiffres officiels en base.
- Wikipedia/Wikidata: utile pour controles de coherence, pas pour importer des chiffres sensibles.

## Strategie d'import recommandee

1. Creer une table ou enrichir `data_imports` avec `source_url`, `document_title`, `publisher`, `published_at`, `retrieved_at`, `checksum`, `license_or_terms`, `granularity`, `confidence`.
2. Telecharger les PDF officiels dans un dossier versionne hors base ou stockage objet, calculer un SHA-256, puis extraire les tables.
3. Pour la population, separer `census` et `projection`: un chiffre 2023 ne doit pas etre presente comme recensement.
4. Pour les elections, distinguer `organisation_report`, `proclamation_results`, `polling_stations`, `candidate_resolution`.
5. Garder les valeurs estimees actuelles, mais les etiqueter explicitement `estimated` jusqu'a remplacement par une table officielle.
6. Ajouter un rapport de validation par import: lignes importees, lignes ignorees, anomalies, totaux compares au document.

## Priorites concretes

1. Population: BUCREP `Projections Demographiques (2023)` + ANADOC RGPH 2005.
2. Bureaux de vote et inscrits 2025: ELECAM, listes BV par region et fichier electoral.
3. Elections anterieures: rapports ELECAM 2011, 2013, 2018, 2020, 2023.
4. Textes: Code electoral ELECAM + loi no 2026/003 sur le site de la Presidence + decrets/resolutions 2025.
