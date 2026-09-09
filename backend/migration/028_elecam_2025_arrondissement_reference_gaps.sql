-- Migration 028: compléments du référentiel arrondissements pour les listes BV ELECAM 2025
--
-- Ces entrées comblent les communes/arrondissements présentes dans les listes
-- officielles ELECAM Présidentielle 2025 mais absentes du référentiel local.
-- Les populations/inscrits restent à 0 ici: les valeurs ELECAM sont portées
-- par les bureaux de vote, pas par cette table administrative.

-- Réparer deux collisions de codes introduites par les migrations historiques:
-- - NW-BU-NK désignait Nkor, puis a été réutilisé pour Nkum.
-- - SU-MV-BB désignait Biwong-Bane, puis a été réutilisé pour Biwong-Bulu.
UPDATE arrondissements SET code = 'NW-BU-NM'
WHERE code = 'NW-BU-NK' AND name = 'Nkum';

UPDATE arrondissements SET code = 'SU-MV-BU'
WHERE code = 'SU-MV-BB' AND name = 'Biwong-Bulu';

INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES
('Akoeman', 'CE-NS-AK', (SELECT id FROM departments WHERE code = 'CE-NS'), 0, 0, FALSE),
('Nguélémendouka', 'ES-HN-NM', (SELECT id FROM departments WHERE code = 'ES-HN'), 0, 0, FALSE),
('Nguélébok', 'ES-KA-NG', (SELECT id FROM departments WHERE code = 'ES-KA'), 0, 0, FALSE),
('Bertoua I', 'ES-LD-B1', (SELECT id FROM departments WHERE code = 'ES-LD'), 0, 0, FALSE),
('Bertoua II', 'ES-LD-B2', (SELECT id FROM departments WHERE code = 'ES-LD'), 0, 0, FALSE),
('Guémé-Vélé', 'EN-MD-GV', (SELECT id FROM departments WHERE code = 'EN-MD'), 0, 0, FALSE),
('Kai-Kai', 'EN-MD-KK', (SELECT id FROM departments WHERE code = 'EN-MD'), 0, 0, FALSE),
('Kalfou', 'EN-MD-KA', (SELECT id FROM departments WHERE code = 'EN-MD'), 0, 0, FALSE),
('Dziguilao', 'EN-MK-DZ', (SELECT id FROM departments WHERE code = 'EN-MK'), 0, 0, FALSE),
('Bonaléa', 'LT-MO-BN', (SELECT id FROM departments WHERE code = 'LT-MO'), 0, 0, FALSE),
('Ndobian', 'LT-NK-ND', (SELECT id FROM departments WHERE code = 'LT-NK'), 0, 0, FALSE),
('Ngambé', 'LT-SM-NG', (SELECT id FROM departments WHERE code = 'LT-SM'), 0, 0, FALSE),
('Nyanon', 'LT-SM-NY', (SELECT id FROM departments WHERE code = 'LT-SM'), 0, 0, FALSE),
('Gaschiga', 'NO-BE-GA', (SELECT id FROM departments WHERE code = 'NO-BE'), 0, 0, FALSE),
('Ngong', 'NO-BE-NG', (SELECT id FROM departments WHERE code = 'NO-BE'), 0, 0, FALSE),
('Nkor', 'NW-BU-NK', (SELECT id FROM departments WHERE code = 'NW-BU'), 0, 0, FALSE),
('Nkum', 'NW-BU-NM', (SELECT id FROM departments WHERE code = 'NW-BU'), 0, 0, FALSE),
('Zhoa', 'NW-ME-ZH', (SELECT id FROM departments WHERE code = 'NW-ME'), 0, 0, FALSE),
('Biwong-Bane', 'SU-MV-BB', (SELECT id FROM departments WHERE code = 'SU-MV'), 0, 0, FALSE),
('Biwong-Bulu', 'SU-MV-BU', (SELECT id FROM departments WHERE code = 'SU-MV'), 0, 0, FALSE),
('Idenau', 'SW-FA-ID', (SELECT id FROM departments WHERE code = 'SW-FA'), 0, 0, FALSE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    department_id = EXCLUDED.department_id;
