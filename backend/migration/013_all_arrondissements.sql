-- Migration 013: Arrondissements complets du Cameroun
-- Complète les 50 départements restants (la migration 011 couvrait 8 départements clés)
-- Total cible: ~360 arrondissements
-- Source: Découpage administratif officiel du Cameroun
-- Population: estimée proportionnellement à partir des totaux départementaux

-- ========================================
-- ADAMAOUA (5 départements)
-- ========================================

-- Djérem (AD-DJ) — Pop: 230000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Tibati', 'AD-DJ-TI', (SELECT id FROM departments WHERE code = 'AD-DJ'), 95000, 28000, TRUE),
('Ngaoundal', 'AD-DJ-NG', (SELECT id FROM departments WHERE code = 'AD-DJ'), 72000, 21000, FALSE),
('Mbakaou', 'AD-DJ-MB', (SELECT id FROM departments WHERE code = 'AD-DJ'), 33000, 10000, FALSE),
('Ngaoui-Dj', 'AD-DJ-NO', (SELECT id FROM departments WHERE code = 'AD-DJ'), 30000, 9000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Faro-et-Déo (AD-FD) — Pop: 185000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Tignère', 'AD-FD-TI', (SELECT id FROM departments WHERE code = 'AD-FD'), 65000, 20000, TRUE),
('Galim-Tignère', 'AD-FD-GT', (SELECT id FROM departments WHERE code = 'AD-FD'), 35000, 11000, FALSE),
('Kontcha', 'AD-FD-KO', (SELECT id FROM departments WHERE code = 'AD-FD'), 48000, 15000, FALSE),
('Mayo-Baléo', 'AD-FD-MA', (SELECT id FROM departments WHERE code = 'AD-FD'), 37000, 12000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Banyo (AD-MB) — Pop: 260000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Banyo', 'AD-MB-BA', (SELECT id FROM departments WHERE code = 'AD-MB'), 120000, 38000, TRUE),
('Mayo-Darlé', 'AD-MB-MD', (SELECT id FROM departments WHERE code = 'AD-MB'), 55000, 17000, FALSE),
('Bankim', 'AD-MB-BK', (SELECT id FROM departments WHERE code = 'AD-MB'), 85000, 26000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mbéré (AD-MR) — Pop: 335000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Meiganga', 'AD-MR-ME', (SELECT id FROM departments WHERE code = 'AD-MR'), 140000, 44000, TRUE),
('Dir', 'AD-MR-DI', (SELECT id FROM departments WHERE code = 'AD-MR'), 55000, 17000, FALSE),
('Djohong', 'AD-MR-DJ', (SELECT id FROM departments WHERE code = 'AD-MR'), 75000, 23000, FALSE),
('Ngaoui', 'AD-MR-NG', (SELECT id FROM departments WHERE code = 'AD-MR'), 65000, 20000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Vina (AD-VI) — Pop: 610000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ngaoundéré I', 'AD-VI-N1', (SELECT id FROM departments WHERE code = 'AD-VI'), 145000, 48000, TRUE),
('Ngaoundéré II', 'AD-VI-N2', (SELECT id FROM departments WHERE code = 'AD-VI'), 135000, 45000, FALSE),
('Ngaoundéré III', 'AD-VI-N3', (SELECT id FROM departments WHERE code = 'AD-VI'), 120000, 40000, FALSE),
('Belel', 'AD-VI-BE', (SELECT id FROM departments WHERE code = 'AD-VI'), 55000, 17000, FALSE),
('Martap', 'AD-VI-MA', (SELECT id FROM departments WHERE code = 'AD-VI'), 65000, 20000, FALSE),
('Nyambaka', 'AD-VI-NY', (SELECT id FROM departments WHERE code = 'AD-VI'), 50000, 16000, FALSE),
('Mbé', 'AD-VI-MB', (SELECT id FROM departments WHERE code = 'AD-VI'), 40000, 15000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- CENTRE (9 départements restants, Mfoundi déjà fait)
-- ========================================

-- Haute-Sanaga (CE-HS) — Pop: 170000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nanga-Eboko', 'CE-HS-NE', (SELECT id FROM departments WHERE code = 'CE-HS'), 42000, 14000, TRUE),
('Mbandjock', 'CE-HS-MB', (SELECT id FROM departments WHERE code = 'CE-HS'), 35000, 12000, FALSE),
('Minta', 'CE-HS-MI', (SELECT id FROM departments WHERE code = 'CE-HS'), 28000, 9000, FALSE),
('Nkoteng', 'CE-HS-NK', (SELECT id FROM departments WHERE code = 'CE-HS'), 25000, 8000, FALSE),
('Bibey', 'CE-HS-BI', (SELECT id FROM departments WHERE code = 'CE-HS'), 15000, 5000, FALSE),
('Lembe-Yezoum', 'CE-HS-LY', (SELECT id FROM departments WHERE code = 'CE-HS'), 13000, 4000, FALSE),
('Nsem', 'CE-HS-NS', (SELECT id FROM departments WHERE code = 'CE-HS'), 12000, 4000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Lekié (CE-LK) — Pop: 480000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Monatélé', 'CE-LK-MO', (SELECT id FROM departments WHERE code = 'CE-LK'), 65000, 22000, TRUE),
('Obala', 'CE-LK-OB', (SELECT id FROM departments WHERE code = 'CE-LK'), 75000, 25000, FALSE),
('Sa''a', 'CE-LK-SA', (SELECT id FROM departments WHERE code = 'CE-LK'), 55000, 18000, FALSE),
('Okola', 'CE-LK-OK', (SELECT id FROM departments WHERE code = 'CE-LK'), 48000, 16000, FALSE),
('Elig-Mfomo', 'CE-LK-EM', (SELECT id FROM departments WHERE code = 'CE-LK'), 42000, 14000, FALSE),
('Evodoula', 'CE-LK-EV', (SELECT id FROM departments WHERE code = 'CE-LK'), 45000, 15000, FALSE),
('Lobo', 'CE-LK-LO', (SELECT id FROM departments WHERE code = 'CE-LK'), 38000, 12000, FALSE),
('Ebebda', 'CE-LK-EB', (SELECT id FROM departments WHERE code = 'CE-LK'), 55000, 18000, FALSE),
('Batsenga', 'CE-LK-BA', (SELECT id FROM departments WHERE code = 'CE-LK'), 57000, 19000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mbam-et-Inoubou (CE-MI) — Pop: 265000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bafia', 'CE-MI-BA', (SELECT id FROM departments WHERE code = 'CE-MI'), 75000, 24000, TRUE),
('Bokito', 'CE-MI-BO', (SELECT id FROM departments WHERE code = 'CE-MI'), 35000, 11000, FALSE),
('Deuk', 'CE-MI-DE', (SELECT id FROM departments WHERE code = 'CE-MI'), 18000, 6000, FALSE),
('Kiiki', 'CE-MI-KI', (SELECT id FROM departments WHERE code = 'CE-MI'), 20000, 6000, FALSE),
('Kon Yambetta', 'CE-MI-KY', (SELECT id FROM departments WHERE code = 'CE-MI'), 22000, 7000, FALSE),
('Makenene', 'CE-MI-MA', (SELECT id FROM departments WHERE code = 'CE-MI'), 28000, 9000, FALSE),
('Ndikiniméki', 'CE-MI-ND', (SELECT id FROM departments WHERE code = 'CE-MI'), 38000, 12000, FALSE),
('Ombessa', 'CE-MI-OM', (SELECT id FROM departments WHERE code = 'CE-MI'), 29000, 9000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mbam-et-Kim (CE-MK) — Pop: 135000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ntui', 'CE-MK-NT', (SELECT id FROM departments WHERE code = 'CE-MK'), 38000, 12000, TRUE),
('Mbangassina', 'CE-MK-MB', (SELECT id FROM departments WHERE code = 'CE-MK'), 22000, 7000, FALSE),
('Ngambe-Tikar', 'CE-MK-NG', (SELECT id FROM departments WHERE code = 'CE-MK'), 25000, 8000, FALSE),
('Ngoro', 'CE-MK-NO', (SELECT id FROM departments WHERE code = 'CE-MK'), 20000, 6000, FALSE),
('Yoko', 'CE-MK-YO', (SELECT id FROM departments WHERE code = 'CE-MK'), 30000, 9000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Méfou-et-Afamba (CE-MA) — Pop: 380000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mfou', 'CE-MA-MF', (SELECT id FROM departments WHERE code = 'CE-MA'), 95000, 30000, TRUE),
('Awae', 'CE-MA-AW', (SELECT id FROM departments WHERE code = 'CE-MA'), 42000, 13000, FALSE),
('Edzendouan', 'CE-MA-ED', (SELECT id FROM departments WHERE code = 'CE-MA'), 35000, 11000, FALSE),
('Esse', 'CE-MA-ES', (SELECT id FROM departments WHERE code = 'CE-MA'), 28000, 9000, FALSE),
('Nkolafamba', 'CE-MA-NK', (SELECT id FROM departments WHERE code = 'CE-MA'), 85000, 27000, FALSE),
('Soa', 'CE-MA-SO', (SELECT id FROM departments WHERE code = 'CE-MA'), 95000, 30000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Méfou-et-Akono (CE-MO) — Pop: 95000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ngoumou', 'CE-MO-NG', (SELECT id FROM departments WHERE code = 'CE-MO'), 28000, 9000, TRUE),
('Akono', 'CE-MO-AK', (SELECT id FROM departments WHERE code = 'CE-MO'), 22000, 7000, FALSE),
('Bikok', 'CE-MO-BI', (SELECT id FROM departments WHERE code = 'CE-MO'), 18000, 6000, FALSE),
('Mbankomo', 'CE-MO-MB', (SELECT id FROM departments WHERE code = 'CE-MO'), 27000, 8000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nyong-et-Kellé (CE-NK) — Pop: 270000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Eseka', 'CE-NK-ES', (SELECT id FROM departments WHERE code = 'CE-NK'), 45000, 14000, TRUE),
('Bot-Makak', 'CE-NK-BM', (SELECT id FROM departments WHERE code = 'CE-NK'), 32000, 10000, FALSE),
('Bondjock', 'CE-NK-BO', (SELECT id FROM departments WHERE code = 'CE-NK'), 22000, 7000, FALSE),
('Dibang', 'CE-NK-DI', (SELECT id FROM departments WHERE code = 'CE-NK'), 20000, 6000, FALSE),
('Makak', 'CE-NK-MA', (SELECT id FROM departments WHERE code = 'CE-NK'), 38000, 12000, FALSE),
('Matomb', 'CE-NK-MT', (SELECT id FROM departments WHERE code = 'CE-NK'), 35000, 11000, FALSE),
('Messondo', 'CE-NK-ME', (SELECT id FROM departments WHERE code = 'CE-NK'), 28000, 9000, FALSE),
('Ngog-Mapubi', 'CE-NK-NM', (SELECT id FROM departments WHERE code = 'CE-NK'), 25000, 8000, FALSE),
('Biyouha', 'CE-NK-BY', (SELECT id FROM departments WHERE code = 'CE-NK'), 25000, 8000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nyong-et-Mfoumou (CE-NM) — Pop: 175000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Akonolinga', 'CE-NM-AK', (SELECT id FROM departments WHERE code = 'CE-NM'), 55000, 17000, TRUE),
('Ayos', 'CE-NM-AY', (SELECT id FROM departments WHERE code = 'CE-NM'), 38000, 12000, FALSE),
('Endom', 'CE-NM-EN', (SELECT id FROM departments WHERE code = 'CE-NM'), 30000, 9000, FALSE),
('Mengang', 'CE-NM-MG', (SELECT id FROM departments WHERE code = 'CE-NM'), 28000, 9000, FALSE),
('Nyakokombo', 'CE-NM-NY', (SELECT id FROM departments WHERE code = 'CE-NM'), 24000, 7000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nyong-et-So'o (CE-NS) — Pop: 265000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mbalmayo', 'CE-NS-MB', (SELECT id FROM departments WHERE code = 'CE-NS'), 95000, 30000, TRUE),
('Dzeng', 'CE-NS-DZ', (SELECT id FROM departments WHERE code = 'CE-NS'), 38000, 12000, FALSE),
('Mengueme', 'CE-NS-MG', (SELECT id FROM departments WHERE code = 'CE-NS'), 35000, 11000, FALSE),
('Ngomedzap', 'CE-NS-NG', (SELECT id FROM departments WHERE code = 'CE-NS'), 55000, 17000, FALSE),
('Nkolmetet', 'CE-NS-NK', (SELECT id FROM departments WHERE code = 'CE-NS'), 42000, 13000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- EST (4 départements)
-- ========================================

-- Boumba-et-Ngoko (ES-BN) — Pop: 195000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Yokadouma', 'ES-BN-YO', (SELECT id FROM departments WHERE code = 'ES-BN'), 68000, 21000, TRUE),
('Gari-Gombo', 'ES-BN-GG', (SELECT id FROM departments WHERE code = 'ES-BN'), 42000, 13000, FALSE),
('Moloundou', 'ES-BN-MO', (SELECT id FROM departments WHERE code = 'ES-BN'), 50000, 16000, FALSE),
('Salapoumbé', 'ES-BN-SA', (SELECT id FROM departments WHERE code = 'ES-BN'), 35000, 11000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Haut-Nyong (ES-HN) — Pop: 330000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Abong-Mbang', 'ES-HN-AM', (SELECT id FROM departments WHERE code = 'ES-HN'), 55000, 17000, TRUE),
('Atok', 'ES-HN-AT', (SELECT id FROM departments WHERE code = 'ES-HN'), 18000, 6000, FALSE),
('Dimako', 'ES-HN-DI', (SELECT id FROM departments WHERE code = 'ES-HN'), 28000, 9000, FALSE),
('Doumaintang', 'ES-HN-DT', (SELECT id FROM departments WHERE code = 'ES-HN'), 15000, 5000, FALSE),
('Doumé', 'ES-HN-DO', (SELECT id FROM departments WHERE code = 'ES-HN'), 25000, 8000, FALSE),
('Angossas', 'ES-HN-AN', (SELECT id FROM departments WHERE code = 'ES-HN'), 20000, 6000, FALSE),
('Lomié', 'ES-HN-LO', (SELECT id FROM departments WHERE code = 'ES-HN'), 35000, 11000, FALSE),
('Messamena', 'ES-HN-MS', (SELECT id FROM departments WHERE code = 'ES-HN'), 25000, 8000, FALSE),
('Messok', 'ES-HN-MK', (SELECT id FROM departments WHERE code = 'ES-HN'), 18000, 6000, FALSE),
('Mindourou', 'ES-HN-MI', (SELECT id FROM departments WHERE code = 'ES-HN'), 28000, 9000, FALSE),
('Ngoyla', 'ES-HN-NG', (SELECT id FROM departments WHERE code = 'ES-HN'), 22000, 7000, FALSE),
('Somalomo', 'ES-HN-SO', (SELECT id FROM departments WHERE code = 'ES-HN'), 20000, 6000, FALSE),
('Mboma', 'ES-HN-MB', (SELECT id FROM departments WHERE code = 'ES-HN'), 21000, 7000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Kadey (ES-KA) — Pop: 280000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Batouri', 'ES-KA-BA', (SELECT id FROM departments WHERE code = 'ES-KA'), 85000, 27000, TRUE),
('Kentzou', 'ES-KA-KE', (SELECT id FROM departments WHERE code = 'ES-KA'), 32000, 10000, FALSE),
('Kette', 'ES-KA-KT', (SELECT id FROM departments WHERE code = 'ES-KA'), 28000, 9000, FALSE),
('Mbang', 'ES-KA-MB', (SELECT id FROM departments WHERE code = 'ES-KA'), 40000, 13000, FALSE),
('Ndélélé', 'ES-KA-ND', (SELECT id FROM departments WHERE code = 'ES-KA'), 38000, 12000, FALSE),
('Ouli', 'ES-KA-OU', (SELECT id FROM departments WHERE code = 'ES-KA'), 25000, 8000, FALSE),
('Ndem-Nam', 'ES-KA-NN', (SELECT id FROM departments WHERE code = 'ES-KA'), 32000, 10000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Lom-et-Djérem (ES-LD) — Pop: 445000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bertoua', 'ES-LD-BE', (SELECT id FROM departments WHERE code = 'ES-LD'), 135000, 42000, TRUE),
('Bétaré-Oya', 'ES-LD-BO', (SELECT id FROM departments WHERE code = 'ES-LD'), 68000, 21000, FALSE),
('Diang', 'ES-LD-DI', (SELECT id FROM departments WHERE code = 'ES-LD'), 35000, 11000, FALSE),
('Garoua-Boulaï', 'ES-LD-GB', (SELECT id FROM departments WHERE code = 'ES-LD'), 72000, 22000, FALSE),
('Mandjou', 'ES-LD-MA', (SELECT id FROM departments WHERE code = 'ES-LD'), 58000, 18000, FALSE),
('Belabo', 'ES-LD-BL', (SELECT id FROM departments WHERE code = 'ES-LD'), 42000, 13000, FALSE),
('Ngoura', 'ES-LD-NG', (SELECT id FROM departments WHERE code = 'ES-LD'), 35000, 11000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- EXTRÊME-NORD (5 départements restants, Diamaré déjà fait)
-- ========================================

-- Logone-et-Chari (EN-LC) — Pop: 640000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kousseri', 'EN-LC-KO', (SELECT id FROM departments WHERE code = 'EN-LC'), 130000, 28000, TRUE),
('Blangoua', 'EN-LC-BL', (SELECT id FROM departments WHERE code = 'EN-LC'), 55000, 12000, FALSE),
('Fotokol', 'EN-LC-FO', (SELECT id FROM departments WHERE code = 'EN-LC'), 75000, 16000, FALSE),
('Goulfey', 'EN-LC-GO', (SELECT id FROM departments WHERE code = 'EN-LC'), 62000, 13000, FALSE),
('Hilé-Alifa', 'EN-LC-HA', (SELECT id FROM departments WHERE code = 'EN-LC'), 48000, 10000, FALSE),
('Logone-Birni', 'EN-LC-LB', (SELECT id FROM departments WHERE code = 'EN-LC'), 85000, 18000, FALSE),
('Makary', 'EN-LC-MA', (SELECT id FROM departments WHERE code = 'EN-LC'), 72000, 15000, FALSE),
('Waza', 'EN-LC-WA', (SELECT id FROM departments WHERE code = 'EN-LC'), 58000, 12000, FALSE),
('Zina', 'EN-LC-ZI', (SELECT id FROM departments WHERE code = 'EN-LC'), 55000, 12000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Danay (EN-MD) — Pop: 950000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Yagoua', 'EN-MD-YA', (SELECT id FROM departments WHERE code = 'EN-MD'), 175000, 38000, TRUE),
('Datcheka', 'EN-MD-DA', (SELECT id FROM departments WHERE code = 'EN-MD'), 75000, 16000, FALSE),
('Guéré', 'EN-MD-GU', (SELECT id FROM departments WHERE code = 'EN-MD'), 85000, 18000, FALSE),
('Kaélé', 'EN-MD-KA', (SELECT id FROM departments WHERE code = 'EN-MD'), 130000, 28000, FALSE),
('Kar-Hay', 'EN-MD-KH', (SELECT id FROM departments WHERE code = 'EN-MD'), 95000, 20000, FALSE),
('Maga', 'EN-MD-MG', (SELECT id FROM departments WHERE code = 'EN-MD'), 110000, 24000, FALSE),
('Tchatibali', 'EN-MD-TC', (SELECT id FROM departments WHERE code = 'EN-MD'), 60000, 13000, FALSE),
('Wina', 'EN-MD-WI', (SELECT id FROM departments WHERE code = 'EN-MD'), 120000, 26000, FALSE),
('Vele', 'EN-MD-VE', (SELECT id FROM departments WHERE code = 'EN-MD'), 100000, 21000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Kani (EN-MK) — Pop: 670000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kaélé-MK', 'EN-MK-KA', (SELECT id FROM departments WHERE code = 'EN-MK'), 140000, 30000, TRUE),
('Guidiguis', 'EN-MK-GU', (SELECT id FROM departments WHERE code = 'EN-MK'), 95000, 20000, FALSE),
('Mindif', 'EN-MK-MI', (SELECT id FROM departments WHERE code = 'EN-MK'), 85000, 18000, FALSE),
('Moulvoudaye', 'EN-MK-MO', (SELECT id FROM departments WHERE code = 'EN-MK'), 90000, 19000, FALSE),
('Moutourwa', 'EN-MK-MT', (SELECT id FROM departments WHERE code = 'EN-MK'), 110000, 24000, FALSE),
('Porhi', 'EN-MK-PO', (SELECT id FROM departments WHERE code = 'EN-MK'), 65000, 14000, FALSE),
('Touloum', 'EN-MK-TO', (SELECT id FROM departments WHERE code = 'EN-MK'), 85000, 18000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Sava (EN-MS) — Pop: 590000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mora', 'EN-MS-MO', (SELECT id FROM departments WHERE code = 'EN-MS'), 225000, 48000, TRUE),
('Kolofata', 'EN-MS-KO', (SELECT id FROM departments WHERE code = 'EN-MS'), 195000, 42000, FALSE),
('Tokombéré', 'EN-MS-TO', (SELECT id FROM departments WHERE code = 'EN-MS'), 170000, 36000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Tsanaga (EN-MT) — Pop: 1016000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mokolo', 'EN-MT-MK', (SELECT id FROM departments WHERE code = 'EN-MT'), 280000, 60000, TRUE),
('Bourha', 'EN-MT-BO', (SELECT id FROM departments WHERE code = 'EN-MT'), 125000, 27000, FALSE),
('Hina', 'EN-MT-HI', (SELECT id FROM departments WHERE code = 'EN-MT'), 110000, 24000, FALSE),
('Koza', 'EN-MT-KO', (SELECT id FROM departments WHERE code = 'EN-MT'), 180000, 39000, FALSE),
('Mogodé', 'EN-MT-MG', (SELECT id FROM departments WHERE code = 'EN-MT'), 155000, 33000, FALSE),
('Soulédé-Roua', 'EN-MT-SR', (SELECT id FROM departments WHERE code = 'EN-MT'), 166000, 33000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- LITTORAL (3 départements restants, Wouri déjà fait)
-- ========================================

-- Moungo (LT-MO) — Pop: 720000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nkongsamba I', 'LT-MO-N1', (SELECT id FROM departments WHERE code = 'LT-MO'), 85000, 26000, TRUE),
('Nkongsamba II', 'LT-MO-N2', (SELECT id FROM departments WHERE code = 'LT-MO'), 65000, 20000, FALSE),
('Nkongsamba III', 'LT-MO-N3', (SELECT id FROM departments WHERE code = 'LT-MO'), 55000, 17000, FALSE),
('Bare', 'LT-MO-BR', (SELECT id FROM departments WHERE code = 'LT-MO'), 35000, 11000, FALSE),
('Dibombari', 'LT-MO-DI', (SELECT id FROM departments WHERE code = 'LT-MO'), 48000, 15000, FALSE),
('Loum', 'LT-MO-LO', (SELECT id FROM departments WHERE code = 'LT-MO'), 95000, 29000, FALSE),
('Manjo', 'LT-MO-MA', (SELECT id FROM departments WHERE code = 'LT-MO'), 42000, 13000, FALSE),
('Mbanga', 'LT-MO-MB', (SELECT id FROM departments WHERE code = 'LT-MO'), 55000, 17000, FALSE),
('Melong', 'LT-MO-ME', (SELECT id FROM departments WHERE code = 'LT-MO'), 68000, 21000, FALSE),
('Penja', 'LT-MO-PE', (SELECT id FROM departments WHERE code = 'LT-MO'), 85000, 26000, FALSE),
('Mombo', 'LT-MO-MX', (SELECT id FROM departments WHERE code = 'LT-MO'), 87000, 21000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Nkam (LT-NK) — Pop: 78000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Yabassi', 'LT-NK-YA', (SELECT id FROM departments WHERE code = 'LT-NK'), 32000, 10000, TRUE),
('Nkondjock', 'LT-NK-NK', (SELECT id FROM departments WHERE code = 'LT-NK'), 28000, 9000, FALSE),
('Yingui', 'LT-NK-YI', (SELECT id FROM departments WHERE code = 'LT-NK'), 18000, 6000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Sanaga-Maritime (LT-SM) — Pop: 375000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Edéa I', 'LT-SM-E1', (SELECT id FROM departments WHERE code = 'LT-SM'), 80000, 25000, TRUE),
('Edéa II', 'LT-SM-E2', (SELECT id FROM departments WHERE code = 'LT-SM'), 65000, 20000, FALSE),
('Dibamba', 'LT-SM-DI', (SELECT id FROM departments WHERE code = 'LT-SM'), 42000, 13000, FALSE),
('Dizangué', 'LT-SM-DZ', (SELECT id FROM departments WHERE code = 'LT-SM'), 35000, 11000, FALSE),
('Mouanko', 'LT-SM-MO', (SELECT id FROM departments WHERE code = 'LT-SM'), 28000, 9000, FALSE),
('Ndom', 'LT-SM-ND', (SELECT id FROM departments WHERE code = 'LT-SM'), 30000, 9000, FALSE),
('Ngwei', 'LT-SM-NG', (SELECT id FROM departments WHERE code = 'LT-SM'), 45000, 14000, FALSE),
('Pouma', 'LT-SM-PO', (SELECT id FROM departments WHERE code = 'LT-SM'), 50000, 15000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- NORD (3 départements restants, Bénoué déjà fait)
-- ========================================

-- Faro (NO-FA) — Pop: 130000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Poli', 'NO-FA-PO', (SELECT id FROM departments WHERE code = 'NO-FA'), 85000, 18000, TRUE),
('Béka', 'NO-FA-BE', (SELECT id FROM departments WHERE code = 'NO-FA'), 45000, 10000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Louti (NO-ML) — Pop: 880000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Guider', 'NO-ML-GU', (SELECT id FROM departments WHERE code = 'NO-ML'), 380000, 78000, TRUE),
('Figuil', 'NO-ML-FI', (SELECT id FROM departments WHERE code = 'NO-ML'), 250000, 51000, FALSE),
('Mayo-Oulo', 'NO-ML-MO', (SELECT id FROM departments WHERE code = 'NO-ML'), 250000, 50000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mayo-Rey (NO-MR) — Pop: 1257000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Tcholliré', 'NO-MR-TC', (SELECT id FROM departments WHERE code = 'NO-MR'), 380000, 78000, TRUE),
('Madingring', 'NO-MR-MA', (SELECT id FROM departments WHERE code = 'NO-MR'), 220000, 45000, FALSE),
('Rey-Bouba', 'NO-MR-RB', (SELECT id FROM departments WHERE code = 'NO-MR'), 350000, 72000, FALSE),
('Touboro', 'NO-MR-TO', (SELECT id FROM departments WHERE code = 'NO-MR'), 307000, 60000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- NORD-OUEST (6 départements restants, Mezam déjà fait)
-- ========================================

-- Boyo (NW-BO) — Pop: 175000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Fundong', 'NW-BO-FU', (SELECT id FROM departments WHERE code = 'NW-BO'), 75000, 26000, TRUE),
('Belo', 'NW-BO-BE', (SELECT id FROM departments WHERE code = 'NW-BO'), 55000, 19000, FALSE),
('Njinikom', 'NW-BO-NJ', (SELECT id FROM departments WHERE code = 'NW-BO'), 45000, 15000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Bui (NW-BU) — Pop: 465000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kumbo', 'NW-BU-KU', (SELECT id FROM departments WHERE code = 'NW-BU'), 130000, 45000, TRUE),
('Elak-Oku', 'NW-BU-EO', (SELECT id FROM departments WHERE code = 'NW-BU'), 70000, 24000, FALSE),
('Jakiri', 'NW-BU-JA', (SELECT id FROM departments WHERE code = 'NW-BU'), 85000, 29000, FALSE),
('Mbiame', 'NW-BU-MB', (SELECT id FROM departments WHERE code = 'NW-BU'), 65000, 22000, FALSE),
('Nkor', 'NW-BU-NK', (SELECT id FROM departments WHERE code = 'NW-BU'), 55000, 19000, FALSE),
('Noni', 'NW-BU-NO', (SELECT id FROM departments WHERE code = 'NW-BU'), 60000, 20000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Donga-Mantung (NW-DM) — Pop: 285000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Nkambé', 'NW-DM-NK', (SELECT id FROM departments WHERE code = 'NW-DM'), 85000, 29000, TRUE),
('Ako', 'NW-DM-AK', (SELECT id FROM departments WHERE code = 'NW-DM'), 42000, 14000, FALSE),
('Misaje', 'NW-DM-MI', (SELECT id FROM departments WHERE code = 'NW-DM'), 38000, 13000, FALSE),
('Ndu', 'NW-DM-ND', (SELECT id FROM departments WHERE code = 'NW-DM'), 72000, 25000, FALSE),
('Nwa', 'NW-DM-NW', (SELECT id FROM departments WHERE code = 'NW-DM'), 48000, 16000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Menchum (NW-ME) — Pop: 175000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Wum', 'NW-ME-WU', (SELECT id FROM departments WHERE code = 'NW-ME'), 65000, 22000, TRUE),
('Benakuma', 'NW-ME-BN', (SELECT id FROM departments WHERE code = 'NW-ME'), 32000, 11000, FALSE),
('Furu-Awa', 'NW-ME-FA', (SELECT id FROM departments WHERE code = 'NW-ME'), 28000, 10000, FALSE),
('Fungom', 'NW-ME-FG', (SELECT id FROM departments WHERE code = 'NW-ME'), 50000, 17000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Momo (NW-MM) — Pop: 280000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mbengwi', 'NW-MM-MB', (SELECT id FROM departments WHERE code = 'NW-MM'), 72000, 25000, TRUE),
('Andek', 'NW-MM-AN', (SELECT id FROM departments WHERE code = 'NW-MM'), 35000, 12000, FALSE),
('Batibo', 'NW-MM-BA', (SELECT id FROM departments WHERE code = 'NW-MM'), 65000, 22000, FALSE),
('Njikwa', 'NW-MM-NJ', (SELECT id FROM departments WHERE code = 'NW-MM'), 48000, 16000, FALSE),
('Widikum', 'NW-MM-WI', (SELECT id FROM departments WHERE code = 'NW-MM'), 60000, 20000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Ngo-Ketunjia (NW-NK) — Pop: 225000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ndop', 'NW-NK-ND', (SELECT id FROM departments WHERE code = 'NW-NK'), 95000, 33000, TRUE),
('Balikumbat', 'NW-NK-BK', (SELECT id FROM departments WHERE code = 'NW-NK'), 65000, 22000, FALSE),
('Babessi', 'NW-NK-BB', (SELECT id FROM departments WHERE code = 'NW-NK'), 65000, 22000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- OUEST (6 départements restants, Mifi et Noun déjà faits)
-- ========================================

-- Bamboutos (OU-BA) — Pop: 395000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mbouda', 'OU-BA-MB', (SELECT id FROM departments WHERE code = 'OU-BA'), 150000, 40000, TRUE),
('Batcham', 'OU-BA-BC', (SELECT id FROM departments WHERE code = 'OU-BA'), 85000, 22000, FALSE),
('Galim', 'OU-BA-GA', (SELECT id FROM departments WHERE code = 'OU-BA'), 80000, 21000, FALSE),
('Wabane', 'OU-BA-WA', (SELECT id FROM departments WHERE code = 'OU-BA'), 80000, 21000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Haut-Nkam (OU-HN) — Pop: 310000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bafang', 'OU-HN-BA', (SELECT id FROM departments WHERE code = 'OU-HN'), 95000, 25000, TRUE),
('Bandja', 'OU-HN-BD', (SELECT id FROM departments WHERE code = 'OU-HN'), 55000, 14000, FALSE),
('Bana', 'OU-HN-BN', (SELECT id FROM departments WHERE code = 'OU-HN'), 48000, 12000, FALSE),
('Banka', 'OU-HN-BK', (SELECT id FROM departments WHERE code = 'OU-HN'), 52000, 14000, FALSE),
('Kekem', 'OU-HN-KE', (SELECT id FROM departments WHERE code = 'OU-HN'), 60000, 16000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Hauts-Plateaux (OU-HP) — Pop: 185000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Baham', 'OU-HP-BH', (SELECT id FROM departments WHERE code = 'OU-HP'), 55000, 14000, TRUE),
('Bamendjou', 'OU-HP-BJ', (SELECT id FROM departments WHERE code = 'OU-HP'), 48000, 12000, FALSE),
('Bangou', 'OU-HP-BG', (SELECT id FROM departments WHERE code = 'OU-HP'), 42000, 11000, FALSE),
('Batié', 'OU-HP-BT', (SELECT id FROM departments WHERE code = 'OU-HP'), 40000, 10000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Koung-Khi (OU-KK) — Pop: 195000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bayangam', 'OU-KK-BY', (SELECT id FROM departments WHERE code = 'OU-KK'), 70000, 18000, TRUE),
('Poumougne', 'OU-KK-PO', (SELECT id FROM departments WHERE code = 'OU-KK'), 55000, 14000, FALSE),
('Bandjoun', 'OU-KK-BJ', (SELECT id FROM departments WHERE code = 'OU-KK'), 70000, 18000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Ménoua (OU-MN) — Pop: 470000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Dschang', 'OU-MN-DS', (SELECT id FROM departments WHERE code = 'OU-MN'), 135000, 35000, TRUE),
('Fongo-Tongo', 'OU-MN-FT', (SELECT id FROM departments WHERE code = 'OU-MN'), 60000, 16000, FALSE),
('Fokoué', 'OU-MN-FK', (SELECT id FROM departments WHERE code = 'OU-MN'), 55000, 14000, FALSE),
('Nkong-Zem', 'OU-MN-NZ', (SELECT id FROM departments WHERE code = 'OU-MN'), 72000, 19000, FALSE),
('Penka-Michel', 'OU-MN-PM', (SELECT id FROM departments WHERE code = 'OU-MN'), 88000, 23000, FALSE),
('Santchou', 'OU-MN-SA', (SELECT id FROM departments WHERE code = 'OU-MN'), 60000, 16000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Ndé (OU-ND) — Pop: 185000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bangangté', 'OU-ND-BG', (SELECT id FROM departments WHERE code = 'OU-ND'), 72000, 19000, TRUE),
('Bassamba', 'OU-ND-BS', (SELECT id FROM departments WHERE code = 'OU-ND'), 32000, 8000, FALSE),
('Bazou', 'OU-ND-BZ', (SELECT id FROM departments WHERE code = 'OU-ND'), 38000, 10000, FALSE),
('Tonga', 'OU-ND-TO', (SELECT id FROM departments WHERE code = 'OU-ND'), 43000, 11000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- SUD (4 départements)
-- ========================================

-- Dja-et-Lobo (SU-DL) — Pop: 340000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Sangmélima', 'SU-DL-SA', (SELECT id FROM departments WHERE code = 'SU-DL'), 85000, 28000, TRUE),
('Bengbis', 'SU-DL-BE', (SELECT id FROM departments WHERE code = 'SU-DL'), 22000, 7000, FALSE),
('Djoum', 'SU-DL-DJ', (SELECT id FROM departments WHERE code = 'SU-DL'), 38000, 12000, FALSE),
('Meyomessala', 'SU-DL-MY', (SELECT id FROM departments WHERE code = 'SU-DL'), 42000, 14000, FALSE),
('Meyomessi', 'SU-DL-MS', (SELECT id FROM departments WHERE code = 'SU-DL'), 28000, 9000, FALSE),
('Mintom', 'SU-DL-MI', (SELECT id FROM departments WHERE code = 'SU-DL'), 20000, 6000, FALSE),
('Oveng', 'SU-DL-OV', (SELECT id FROM departments WHERE code = 'SU-DL'), 30000, 10000, FALSE),
('Zoétélé', 'SU-DL-ZO', (SELECT id FROM departments WHERE code = 'SU-DL'), 75000, 24000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Mvila (SU-MV) — Pop: 350000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ebolowa I', 'SU-MV-E1', (SELECT id FROM departments WHERE code = 'SU-MV'), 85000, 28000, TRUE),
('Ebolowa II', 'SU-MV-E2', (SELECT id FROM departments WHERE code = 'SU-MV'), 65000, 21000, FALSE),
('Biwong-Bane', 'SU-MV-BB', (SELECT id FROM departments WHERE code = 'SU-MV'), 30000, 10000, FALSE),
('Efoulan', 'SU-MV-EF', (SELECT id FROM departments WHERE code = 'SU-MV'), 35000, 11000, FALSE),
('Mengong', 'SU-MV-MG', (SELECT id FROM departments WHERE code = 'SU-MV'), 42000, 14000, FALSE),
('Mvangan', 'SU-MV-MV', (SELECT id FROM departments WHERE code = 'SU-MV'), 48000, 16000, FALSE),
('Ngoulemakong', 'SU-MV-NG', (SELECT id FROM departments WHERE code = 'SU-MV'), 45000, 15000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Océan (SU-OC) — Pop: 250000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kribi I', 'SU-OC-K1', (SELECT id FROM departments WHERE code = 'SU-OC'), 55000, 18000, TRUE),
('Kribi II', 'SU-OC-K2', (SELECT id FROM departments WHERE code = 'SU-OC'), 42000, 14000, FALSE),
('Akom II', 'SU-OC-AK', (SELECT id FROM departments WHERE code = 'SU-OC'), 22000, 7000, FALSE),
('Bipindi', 'SU-OC-BI', (SELECT id FROM departments WHERE code = 'SU-OC'), 28000, 9000, FALSE),
('Campo', 'SU-OC-CA', (SELECT id FROM departments WHERE code = 'SU-OC'), 25000, 8000, FALSE),
('Lolodorf', 'SU-OC-LO', (SELECT id FROM departments WHERE code = 'SU-OC'), 32000, 10000, FALSE),
('Mvengue', 'SU-OC-MV', (SELECT id FROM departments WHERE code = 'SU-OC'), 22000, 7000, FALSE),
('Niété', 'SU-OC-NI', (SELECT id FROM departments WHERE code = 'SU-OC'), 24000, 8000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Vallée-du-Ntem (SU-VN) — Pop: 136000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Ambam', 'SU-VN-AM', (SELECT id FROM departments WHERE code = 'SU-VN'), 45000, 15000, TRUE),
('Ma''an', 'SU-VN-MA', (SELECT id FROM departments WHERE code = 'SU-VN'), 30000, 10000, FALSE),
('Olamzé', 'SU-VN-OL', (SELECT id FROM departments WHERE code = 'SU-VN'), 32000, 10000, FALSE),
('Kyé-Ossi', 'SU-VN-KO', (SELECT id FROM departments WHERE code = 'SU-VN'), 29000, 9000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- SUD-OUEST (5 départements restants, Fako déjà fait)
-- ========================================

-- Koupé-Manengouba (SW-KM) — Pop: 165000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Bangem', 'SW-KM-BA', (SELECT id FROM departments WHERE code = 'SW-KM'), 55000, 18000, TRUE),
('Tombel', 'SW-KM-TO', (SELECT id FROM departments WHERE code = 'SW-KM'), 65000, 21000, FALSE),
('Nguti', 'SW-KM-NG', (SELECT id FROM departments WHERE code = 'SW-KM'), 45000, 14000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Lebialem (SW-LE) — Pop: 175000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Menji', 'SW-LE-MJ', (SELECT id FROM departments WHERE code = 'SW-LE'), 48000, 15000, TRUE),
('Alou', 'SW-LE-AL', (SELECT id FROM departments WHERE code = 'SW-LE'), 35000, 11000, FALSE),
('Fontem', 'SW-LE-FO', (SELECT id FROM departments WHERE code = 'SW-LE'), 52000, 17000, FALSE),
('Wabane-SW', 'SW-LE-WA', (SELECT id FROM departments WHERE code = 'SW-LE'), 40000, 13000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Manyu (SW-MA) — Pop: 245000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mamfé', 'SW-MA-MA', (SELECT id FROM departments WHERE code = 'SW-MA'), 75000, 24000, TRUE),
('Akwaya', 'SW-MA-AK', (SELECT id FROM departments WHERE code = 'SW-MA'), 42000, 13000, FALSE),
('Eyumojock', 'SW-MA-EY', (SELECT id FROM departments WHERE code = 'SW-MA'), 48000, 15000, FALSE),
('Tinto', 'SW-MA-TI', (SELECT id FROM departments WHERE code = 'SW-MA'), 38000, 12000, FALSE),
('Upper-Bayang', 'SW-MA-UB', (SELECT id FROM departments WHERE code = 'SW-MA'), 42000, 13000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Meme (SW-ME) — Pop: 490000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Kumba I', 'SW-ME-K1', (SELECT id FROM departments WHERE code = 'SW-ME'), 110000, 35000, TRUE),
('Kumba II', 'SW-ME-K2', (SELECT id FROM departments WHERE code = 'SW-ME'), 95000, 30000, FALSE),
('Kumba III', 'SW-ME-K3', (SELECT id FROM departments WHERE code = 'SW-ME'), 85000, 27000, FALSE),
('Konye', 'SW-ME-KO', (SELECT id FROM departments WHERE code = 'SW-ME'), 72000, 23000, FALSE),
('Mbonge', 'SW-ME-MB', (SELECT id FROM departments WHERE code = 'SW-ME'), 128000, 40000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- Ndian (SW-ND) — Pop: 165000
INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Mundemba', 'SW-ND-MU', (SELECT id FROM departments WHERE code = 'SW-ND'), 28000, 9000, TRUE),
('Bamusso', 'SW-ND-BA', (SELECT id FROM departments WHERE code = 'SW-ND'), 22000, 7000, FALSE),
('Dikome-Balue', 'SW-ND-DI', (SELECT id FROM departments WHERE code = 'SW-ND'), 18000, 6000, FALSE),
('Ekondo-Titi', 'SW-ND-EK', (SELECT id FROM departments WHERE code = 'SW-ND'), 25000, 8000, FALSE),
('Idabato', 'SW-ND-ID', (SELECT id FROM departments WHERE code = 'SW-ND'), 20000, 6000, FALSE),
('Isangele', 'SW-ND-IS', (SELECT id FROM departments WHERE code = 'SW-ND'), 22000, 7000, FALSE),
('Kombo-Abedimo', 'SW-ND-KA', (SELECT id FROM departments WHERE code = 'SW-ND'), 15000, 5000, FALSE),
('Toko', 'SW-ND-TO', (SELECT id FROM departments WHERE code = 'SW-ND'), 15000, 5000, FALSE)
ON CONFLICT (code) DO UPDATE SET population = EXCLUDED.population, registered_voters = EXCLUDED.registered_voters;

-- ========================================
-- Mise à jour traçabilité pour tous les nouveaux arrondissements
-- ========================================
UPDATE arrondissements SET
  data_source = 'Estimation proportionnelle',
  data_confidence = 'estimated',
  data_year = 2025,
  last_updated = NOW()
WHERE data_source IS NULL OR data_source = '';
