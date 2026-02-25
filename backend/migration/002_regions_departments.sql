-- Migration 002: Régions et Départements du Cameroun
-- Découpages administratifs officiels

-- Table Régions
CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table Départements
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_region_id ON departments (region_id);

-- Altérer la table users pour référencer proprement la région
-- (region_id était un simple VARCHAR, on le garde compatible)

-- =============================================
-- INSERTION DES 10 RÉGIONS DU CAMEROUN
-- =============================================

INSERT INTO regions (id, name, code) VALUES
    ('a1000001-0000-0000-0000-000000000001', 'Adamaoua', 'AD'),
    ('a1000001-0000-0000-0000-000000000002', 'Centre', 'CE'),
    ('a1000001-0000-0000-0000-000000000003', 'Est', 'ES'),
    ('a1000001-0000-0000-0000-000000000004', 'Extrême-Nord', 'EN'),
    ('a1000001-0000-0000-0000-000000000005', 'Littoral', 'LT'),
    ('a1000001-0000-0000-0000-000000000006', 'Nord', 'NO'),
    ('a1000001-0000-0000-0000-000000000007', 'Nord-Ouest', 'NW'),
    ('a1000001-0000-0000-0000-000000000008', 'Ouest', 'OU'),
    ('a1000001-0000-0000-0000-000000000009', 'Sud', 'SU'),
    ('a1000001-0000-0000-0000-000000000010', 'Sud-Ouest', 'SW')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- INSERTION DES 58 DÉPARTEMENTS
-- =============================================

-- ADAMAOUA (5 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Djérem', 'AD-DJ', 'a1000001-0000-0000-0000-000000000001'),
    ('Faro-et-Déo', 'AD-FD', 'a1000001-0000-0000-0000-000000000001'),
    ('Mayo-Banyo', 'AD-MB', 'a1000001-0000-0000-0000-000000000001'),
    ('Mbéré', 'AD-MR', 'a1000001-0000-0000-0000-000000000001'),
    ('Vina', 'AD-VI', 'a1000001-0000-0000-0000-000000000001')
ON CONFLICT (code) DO NOTHING;

-- CENTRE (10 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Haute-Sanaga', 'CE-HS', 'a1000001-0000-0000-0000-000000000002'),
    ('Lekié', 'CE-LK', 'a1000001-0000-0000-0000-000000000002'),
    ('Mbam-et-Inoubou', 'CE-MI', 'a1000001-0000-0000-0000-000000000002'),
    ('Mbam-et-Kim', 'CE-MK', 'a1000001-0000-0000-0000-000000000002'),
    ('Méfou-et-Afamba', 'CE-MA', 'a1000001-0000-0000-0000-000000000002'),
    ('Méfou-et-Akono', 'CE-MO', 'a1000001-0000-0000-0000-000000000002'),
    ('Mfoundi', 'CE-MF', 'a1000001-0000-0000-0000-000000000002'),
    ('Nyong-et-Kellé', 'CE-NK', 'a1000001-0000-0000-0000-000000000002'),
    ('Nyong-et-Mfoumou', 'CE-NM', 'a1000001-0000-0000-0000-000000000002'),
    ('Nyong-et-So''o', 'CE-NS', 'a1000001-0000-0000-0000-000000000002')
ON CONFLICT (code) DO NOTHING;

-- EST (4 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Boumba-et-Ngoko', 'ES-BN', 'a1000001-0000-0000-0000-000000000003'),
    ('Haut-Nyong', 'ES-HN', 'a1000001-0000-0000-0000-000000000003'),
    ('Kadey', 'ES-KA', 'a1000001-0000-0000-0000-000000000003'),
    ('Lom-et-Djérem', 'ES-LD', 'a1000001-0000-0000-0000-000000000003')
ON CONFLICT (code) DO NOTHING;

-- EXTRÊME-NORD (6 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Diamaré', 'EN-DI', 'a1000001-0000-0000-0000-000000000004'),
    ('Logone-et-Chari', 'EN-LC', 'a1000001-0000-0000-0000-000000000004'),
    ('Mayo-Danay', 'EN-MD', 'a1000001-0000-0000-0000-000000000004'),
    ('Mayo-Kani', 'EN-MK', 'a1000001-0000-0000-0000-000000000004'),
    ('Mayo-Sava', 'EN-MS', 'a1000001-0000-0000-0000-000000000004'),
    ('Mayo-Tsanaga', 'EN-MT', 'a1000001-0000-0000-0000-000000000004')
ON CONFLICT (code) DO NOTHING;

-- LITTORAL (4 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Moungo', 'LT-MO', 'a1000001-0000-0000-0000-000000000005'),
    ('Nkam', 'LT-NK', 'a1000001-0000-0000-0000-000000000005'),
    ('Sanaga-Maritime', 'LT-SM', 'a1000001-0000-0000-0000-000000000005'),
    ('Wouri', 'LT-WO', 'a1000001-0000-0000-0000-000000000005')
ON CONFLICT (code) DO NOTHING;

-- NORD (4 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Bénoué', 'NO-BE', 'a1000001-0000-0000-0000-000000000006'),
    ('Faro', 'NO-FA', 'a1000001-0000-0000-0000-000000000006'),
    ('Mayo-Louti', 'NO-ML', 'a1000001-0000-0000-0000-000000000006'),
    ('Mayo-Rey', 'NO-MR', 'a1000001-0000-0000-0000-000000000006')
ON CONFLICT (code) DO NOTHING;

-- NORD-OUEST (7 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Boyo', 'NW-BO', 'a1000001-0000-0000-0000-000000000007'),
    ('Bui', 'NW-BU', 'a1000001-0000-0000-0000-000000000007'),
    ('Donga-Mantung', 'NW-DM', 'a1000001-0000-0000-0000-000000000007'),
    ('Menchum', 'NW-ME', 'a1000001-0000-0000-0000-000000000007'),
    ('Mezam', 'NW-MZ', 'a1000001-0000-0000-0000-000000000007'),
    ('Momo', 'NW-MM', 'a1000001-0000-0000-0000-000000000007'),
    ('Ngo-Ketunjia', 'NW-NK', 'a1000001-0000-0000-0000-000000000007')
ON CONFLICT (code) DO NOTHING;

-- OUEST (8 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Bamboutos', 'OU-BA', 'a1000001-0000-0000-0000-000000000008'),
    ('Haut-Nkam', 'OU-HN', 'a1000001-0000-0000-0000-000000000008'),
    ('Hauts-Plateaux', 'OU-HP', 'a1000001-0000-0000-0000-000000000008'),
    ('Koung-Khi', 'OU-KK', 'a1000001-0000-0000-0000-000000000008'),
    ('Ménoua', 'OU-MN', 'a1000001-0000-0000-0000-000000000008'),
    ('Mifi', 'OU-MI', 'a1000001-0000-0000-0000-000000000008'),
    ('Ndé', 'OU-ND', 'a1000001-0000-0000-0000-000000000008'),
    ('Noun', 'OU-NO', 'a1000001-0000-0000-0000-000000000008')
ON CONFLICT (code) DO NOTHING;

-- SUD (4 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Dja-et-Lobo', 'SU-DL', 'a1000001-0000-0000-0000-000000000009'),
    ('Mvila', 'SU-MV', 'a1000001-0000-0000-0000-000000000009'),
    ('Océan', 'SU-OC', 'a1000001-0000-0000-0000-000000000009'),
    ('Vallée-du-Ntem', 'SU-VN', 'a1000001-0000-0000-0000-000000000009')
ON CONFLICT (code) DO NOTHING;

-- SUD-OUEST (6 départements)
INSERT INTO departments (name, code, region_id) VALUES
    ('Fako', 'SW-FA', 'a1000001-0000-0000-0000-000000000010'),
    ('Koupé-Manengouba', 'SW-KM', 'a1000001-0000-0000-0000-000000000010'),
    ('Lebialem', 'SW-LE', 'a1000001-0000-0000-0000-000000000010'),
    ('Manyu', 'SW-MA', 'a1000001-0000-0000-0000-000000000010'),
    ('Meme', 'SW-ME', 'a1000001-0000-0000-0000-000000000010'),
    ('Ndian', 'SW-ND', 'a1000001-0000-0000-0000-000000000010')
ON CONFLICT (code) DO NOTHING;
