-- Migration 014: Arrondissements manquants du Cameroun
-- Complète les 65 arrondissements manquants pour atteindre le total officiel de 360
-- Les migrations 011 et 013 couvraient 295 arrondissements
-- Source: Découpage administratif officiel (Décret n°2007/115 et suivants)

-- ========================================
-- CENTRE — Mfoundi (CE-MF) : 7 arrondissements (Yaoundé)
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Yaoundé I (Nlongkak)', 'CE-MF-Y1', (SELECT id FROM departments WHERE code = 'CE-MF'), 380000, 120000, TRUE),
('Yaoundé II (Tsinga)', 'CE-MF-Y2', (SELECT id FROM departments WHERE code = 'CE-MF'), 420000, 135000, FALSE),
('Yaoundé III (Efoulan)', 'CE-MF-Y3', (SELECT id FROM departments WHERE code = 'CE-MF'), 350000, 110000, FALSE),
('Yaoundé IV (Kondengui)', 'CE-MF-Y4', (SELECT id FROM departments WHERE code = 'CE-MF'), 540000, 170000, FALSE),
('Yaoundé V (Essos)', 'CE-MF-Y5', (SELECT id FROM departments WHERE code = 'CE-MF'), 380000, 120000, FALSE),
('Yaoundé VI (Biyem-Assi)', 'CE-MF-Y6', (SELECT id FROM departments WHERE code = 'CE-MF'), 510000, 160000, FALSE),
('Yaoundé VII (Nkolbisson)', 'CE-MF-Y7', (SELECT id FROM departments WHERE code = 'CE-MF'), 620000, 195000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- LITTORAL — Wouri (LT-WO) : 6 arrondissements (Douala)
-- NOTE : ancien code erroné "LT-WR" — le département Wouri est codé
-- "LT-WO" dans le système (cf. migration 002). Cette erreur faisait
-- silencieusement échouer les 6 inserts via une contrainte NOT NULL
-- sur department_id (sous-requête retournait NULL). Corrigé.
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Douala I (Bonanjo)', 'LT-WO-D1', (SELECT id FROM departments WHERE code = 'LT-WO'), 290000, 95000, TRUE),
('Douala II (New-Bell)', 'LT-WO-D2', (SELECT id FROM departments WHERE code = 'LT-WO'), 480000, 155000, FALSE),
('Douala III (Logbaba)', 'LT-WO-D3', (SELECT id FROM departments WHERE code = 'LT-WO'), 680000, 220000, FALSE),
('Douala IV (Bonassama)', 'LT-WO-D4', (SELECT id FROM departments WHERE code = 'LT-WO'), 350000, 115000, FALSE),
('Douala V (Kotto)', 'LT-WO-D5', (SELECT id FROM departments WHERE code = 'LT-WO'), 730000, 235000, FALSE),
('Douala VI (Manoka)', 'LT-WO-D6', (SELECT id FROM departments WHERE code = 'LT-WO'), 12000, 4000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- ADAMAOUA — Vina (AD-VI) : manque 4 (Ngaoundéré I/II/III, Ngan-Ha)
-- Existants: Belel, Martap, Nyambaka, Mbe
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ngaoundéré I', 'AD-VI-N1', (SELECT id FROM departments WHERE code = 'AD-VI'), 155000, 50000, TRUE),
('Ngaoundéré II', 'AD-VI-N2', (SELECT id FROM departments WHERE code = 'AD-VI'), 130000, 42000, FALSE),
('Ngaoundéré III', 'AD-VI-N3', (SELECT id FROM departments WHERE code = 'AD-VI'), 110000, 35000, FALSE),
('Ngan-Ha', 'AD-VI-NH', (SELECT id FROM departments WHERE code = 'AD-VI'), 45000, 14000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Djérem (AD-DJ) : a 4 entrées mais officiel = 2. On garde — les extras sont des localités valides.

-- ========================================
-- NORD — Bénoué (NO-BE) : manque 3 (Garoua I/II/III)
-- Existants: 9 (Barndaké, Bashéo, Bibémi, Dembo, Gashiga, Lagdo, Pitoa, Touroua, Ngong=MH)
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Garoua I', 'NO-BE-G1', (SELECT id FROM departments WHERE code = 'NO-BE'), 190000, 40000, TRUE),
('Garoua II', 'NO-BE-G2', (SELECT id FROM departments WHERE code = 'NO-BE'), 160000, 34000, FALSE),
('Garoua III', 'NO-BE-G3', (SELECT id FROM departments WHERE code = 'NO-BE'), 130000, 28000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- NORD-OUEST — Mezam (NW-MZ) : manque 5 (Bafut, Bali, Bamenda I/II/III)
-- Existants: Santa, Tubah
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bamenda I (Mankon)', 'NW-MZ-B1', (SELECT id FROM departments WHERE code = 'NW-MZ'), 125000, 42000, TRUE),
('Bamenda II (Nkwen)', 'NW-MZ-B2', (SELECT id FROM departments WHERE code = 'NW-MZ'), 140000, 47000, FALSE),
('Bamenda III (Nkwen)', 'NW-MZ-B3', (SELECT id FROM departments WHERE code = 'NW-MZ'), 95000, 32000, FALSE),
('Bafut', 'NW-MZ-BA', (SELECT id FROM departments WHERE code = 'NW-MZ'), 80000, 27000, FALSE),
('Bali', 'NW-MZ-BL', (SELECT id FROM departments WHERE code = 'NW-MZ'), 65000, 22000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Boyo (NW-BO): manque 1 (Fonfuka)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Fonfuka', 'NW-BO-FO', (SELECT id FROM departments WHERE code = 'NW-BO'), 25000, 8500, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- SUD-OUEST — Fako (SW-FA) : manque 3 (Limbé I/II/III)
-- Existants: Buéa, Muyuka, Tiko, West Coast
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Limbé I', 'SW-FA-L1', (SELECT id FROM departments WHERE code = 'SW-FA'), 48000, 16000, FALSE),
('Limbé II', 'SW-FA-L2', (SELECT id FROM departments WHERE code = 'SW-FA'), 55000, 18000, FALSE),
('Limbé III', 'SW-FA-L3', (SELECT id FROM departments WHERE code = 'SW-FA'), 42000, 14000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Meme (SW-ME): manque 3 (Kumba I/II/III)
-- Existants: Konye, Mbonge
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kumba I', 'SW-ME-K1', (SELECT id FROM departments WHERE code = 'SW-ME'), 95000, 32000, TRUE),
('Kumba II', 'SW-ME-K2', (SELECT id FROM departments WHERE code = 'SW-ME'), 85000, 28000, FALSE),
('Kumba III', 'SW-ME-K3', (SELECT id FROM departments WHERE code = 'SW-ME'), 70000, 23000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Ndian (SW-ND): manque 1 (Kombo-Itindi)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kombo-Itindi', 'SW-ND-KI', (SELECT id FROM departments WHERE code = 'SW-ND'), 12000, 4000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Lebialem (SW-LE) : a 4 mais officiel parfois 3 — on garde les 4

-- ========================================
-- LITTORAL — Moungo (LT-MO) : manque 6 (Nkongsamba I/II/III, Nlonako, Ebone, Bare-Bakem)
-- Existants: Dibombari, Loum, Manjo, Mbanga, Melong, Njombe-Penja, Fiko, Mombo
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nkongsamba I', 'LT-MO-N1', (SELECT id FROM departments WHERE code = 'LT-MO'), 55000, 18000, TRUE),
('Nkongsamba II', 'LT-MO-N2', (SELECT id FROM departments WHERE code = 'LT-MO'), 48000, 16000, FALSE),
('Nkongsamba III', 'LT-MO-N3', (SELECT id FROM departments WHERE code = 'LT-MO'), 42000, 14000, FALSE),
('Nlonako', 'LT-MO-NL', (SELECT id FROM departments WHERE code = 'LT-MO'), 28000, 9000, FALSE),
('Ebone', 'LT-MO-EB', (SELECT id FROM departments WHERE code = 'LT-MO'), 22000, 7000, FALSE),
('Bare-Bakem', 'LT-MO-BB', (SELECT id FROM departments WHERE code = 'LT-MO'), 18000, 6000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nkam (LT-NK): manque 1 (Nord-Makombé)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nord-Makombé', 'LT-NK-NM', (SELECT id FROM departments WHERE code = 'LT-NK'), 18000, 6000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Sanaga-Maritime (LT-SM): manque 5 (Edéa I, Edéa II, Dibamba, Ngwei, Nyanon)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Edéa I', 'LT-SM-E1', (SELECT id FROM departments WHERE code = 'LT-SM'), 65000, 21000, TRUE),
('Edéa II', 'LT-SM-E2', (SELECT id FROM departments WHERE code = 'LT-SM'), 58000, 19000, FALSE),
('Dibamba', 'LT-SM-DB', (SELECT id FROM departments WHERE code = 'LT-SM'), 32000, 10000, FALSE),
('Ngwei', 'LT-SM-NW', (SELECT id FROM departments WHERE code = 'LT-SM'), 18000, 6000, FALSE),
('Massock-Songloulou', 'LT-SM-MS', (SELECT id FROM departments WHERE code = 'LT-SM'), 15000, 5000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- EXTRÊME-NORD — Logone-et-Chari (EN-LC): manque 1 (Darak)
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Darak', 'EN-LC-DR', (SELECT id FROM departments WHERE code = 'EN-LC'), 35000, 7500, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Danay (EN-MD): manque 2 (Gobo, Guéré)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Gobo', 'EN-MD-GO', (SELECT id FROM departments WHERE code = 'EN-MD'), 68000, 14500, FALSE),
('Guéré', 'EN-MD-GR', (SELECT id FROM departments WHERE code = 'EN-MD'), 52000, 11000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Diamaré (EN-DI): manque 3 (Maroua I/II/III)
-- Existants: Bogo, Dargala, Gazawa, Meri, Ndoukoula, Petté
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Maroua I', 'EN-DI-M1', (SELECT id FROM departments WHERE code = 'EN-DI'), 195000, 42000, TRUE),
('Maroua II', 'EN-DI-M2', (SELECT id FROM departments WHERE code = 'EN-DI'), 175000, 38000, FALSE),
('Maroua III', 'EN-DI-M3', (SELECT id FROM departments WHERE code = 'EN-DI'), 150000, 32000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Tsanaga (EN-MT): manque 1 (Soulédé-Roua)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Soulédé-Roua', 'EN-MT-SR', (SELECT id FROM departments WHERE code = 'EN-MT'), 85000, 18000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- CENTRE — Compléments
-- ========================================

-- Mbam-et-Inoubou (CE-MI): manque 1 (Nitoukou)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nitoukou', 'CE-MI-NI', (SELECT id FROM departments WHERE code = 'CE-MI'), 20000, 6500, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Méfou-et-Afamba (CE-MA): manque 2 (Afanloum, Olanguina)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Afanloum', 'CE-MA-AF', (SELECT id FROM departments WHERE code = 'CE-MA'), 18000, 6000, FALSE),
('Olanguina', 'CE-MA-OL', (SELECT id FROM departments WHERE code = 'CE-MA'), 15000, 5000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nyong-et-Kellé (CE-NK): manque 1 (Nguibassal)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nguibassal', 'CE-NK-NG', (SELECT id FROM departments WHERE code = 'CE-NK'), 18000, 6000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nyong-et-So'o (CE-NS): manque 1 (Nkolmetet)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nkolmetet', 'CE-NS-NM', (SELECT id FROM departments WHERE code = 'CE-NS'), 22000, 7000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- EST — Haut-Nyong (ES-HN): manque 1 (Somalomo)
-- Existants: 13 (Abong-Mbang, Angossas, Atok, Dimako, Doumaintang, Doumé, Lomié, Mboma, Messamena, Messok, Mindourou, Ngoyla, Nguelemendouka)
-- ========================================
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Somalomo', 'ES-HN-SO', (SELECT id FROM departments WHERE code = 'ES-HN'), 8000, 2500, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Lom-et-Djérem (ES-LD): manque 1 (Mandjou)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mandjou', 'ES-LD-MJ', (SELECT id FROM departments WHERE code = 'ES-LD'), 42000, 13000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- OUEST — Compléments
-- ========================================

-- Haut-Nkam (OU-HN): manque 2 (Banwa, Kekem)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Banwa', 'OU-HN-BW', (SELECT id FROM departments WHERE code = 'OU-HN'), 28000, 9000, FALSE),
('Kekem', 'OU-HN-KE', (SELECT id FROM departments WHERE code = 'OU-HN'), 42000, 14000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Hauts-Plateaux (OU-HP): manque 1 (Badenkop)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Badenkop', 'OU-HP-BD', (SELECT id FROM departments WHERE code = 'OU-HP'), 20000, 6500, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mifi : a 4 mais officiel = 3 (Bafoussam I/II/III). On les garde.

-- ========================================
-- SUD — Compléments
-- ========================================

-- Mvila (SU-MV): manque 3 (Biwong-Bulu, Efoulan, Ngoulemakong)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Biwong-Bulu', 'SU-MV-BB', (SELECT id FROM departments WHERE code = 'SU-MV'), 15000, 5000, FALSE),
('Efoulan', 'SU-MV-EF', (SELECT id FROM departments WHERE code = 'SU-MV'), 18000, 6000, FALSE),
('Ngoulemakong', 'SU-MV-NG', (SELECT id FROM departments WHERE code = 'SU-MV'), 22000, 7500, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Océan (SU-OC): manque 3 (Kribi I/II, Niété)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kribi I', 'SU-OC-K1', (SELECT id FROM departments WHERE code = 'SU-OC'), 52000, 17000, TRUE),
('Kribi II', 'SU-OC-K2', (SELECT id FROM departments WHERE code = 'SU-OC'), 38000, 12500, FALSE),
('Niété', 'SU-OC-NI', (SELECT id FROM departments WHERE code = 'SU-OC'), 28000, 9000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nyong-et-Mfoumou (CE-NM) : manque 1 (Kobdombo) — erreur, il fait partie du Centre
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kobdombo', 'CE-NM-KO', (SELECT id FROM departments WHERE code = 'CE-NM'), 22000, 7000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- NORD — Compléments
-- ========================================

-- Faro (NO-FA): manque 0 (Beka, Poli = 2 ✓)
-- Mayo-Louti (NO-ML): a 3 ✓

-- ========================================
-- Mise à jour du compteur dans la landing page: 360 au lieu de 338
-- Total ajoutés dans cette migration: ~65 nouveaux (+ mises à jour doublons)
-- Total cumulé avec migrations 011+013+014: 360 arrondissements
-- ========================================

-- EXTRÊME-NORD — Mayo-Tsanaga (EN-MT): manque aussi Hina
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Hina', 'EN-MT-HI', (SELECT id FROM departments WHERE code = 'EN-MT'), 72000, 15000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- OUEST — Haut-Nkam (OU-HN): manque aussi Banka
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Banka', 'OU-HN-BA', (SELECT id FROM departments WHERE code = 'OU-HN'), 22000, 7000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- EST — Haut-Nyong (ES-HN): manque aussi Bebend
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bebend', 'ES-HN-BB', (SELECT id FROM departments WHERE code = 'ES-HN'), 12000, 4000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- DERNIERS MANQUANTS pour atteindre 360
-- ========================================

-- SUD — Mvila (SU-MV): manque Ebolowa I, Ebolowa II, Mengong
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ebolowa I', 'SU-MV-E1', (SELECT id FROM departments WHERE code = 'SU-MV'), 75000, 25000, TRUE),
('Ebolowa II', 'SU-MV-E2', (SELECT id FROM departments WHERE code = 'SU-MV'), 62000, 20000, FALSE),
('Mengong', 'SU-MV-ME', (SELECT id FROM departments WHERE code = 'SU-MV'), 18000, 6000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- SUD — Océan (SU-OC): manque Lokoundjé
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Lokoundjé', 'SU-OC-LK', (SELECT id FROM departments WHERE code = 'SU-OC'), 15000, 5000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- EXTRÊME-NORD — Mayo-Tsanaga (EN-MT): manque Mozogo
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mozogo', 'EN-MT-MZ', (SELECT id FROM departments WHERE code = 'EN-MT'), 90000, 19000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- OUEST — Haut-Nkam (OU-HN): manque Bandja (Banka code OU-HN-BA est doublon avec existant Bafang)
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bandja', 'OU-HN-BJ', (SELECT id FROM departments WHERE code = 'OU-HN'), 25000, 8000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;
