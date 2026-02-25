-- Migration 004: Veille Électorale et Intelligence
-- Données démographiques et cadre réglementaire

-- 1. Ajout des colonnes démographiques aux départements
ALTER TABLE departments ADD COLUMN IF NOT EXISTS population INTEGER DEFAULT 0;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS registered_voters INTEGER DEFAULT 0;

-- 2. Table pour le Cadre Réglementaire (Code Électoral)
CREATE TABLE IF NOT EXISTS legal_framework (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_number VARCHAR(100) NOT NULL,
    title VARCHAR(1000) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100), -- ex: 'Inscription', 'Scrutin', 'Contentieux'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Insertion de quelques données de référence réglementaires (Cameroun)
INSERT INTO legal_framework (article_number, title, content, category) VALUES
('Art. 2', 'Suffrage Universel', 'Le suffrage est universel, égal et secret. Il peut être direct ou indirect...', 'Principes Généraux'),
('Art. 45', 'Commission Mixte de Révision', 'Une commission mixte de révision des listes électorales est créée dans chaque commune...', 'Inscription'),
('Art. 74', 'Carte Électorale', 'La carte électorale est permanente. Elle est établie par ELECAM...', 'Inscription'),
('Art. 102', 'Campagne Électorale', 'La campagne électorale est ouverte à partir du quinzième jour précédant le scrutin...', 'Campagne'),
('Art. 115', 'Opérations de Vote', 'Le scrutin ne dure qu''un seul jour. Il est ouvert à 8 heures et clos à 18 heures...', 'Scrutin'),
('Art. 120', 'Dépouillement', 'Le dépouillement suit immédiatement la clôture du scrutin. Il est public...', 'Scrutin')
ON CONFLICT (article_number) DO NOTHING;

-- 4. Mise à jour de quelques données démographiques (estimations) pour l'analyse
-- Mfoundi (Yaoundé)
UPDATE departments SET population = 4200000, registered_voters = 1200000 WHERE code = 'CE-MF';
-- Wouri (Douala)
UPDATE departments SET population = 3900000, registered_voters = 1100000 WHERE code = 'LT-WO';
-- Bénoué (Garoua)
UPDATE departments SET population = 1500000, registered_voters = 450000 WHERE code = 'NO-BE';
-- Mifi (Bafoussam)
UPDATE departments SET population = 800000, registered_voters = 250000 WHERE code = 'OU-MI';
-- Fako (Limbe/Buea)
UPDATE departments SET population = 900000, registered_voters = 280000 WHERE code = 'SW-FA';
-- Mezam (Bamenda)
UPDATE departments SET population = 1100000, registered_voters = 320000 WHERE code = 'NW-MZ';
