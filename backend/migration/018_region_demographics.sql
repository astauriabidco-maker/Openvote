-- Migration 018: Table region_demographics
--
-- Stocke les indicateurs démographiques BUCREP au niveau régional.
-- Source : "Données démographiques.xlsx" (2016-2025) partagée par l'admin
--          le 2026-07-12 (19 indicateurs × 3 sexes × 13 zones géo × 10 ans
--          = 2860 valeurs). Le seeder cmd/seed-demographics lit le CSV
--          data/geo/bucrep-demographics.csv et insère en bulk.
--
-- Granularité gérée :
--   - 10 régions (region_id NOT NULL, city_label = '' pour le total régional)
--   - Cameroun national (region_id NULL, geo_label = 'Cameroun')
--   - Centre (Sans Yaoundé) et Littoral (Sans Douala) : region_id NOT NULL,
--     city_label = '(Sans Yaoundé)' / '(Sans Douala)' pour signaler
--     l'exclusion de la ville (le seed fait la somme si nécessaire)
--   - Yaoundé et Douala : rattachées à leur région parente via city_label
--
-- Pourquoi city_label en text et pas une FK vers une table cities :
--   Le schéma régions ne descend pas au niveau ville (Yaoundé et Douala
--   sont des arrondissements dans Mfoundi et Wouri). Plutôt que d'ajouter
--   une notion de "ville détachée", on tagge la ligne avec le nom littéral
--   BUCREP. Le frontend affiche la mention entre parenthèses.

CREATE TABLE IF NOT EXISTS region_demographics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id       UUID REFERENCES regions(id) ON DELETE CASCADE,
    city_label      TEXT NOT NULL DEFAULT '',
    indicator       VARCHAR(120) NOT NULL,
    sex             VARCHAR(20) NOT NULL CHECK (sex IN ('Féminin', 'Masculin', 'Total')),
    year            SMALLINT NOT NULL CHECK (year BETWEEN 1900 AND 2100),
    value           BIGINT NOT NULL CHECK (value >= 0),
    source          VARCHAR(60) NOT NULL DEFAULT 'BUCREP',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Idempotence : un (region, city, indicator, sex, year) ne peut
    -- apparaître deux fois. ON CONFLICT pour permettre au seeder
    -- d'être ré-exécuté sans dupliquer.
    -- NULLS NOT DISTINCT (PG 15+) : sans ça, deux lignes avec region_id=NULL
    -- (Cameroun national) et le même (city_label, indicator, sex, year)
    -- sont considérées distinctes par PG, ce qui casse l'idempotence du
    -- seeder (220 doublons par run). C.f. incident 2026-07-12.
    UNIQUE NULLS NOT DISTINCT (region_id, city_label, indicator, sex, year)
);

CREATE INDEX IF NOT EXISTS idx_demographics_region
    ON region_demographics (region_id);
CREATE INDEX IF NOT EXISTS idx_demographics_year
    ON region_demographics (year);
CREATE INDEX IF NOT EXISTS idx_demographics_indicator
    ON region_demographics (indicator);
CREATE INDEX IF NOT EXISTS idx_demographics_geo_year
    ON region_demographics (region_id, year);
