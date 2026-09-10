# Ontologie Openvote

Cette ontologie décrit le vocabulaire applicatif stable d'Openvote: scrutins, territoire, opérations terrain, preuves de PV, audit et publication publique vérifiable.

La source canonique est `openvote-ontology.v1.yaml`.

## Objectif

L'ontologie sert à stabiliser les concepts du projet avant qu'ils soient dispersés entre base de données, API, mobile, dashboard et export public.

Elle documente:

- les entités principales;
- leurs relations;
- les statuts et vocabulaires contrôlés;
- le niveau de sensibilité des données;
- ce qui peut être publié dans l'export citoyen;
- les preuves cryptographiques associées aux PV.

## Ce Que Ce N'Est Pas Encore

Ce fichier n'est pas une ontologie RDF/OWL complète. C'est une ontologie applicative versionnée, lisible par humains et testable en CI. Un mapping RDF/JSON-LD pourra venir plus tard.

## Domaines

L'ontologie v1 est organisée en six domaines:

- `election`: scrutins, candidats, résultats, résultats historiques.
- `territory`: régions, départements, arrondissements, bureaux de vote.
- `field_ops`: observateurs, affectations, couverture terrain.
- `pv`: PV soumis et résultats par candidat.
- `proof`: photos, hashes, signatures, manifestes, exports publics.
- `audit`: événements, anomalies, scores régionaux, snapshots.

## Maintenance

Toute nouvelle table, API publique ou preuve cryptographique doit vérifier si elle introduit:

- une nouvelle entité;
- une nouvelle relation;
- un nouveau statut;
- un champ publiable;
- un champ sensible;
- une règle d'audit.

Si oui, l'ontologie doit être mise à jour dans le même commit que le changement fonctionnel.

## Validation

Le test d'ontologie vérifie que le YAML contient:

- les domaines obligatoires;
- les entités minimales;
- les relations critiques;
- les vocabulaires contrôlés;
- les métadonnées de version;
- les champs de publication publique et de sensibilité.

La validation est exécutée par `go test ./...` via `backend/internal/domain/ontology/ontology_test.go`.
