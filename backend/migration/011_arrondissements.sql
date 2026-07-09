-- Migration 011: Table Arrondissements + Données Clés
-- Structure pour les 360 arrondissements du Cameroun
-- Phase 1: Départements clés (Mfoundi, Wouri, Diamaré, Bénoué, Mifi, Mezam, Fako, Noun)

-- ========================================
-- TABLE ARRONDISSEMENTS
-- ========================================
CREATE TABLE IF NOT EXISTS arrondissements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    population INTEGER DEFAULT 0,
    registered_voters INTEGER DEFAULT 0,
    is_chef_lieu BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arrondissements_department_id ON arrondissements (department_id);

-- ========================================
-- MFOUNDI (Yaoundé) — 7 arrondissements
-- Pop: 3 400 000 | Inscrits: 850 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Yaoundé I', 'CE-MF-Y1', (SELECT id FROM departments WHERE code = 'CE-MF'), 550000, 138000, TRUE),
('Yaoundé II', 'CE-MF-Y2', (SELECT id FROM departments WHERE code = 'CE-MF'), 520000, 130000, FALSE),
('Yaoundé III', 'CE-MF-Y3', (SELECT id FROM departments WHERE code = 'CE-MF'), 480000, 120000, FALSE),
('Yaoundé IV', 'CE-MF-Y4', (SELECT id FROM departments WHERE code = 'CE-MF'), 510000, 128000, FALSE),
('Yaoundé V', 'CE-MF-Y5', (SELECT id FROM departments WHERE code = 'CE-MF'), 420000, 105000, FALSE),
('Yaoundé VI', 'CE-MF-Y6', (SELECT id FROM departments WHERE code = 'CE-MF'), 530000, 133000, FALSE),
('Yaoundé VII', 'CE-MF-Y7', (SELECT id FROM departments WHERE code = 'CE-MF'), 390000, 96000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- WOURI (Douala) — 6 arrondissements
-- Pop: 3 244 000 | Inscrits: 975 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Douala I', 'LT-WO-D1', (SELECT id FROM departments WHERE code = 'LT-WO'), 680000, 204000, TRUE),
('Douala II', 'LT-WO-D2', (SELECT id FROM departments WHERE code = 'LT-WO'), 590000, 177000, FALSE),
('Douala III', 'LT-WO-D3', (SELECT id FROM departments WHERE code = 'LT-WO'), 720000, 216000, FALSE),
('Douala IV', 'LT-WO-D4', (SELECT id FROM departments WHERE code = 'LT-WO'), 450000, 135000, FALSE),
('Douala V', 'LT-WO-D5', (SELECT id FROM departments WHERE code = 'LT-WO'), 560000, 168000, FALSE),
('Douala VI', 'LT-WO-D6', (SELECT id FROM departments WHERE code = 'LT-WO'), 244000, 75000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- DIAMARÉ (Maroua) — 9 arrondissements
-- Pop: 930 000 | Inscrits: 198 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Maroua I', 'EN-DI-M1', (SELECT id FROM departments WHERE code = 'EN-DI'), 180000, 42000, TRUE),
('Maroua II', 'EN-DI-M2', (SELECT id FROM departments WHERE code = 'EN-DI'), 165000, 38000, FALSE),
('Maroua III', 'EN-DI-M3', (SELECT id FROM departments WHERE code = 'EN-DI'), 145000, 33000, FALSE),
('Bogo', 'EN-DI-BO', (SELECT id FROM departments WHERE code = 'EN-DI'), 82000, 16000, FALSE),
('Dargala', 'EN-DI-DA', (SELECT id FROM departments WHERE code = 'EN-DI'), 48000, 10000, FALSE),
('Gazawa', 'EN-DI-GA', (SELECT id FROM departments WHERE code = 'EN-DI'), 75000, 15000, FALSE),
('Meri', 'EN-DI-ME', (SELECT id FROM departments WHERE code = 'EN-DI'), 95000, 18000, FALSE),
('Ndoukoula', 'EN-DI-ND', (SELECT id FROM departments WHERE code = 'EN-DI'), 55000, 12000, FALSE),
('Petté', 'EN-DI-PE', (SELECT id FROM departments WHERE code = 'EN-DI'), 85000, 14000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- BÉNOUÉ (Garoua) — 12 arrondissements
-- Pop: 1 570 000 | Inscrits: 320 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Garoua I', 'NO-BE-G1', (SELECT id FROM departments WHERE code = 'NO-BE'), 220000, 48000, TRUE),
('Garoua II', 'NO-BE-G2', (SELECT id FROM departments WHERE code = 'NO-BE'), 210000, 45000, FALSE),
('Garoua III', 'NO-BE-G3', (SELECT id FROM departments WHERE code = 'NO-BE'), 195000, 42000, FALSE),
('Baschéo', 'NO-BE-BA', (SELECT id FROM departments WHERE code = 'NO-BE'), 65000, 12000, FALSE),
('Bibemi', 'NO-BE-BI', (SELECT id FROM departments WHERE code = 'NO-BE'), 120000, 25000, FALSE),
('Dembo', 'NO-BE-DM', (SELECT id FROM departments WHERE code = 'NO-BE'), 55000, 10000, FALSE),
('Demsa', 'NO-BE-DS', (SELECT id FROM departments WHERE code = 'NO-BE'), 85000, 17000, FALSE),
('Lagdo', 'NO-BE-LA', (SELECT id FROM departments WHERE code = 'NO-BE'), 180000, 36000, FALSE),
('Mayo-Hourna', 'NO-BE-MH', (SELECT id FROM departments WHERE code = 'NO-BE'), 70000, 14000, FALSE),
('Pitoa', 'NO-BE-PI', (SELECT id FROM departments WHERE code = 'NO-BE'), 130000, 28000, FALSE),
('Tcheboa', 'NO-BE-TC', (SELECT id FROM departments WHERE code = 'NO-BE'), 95000, 20000, FALSE),
('Touroua', 'NO-BE-TO', (SELECT id FROM departments WHERE code = 'NO-BE'), 145000, 23000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- MIFI (Bafoussam) — 3 arrondissements
-- Pop: 560 000 | Inscrits: 144 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bafoussam I', 'OU-MI-B1', (SELECT id FROM departments WHERE code = 'OU-MI'), 230000, 60000, TRUE),
('Bafoussam II', 'OU-MI-B2', (SELECT id FROM departments WHERE code = 'OU-MI'), 185000, 47000, FALSE),
('Bafoussam III', 'OU-MI-B3', (SELECT id FROM departments WHERE code = 'OU-MI'), 145000, 37000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- MEZAM (Bamenda) — 5 arrondissements
-- Pop: 510 000 | Inscrits: 175 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bamenda I', 'NW-MZ-B1', (SELECT id FROM departments WHERE code = 'NW-MZ'), 140000, 50000, TRUE),
('Bamenda II', 'NW-MZ-B2', (SELECT id FROM departments WHERE code = 'NW-MZ'), 155000, 55000, FALSE),
('Bamenda III', 'NW-MZ-B3', (SELECT id FROM departments WHERE code = 'NW-MZ'), 120000, 40000, FALSE),
('Santa', 'NW-MZ-SA', (SELECT id FROM departments WHERE code = 'NW-MZ'), 55000, 18000, FALSE),
('Tubah', 'NW-MZ-TU', (SELECT id FROM departments WHERE code = 'NW-MZ'), 40000, 12000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- FAKO (Limbe/Buea) — 7 arrondissements
-- Pop: 495 000 | Inscrits: 157 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Buea', 'SW-FA-BU', (SELECT id FROM departments WHERE code = 'SW-FA'), 130000, 42000, TRUE),
('Limbé I', 'SW-FA-L1', (SELECT id FROM departments WHERE code = 'SW-FA'), 75000, 24000, FALSE),
('Limbé II', 'SW-FA-L2', (SELECT id FROM departments WHERE code = 'SW-FA'), 65000, 21000, FALSE),
('Limbé III', 'SW-FA-L3', (SELECT id FROM departments WHERE code = 'SW-FA'), 55000, 17000, FALSE),
('Muyuka', 'SW-FA-MU', (SELECT id FROM departments WHERE code = 'SW-FA'), 80000, 25000, FALSE),
('Tiko', 'SW-FA-TI', (SELECT id FROM departments WHERE code = 'SW-FA'), 60000, 19000, FALSE),
('West Coast', 'SW-FA-WC', (SELECT id FROM departments WHERE code = 'SW-FA'), 30000, 9000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- NOUN (Foumban) — 9 arrondissements
-- Pop: 1 270 000 | Inscrits: 326 000
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Foumban', 'OU-NO-FO', (SELECT id FROM departments WHERE code = 'OU-NO'), 280000, 72000, TRUE),
('Foumbot', 'OU-NO-FB', (SELECT id FROM departments WHERE code = 'OU-NO'), 180000, 46000, FALSE),
('Kouoptamo', 'OU-NO-KO', (SELECT id FROM departments WHERE code = 'OU-NO'), 95000, 24000, FALSE),
('Koutaba', 'OU-NO-KT', (SELECT id FROM departments WHERE code = 'OU-NO'), 110000, 28000, FALSE),
('Magba', 'OU-NO-MA', (SELECT id FROM departments WHERE code = 'OU-NO'), 85000, 22000, FALSE),
('Malentouen', 'OU-NO-ML', (SELECT id FROM departments WHERE code = 'OU-NO'), 120000, 31000, FALSE),
('Massangam', 'OU-NO-MS', (SELECT id FROM departments WHERE code = 'OU-NO'), 75000, 19000, FALSE),
('Njimom', 'OU-NO-NJ', (SELECT id FROM departments WHERE code = 'OU-NO'), 160000, 41000, FALSE),
('Nkounja', 'OU-NO-NK', (SELECT id FROM departments WHERE code = 'OU-NO'), 165000, 43000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;
