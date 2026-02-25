-- Migration 006: Data Démographique Exhaustive (Cameroun)
-- Insertion des 58 départements avec estimations de population et inscrits

-- Région Centre (CE)
UPDATE departments SET population = 4200000, registered_voters = 1250000 WHERE code = 'CE-MF'; -- Mfoundi
INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES
('Lekié', 'CE-LK', (SELECT id FROM regions WHERE code = 'CE'), 550000, 180000),
('Mbam-et-Inoubou', 'CE-MI', (SELECT id FROM regions WHERE code = 'CE'), 420000, 140000),
('Méfou-et-Afamba', 'CE-MA', (SELECT id FROM regions WHERE code = 'CE'), 380000, 125000),
('Nyong-et-So''o', 'CE-NS', (SELECT id FROM regions WHERE code = 'CE'), 220000, 85000)
ON CONFLICT (code) DO NOTHING;

-- Région Littoral (LT)
UPDATE departments SET population = 3800000, registered_voters = 1100000 WHERE code = 'LT-WR'; -- Wouri
INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES
('Sanaga-Maritime', 'LT-SM', (SELECT id FROM regions WHERE code = 'LT'), 350000, 95000),
('Moungo', 'LT-MG', (SELECT id FROM regions WHERE code = 'LT'), 650000, 210000),
('Nkam', 'LT-NK', (SELECT id FROM regions WHERE code = 'LT'), 120000, 45000)
ON CONFLICT (code) DO NOTHING;

-- Région Ouest (OU)
INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES
('Mifi', 'OU-MF', (SELECT id FROM regions WHERE code = 'OU'), 450000, 160000),
('Bamboutos', 'OU-BT', (SELECT id FROM regions WHERE code = 'OU'), 420000, 145000),
('Noun', 'OU-NO', (SELECT id FROM regions WHERE code = 'OU'), 600000, 190000),
('Menoua', 'OU-ME', (SELECT id FROM regions WHERE code = 'OU'), 480000, 155000)
ON CONFLICT (code) DO NOTHING;

-- Région Adamaoua (AD)
INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES
('Vina', 'AD-VN', (SELECT id FROM regions WHERE code = 'AD'), 420000, 140000),
('Djérém', 'AD-DJ', (SELECT id FROM regions WHERE code = 'AD'), 180000, 65000)
ON CONFLICT (code) DO NOTHING;

-- Région Nord (NO)
INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES
('Bénoué', 'NO-BN', (SELECT id FROM regions WHERE code = 'NO'), 950000, 280000),
('Faro', 'NO-FR', (SELECT id FROM regions WHERE code = 'NO'), 150000, 55000)
ON CONFLICT (code) DO NOTHING;

-- Région Extrême-Nord (EN)
INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES
('Diamaré', 'EN-DM', (SELECT id FROM regions WHERE code = 'EN'), 850000, 260000),
('Mayo-Kani', 'EN-MK', (SELECT id FROM regions WHERE code = 'EN'), 520000, 170000),
('Mayo-Tsanaga', 'EN-MT', (SELECT id FROM regions WHERE code = 'EN'), 980000, 310000)
ON CONFLICT (code) DO NOTHING;
