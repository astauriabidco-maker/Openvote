-- Migration 010: Données Démographiques Actualisées 2025
-- ========================================================
-- Sources officielles :
--   Population : BUCREP «Estimation de la Population du Cameroun 2023»
--                Total national = 28 856 127 habitants (extrapolé ~30M en 2025)
--   Électeurs : ELECAM fichier validé octobre 2025 = 8 010 464 inscrits
-- ========================================================
-- Les chiffres de population par département sont des projections 2025
-- calculées à partir des proportions RGPH-3 (2005) appliquées
-- aux totaux régionaux BUCREP 2023, avec +4% de croissance pour 2025.
-- ========================================================

-- ===============================================
-- ADAMAOUA — BUCREP 2023: 1 525 175 → ~1 586 000 (2025)
-- ELECAM: 504 622 inscrits
-- ===============================================
UPDATE departments SET population = 264000,  registered_voters = 82000  WHERE code = 'AD-DJ';  -- Djérem (Tibati)
UPDATE departments SET population = 138000,  registered_voters = 43000  WHERE code = 'AD-FD';  -- Faro-et-Déo (Tignère)
UPDATE departments SET population = 232000,  registered_voters = 72000  WHERE code = 'AD-MB';  -- Mayo-Banyo (Banyo)
UPDATE departments SET population = 342000,  registered_voters = 107000 WHERE code = 'AD-MR';  -- Mbéré (Meiganga)
UPDATE departments SET population = 610000,  registered_voters = 201000 WHERE code = 'AD-VI';  -- Vina (Ngaoundéré)

-- ===============================================
-- CENTRE — BUCREP 2023: 5 204 170 → ~5 412 000 (2025)
-- ELECAM: 1 471 272 inscrits
-- ===============================================
UPDATE departments SET population = 180000,   registered_voters = 48000   WHERE code = 'CE-HS';  -- Haute-Sanaga (Nanga-Eboko)
UPDATE departments SET population = 530000,   registered_voters = 144000  WHERE code = 'CE-LK';  -- Lekié (Monatélé)
UPDATE departments SET population = 310000,   registered_voters = 84000   WHERE code = 'CE-MI';  -- Mbam-et-Inoubou (Bafia)
UPDATE departments SET population = 130000,   registered_voters = 35000   WHERE code = 'CE-MK';  -- Mbam-et-Kim (Ntui)
UPDATE departments SET population = 250000,   registered_voters = 68000   WHERE code = 'CE-MA';  -- Méfou-et-Afamba (Mfou)
UPDATE departments SET population = 82000,    registered_voters = 22000   WHERE code = 'CE-MO';  -- Méfou-et-Akono (Ngoumou)
UPDATE departments SET population = 3400000,  registered_voters = 850000  WHERE code = 'CE-MF';  -- Mfoundi (Yaoundé)
UPDATE departments SET population = 180000,   registered_voters = 49000   WHERE code = 'CE-NK';  -- Nyong-et-Kellé (Éséka)
UPDATE departments SET population = 130000,   registered_voters = 35000   WHERE code = 'CE-NM';  -- Nyong-et-Mfoumou (Akonolinga)
UPDATE departments SET population = 220000,   registered_voters = 60000   WHERE code = 'CE-NS';  -- Nyong-et-So'o (Mbalmayo)

-- ===============================================
-- EST — BUCREP 2023: 1 200 281 → ~1 248 000 (2025)
-- ELECAM: 389 590 inscrits
-- ===============================================
UPDATE departments SET population = 195000, registered_voters = 60000  WHERE code = 'ES-BN';  -- Boumba-et-Ngoko (Yokadouma)
UPDATE departments SET population = 280000, registered_voters = 86000  WHERE code = 'ES-HN';  -- Haut-Nyong (Abong-Mbang)
UPDATE departments SET population = 270000, registered_voters = 83000  WHERE code = 'ES-KA';  -- Kadey (Batouri)
UPDATE departments SET population = 503000, registered_voters = 161000 WHERE code = 'ES-LD';  -- Lom-et-Djérem (Bertoua)

-- ===============================================
-- EXTRÊME-NORD — BUCREP 2023: 5 573 289 → ~5 796 000 (2025)
-- ELECAM: 1 242 151 inscrits
-- ===============================================
UPDATE departments SET population = 930000,  registered_voters = 198000 WHERE code = 'EN-DI';  -- Diamaré (Maroua)
UPDATE departments SET population = 640000,  registered_voters = 136000 WHERE code = 'EN-LC';  -- Logone-et-Chari (Kousséri)
UPDATE departments SET population = 950000,  registered_voters = 202000 WHERE code = 'EN-MD';  -- Mayo-Danay (Yagoua)
UPDATE departments SET population = 670000,  registered_voters = 143000 WHERE code = 'EN-MK';  -- Mayo-Kani (Kaélé)
UPDATE departments SET population = 590000,  registered_voters = 126000 WHERE code = 'EN-MS';  -- Mayo-Sava (Mora)
UPDATE departments SET population = 1016000, registered_voters = 216000 WHERE code = 'EN-MT';  -- Mayo-Tsanaga (Mokolo)

-- ===============================================
-- LITTORAL — BUCREP 2023: 4 247 503 → ~4 417 000 (2025)
-- ELECAM: 1 326 839 inscrits
-- ===============================================
UPDATE departments SET population = 720000,  registered_voters = 216000 WHERE code = 'LT-MO';  -- Moungo (Nkongsamba)
UPDATE departments SET population = 98000,   registered_voters = 29000  WHERE code = 'LT-NK';  -- Nkam (Yabassi)
UPDATE departments SET population = 355000,  registered_voters = 107000 WHERE code = 'LT-SM';  -- Sanaga-Maritime (Édéa)
UPDATE departments SET population = 3244000, registered_voters = 975000 WHERE code = 'LT-WO';  -- Wouri (Douala)

-- ===============================================
-- NORD — BUCREP 2023: 3 723 485 → ~3 872 000 (2025)
-- ELECAM: 787 681 inscrits
-- ===============================================
UPDATE departments SET population = 1570000, registered_voters = 320000 WHERE code = 'NO-BE';  -- Bénoué (Garoua)
UPDATE departments SET population = 165000,  registered_voters = 34000  WHERE code = 'NO-FA';  -- Faro (Poli)
UPDATE departments SET population = 880000,  registered_voters = 179000 WHERE code = 'NO-ML';  -- Mayo-Louti (Guider)
UPDATE departments SET population = 1257000, registered_voters = 255000 WHERE code = 'NO-MR';  -- Mayo-Rey (Tcholliré)

-- ===============================================
-- NORD-OUEST — BUCREP 2023: 1 774 119 → ~1 845 000 (2025)
-- ELECAM: 625 233 inscrits
-- ===============================================
UPDATE departments SET population = 185000, registered_voters = 63000  WHERE code = 'NW-BO';  -- Boyo (Fundong)
UPDATE departments SET population = 320000, registered_voters = 110000 WHERE code = 'NW-BU';  -- Bui (Kumbo)
UPDATE departments SET population = 285000, registered_voters = 98000  WHERE code = 'NW-DM';  -- Donga-Mantung (Nkambé)
UPDATE departments SET population = 170000, registered_voters = 58000  WHERE code = 'NW-ME';  -- Menchum (Wum)
UPDATE departments SET population = 510000, registered_voters = 175000 WHERE code = 'NW-MZ';  -- Mezam (Bamenda)
UPDATE departments SET population = 192000, registered_voters = 66000  WHERE code = 'NW-MM';  -- Momo (Mbengwi)
UPDATE departments SET population = 183000, registered_voters = 63000  WHERE code = 'NW-NK';  -- Ngo-Ketunjia (Ndop)

-- ===============================================
-- OUEST — BUCREP 2023: 3 315 190 → ~3 448 000 (2025)
-- ELECAM: 884 354 inscrits
-- ===============================================
UPDATE departments SET population = 355000, registered_voters = 91000  WHERE code = 'OU-BA';  -- Bamboutos (Mbouda)
UPDATE departments SET population = 310000, registered_voters = 80000  WHERE code = 'OU-HN';  -- Haut-Nkam (Bafang)
UPDATE departments SET population = 175000, registered_voters = 45000  WHERE code = 'OU-HP';  -- Hauts-Plateaux (Baham)
UPDATE departments SET population = 140000, registered_voters = 36000  WHERE code = 'OU-KK';  -- Koung-Khi (Bayangam)
UPDATE departments SET population = 460000, registered_voters = 118000 WHERE code = 'OU-MN';  -- Ménoua (Dschang)
UPDATE departments SET population = 560000, registered_voters = 144000 WHERE code = 'OU-MI';  -- Mifi (Bafoussam)
UPDATE departments SET population = 178000, registered_voters = 46000  WHERE code = 'OU-ND';  -- Ndé (Bangangté)
UPDATE departments SET population = 1270000, registered_voters = 326000 WHERE code = 'OU-NO';  -- Noun (Foumban)

-- ===============================================
-- SUD — BUCREP 2023: 938 738 → ~976 000 (2025)
-- ELECAM: 318 186 inscrits
-- ===============================================
UPDATE departments SET population = 275000, registered_voters = 90000  WHERE code = 'SU-DL';  -- Dja-et-Lobo (Sangmélima)
UPDATE departments SET population = 290000, registered_voters = 95000  WHERE code = 'SU-MV';  -- Mvila (Ebolowa)
UPDATE departments SET population = 275000, registered_voters = 90000  WHERE code = 'SU-OC';  -- Océan (Kribi)
UPDATE departments SET population = 136000, registered_voters = 44000  WHERE code = 'SU-VN';  -- Vallée-du-Ntem (Ambam)

-- ===============================================
-- SUD-OUEST — BUCREP 2023: 1 324 187 → ~1 377 000 (2025)
-- ELECAM: 426 342 inscrits
-- ===============================================
UPDATE departments SET population = 495000, registered_voters = 157000 WHERE code = 'SW-FA';  -- Fako (Limbe/Buea)
UPDATE departments SET population = 175000, registered_voters = 56000  WHERE code = 'SW-KM';  -- Koupé-Manengouba (Bangem)
UPDATE departments SET population = 110000, registered_voters = 35000  WHERE code = 'SW-LE';  -- Lebialem (Menji)
UPDATE departments SET population = 215000, registered_voters = 68000  WHERE code = 'SW-MA';  -- Manyu (Mamfe)
UPDATE departments SET population = 260000, registered_voters = 83000  WHERE code = 'SW-ME';  -- Meme (Kumba)
UPDATE departments SET population = 122000, registered_voters = 39000  WHERE code = 'SW-ND';  -- Ndian (Mundemba)

-- ===============================================
-- RÉSUMÉ PAR RÉGION (vérification)
-- ===============================================
-- Région          | Pop. BUCREP 2023 | Pop. 2025 (est.) | Inscrits ELECAM | Taux
-- ================|==================|==================|=================|======
-- Extrême-Nord    |   5 573 289      |   5 796 000      |   1 242 151     | 21.4%
-- Centre          |   5 204 170      |   5 412 000      |   1 471 272     | 27.2%
-- Littoral        |   4 247 503      |   4 417 000      |   1 326 839     | 30.0%
-- Nord            |   3 723 485      |   3 872 000      |     787 681     | 20.3%
-- Ouest           |   3 315 190      |   3 448 000      |     884 354     | 25.6%
-- Nord-Ouest      |   1 774 119      |   1 845 000      |     625 233     | 33.9%
-- Adamaoua        |   1 525 175      |   1 586 000      |     504 622     | 31.8%
-- Sud-Ouest       |   1 324 187      |   1 377 000      |     426 342     | 31.0%
-- Est             |   1 200 281      |   1 248 000      |     389 590     | 31.2%
-- Sud             |     938 738      |     976 000      |     318 186     | 32.6%
-- ================|==================|==================|=================|======
-- TOTAL           |  28 826 137      |  29 977 000      |   7 976 270*    |
-- * hors diaspora (34 411 inscrits) = total ELECAM 8 010 464
