-- Migration 030: Résultats électoraux historiques ELECAM
-- ====================================================
-- Importe les statistiques nationales déjà lisibles dans les rapports
-- ELECAM archivés. Les données gardent la référence documentaire et les
-- lignes du texte extrait pour permettre une revue humaine.
-- ====================================================

CREATE TABLE IF NOT EXISTS historical_election_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
    source_document_slug VARCHAR(180) NOT NULL DEFAULT '',
    election_year INT NOT NULL CHECK (election_year BETWEEN 1900 AND 2100),
    contest_type VARCHAR(40) NOT NULL,
    result_level VARCHAR(40) NOT NULL DEFAULT 'national',
    actor_type VARCHAR(40) NOT NULL DEFAULT 'election',
    actor_name TEXT NOT NULL DEFAULT '',
    party VARCHAR(80) NOT NULL DEFAULT '',
    metric_type VARCHAR(60) NOT NULL DEFAULT 'summary',
    registered_voters INT,
    actual_voters INT,
    valid_votes INT,
    blank_or_invalid_votes INT,
    abstentions INT,
    polling_stations INT,
    councils INT,
    lists_presented INT,
    votes INT,
    percentage NUMERIC(8,3),
    seats INT,
    women_seats INT,
    councils_controlled INT,
    source_line_start INT,
    source_line_end INT,
    confidence VARCHAR(40) NOT NULL DEFAULT 'official_report',
    status VARCHAR(40) NOT NULL DEFAULT 'verified',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (election_id, contest_type, result_level, actor_type, actor_name, party, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_historical_election_results_election
    ON historical_election_results (election_id);
CREATE INDEX IF NOT EXISTS idx_historical_election_results_year
    ON historical_election_results (election_year);
CREATE INDEX IF NOT EXISTS idx_historical_election_results_contest
    ON historical_election_results (contest_type);
CREATE INDEX IF NOT EXISTS idx_historical_election_results_source
    ON historical_election_results (source_document_slug);

INSERT INTO elections (id, name, type, status, date, description, region_ids)
VALUES
    ('11111111-2011-4000-8000-000000000001', 'Présidentielle Cameroun 2011', 'presidential', 'archived', '2011-10-09T00:00:00Z', 'Résultats officiels nationaux issus du rapport ELECAM 2011.', 'all'),
    ('11111111-2013-4000-8000-000000000002', 'Législatives Cameroun 2013', 'legislative', 'archived', '2013-09-30T00:00:00Z', 'Résultats officiels nationaux issus du rapport ELECAM 2013.', 'all'),
    ('11111111-2013-4000-8000-000000000003', 'Municipales Cameroun 2013', 'municipal', 'archived', '2013-09-30T00:00:00Z', 'Répartition nationale des sièges municipaux et conseils contrôlés issue du rapport ELECAM 2013.', 'all'),
    ('11111111-2018-4000-8000-000000000004', 'Présidentielle Cameroun 2018', 'presidential', 'archived', '2018-10-07T00:00:00Z', 'Résultats officiels nationaux issus du rapport ELECAM 2018.', 'all'),
    ('11111111-2020-4000-8000-000000000005', 'Législatives Cameroun 2020', 'legislative', 'archived', '2020-02-09T00:00:00Z', 'Répartition finale des sièges après le scrutin du 9 février et le rerun du 22 mars 2020.', 'all'),
    ('11111111-2020-4000-8000-000000000006', 'Municipales Cameroun 2020', 'municipal', 'archived', '2020-02-09T00:00:00Z', 'Répartition nationale des sièges municipaux issue du rapport ELECAM 2020.', 'all'),
    ('11111111-2023-4000-8000-000000000007', 'Sénatoriales Cameroun 2023', 'senatorial', 'archived', '2023-03-12T00:00:00Z', 'Statistiques nationales et sièges élus issus du rapport ELECAM 2023.', 'all')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    date = EXCLUDED.date,
    description = EXCLUDED.description,
    region_ids = EXCLUDED.region_ids,
    updated_at = NOW();

WITH rows AS (
    SELECT * FROM (VALUES
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'national', 'election', '', '', 'summary', 7521651, 4951434, 4837249, 114185, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 65.820::numeric, NULL::int, NULL::int, NULL::int, 1692, 1717, 'official_report', 'verified', 'Blank/invalid ballots calculated as votes cast minus valid votes cast.'),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'national', 'election', '', '', 'summary', 6619548, 3590427, 3537940, 52487, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 53.850::numeric, NULL::int, NULL::int, NULL::int, 3488, 3524, 'official_report', 'verified', 'Registered voters calculated from national registered voters plus diaspora registered voters cited earlier in the same report.'),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'national', 'election', '', '', 'summary', 5481226, 4208796, 4023293, 185503, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 76.790::numeric, 180, NULL::int, NULL::int, 2949, 2998, 'official_report', 'verified', 'National legislative summary table.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'election', '', '', 'summary', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, 10632, NULL::int, NULL::int, 3058, 3114, 'official_report', 'verified', 'National municipal council seats and controlled councils tables.'),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'national', 'election', '', '', 'summary', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::numeric, 180, NULL::int, NULL::int, 3116, 3165, 'official_report', 'verified', 'Final seat total includes 13 rerun seats won by CPDM on 22 March 2020.'),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'national', 'election', '', '', 'summary', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, 10632, NULL::int, NULL::int, 3166, 3230, 'official_report', 'verified', 'National municipal council seats distribution.'),
        ('11111111-2023-4000-8000-000000000007'::uuid, 'elecam-senatoriales-2023-rapport-en', 2023, 'senatorial', 'national', 'election', '', '', 'summary', 11134, 10924, 10763, 161, 210, 198, NULL::int, NULL::int, NULL::int, 98.110::numeric, 70, 28, NULL::int, 2371, 2455, 'official_report', 'verified', 'Senatorial indirect-election national statistics.'),
        ('11111111-2023-4000-8000-000000000007'::uuid, 'elecam-senatoriales-2023-rapport-en', 2023, 'senatorial', 'national', 'party', 'CPDM', 'CPDM', 'seats', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 9316, NULL::numeric, 70, 28, NULL::int, 2958, 3002, 'official_report', 'verified', 'Report states CPDM won all 70 elected seats; 9,316 appears in OCR as CPDM vote total.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'CPDM', 'CPDM', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 303, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'SDF', 'SDF', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 23, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'NUDP', 'NUDP', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 15, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'UPC', 'UPC', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 7, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'CDU', 'CDU', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 5, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'MDR', 'MDR', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 5, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'UFP', 'UFP', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 1, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.'),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'national', 'party', 'UMS', 'UMS', 'councils_controlled', NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, 360, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, 1, 11235, 11266, 'official_report', 'verified', 'National total of councils controlled.')
    ) AS v(election_id, source_document_slug, election_year, contest_type, result_level, actor_type, actor_name, party, metric_type, registered_voters, actual_voters, valid_votes, blank_or_invalid_votes, abstentions, polling_stations, councils, lists_presented, votes, percentage, seats, women_seats, councils_controlled, source_line_start, source_line_end, confidence, status, notes)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type, result_level,
    actor_type, actor_name, party, metric_type, registered_voters, actual_voters, valid_votes,
    blank_or_invalid_votes, abstentions, polling_stations, councils, lists_presented, votes,
    percentage, seats, women_seats, councils_controlled, source_line_start, source_line_end,
    confidence, status, notes
)
SELECT r.election_id, sd.id, r.source_document_slug, r.election_year, r.contest_type, r.result_level,
       r.actor_type, r.actor_name, r.party, r.metric_type, r.registered_voters, r.actual_voters,
       r.valid_votes, r.blank_or_invalid_votes, r.abstentions, r.polling_stations, r.councils,
       r.lists_presented, r.votes, r.percentage, r.seats, r.women_seats, r.councils_controlled,
       r.source_line_start, r.source_line_end, r.confidence, r.status, r.notes
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = r.source_document_slug
ON CONFLICT (election_id, contest_type, result_level, actor_type, actor_name, party, metric_type) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    source_document_slug = EXCLUDED.source_document_slug,
    election_year = EXCLUDED.election_year,
    registered_voters = EXCLUDED.registered_voters,
    actual_voters = EXCLUDED.actual_voters,
    valid_votes = EXCLUDED.valid_votes,
    blank_or_invalid_votes = EXCLUDED.blank_or_invalid_votes,
    abstentions = EXCLUDED.abstentions,
    polling_stations = EXCLUDED.polling_stations,
    councils = EXCLUDED.councils,
    lists_presented = EXCLUDED.lists_presented,
    votes = EXCLUDED.votes,
    percentage = EXCLUDED.percentage,
    seats = EXCLUDED.seats,
    women_seats = EXCLUDED.women_seats,
    councils_controlled = EXCLUDED.councils_controlled,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();

WITH rows AS (
    SELECT * FROM (VALUES
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'PAUL BIYA', 'CPDM', 3772527, 77.989::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'NI JOHN FRU NDI', 'SDF', 518175, 10.712::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'GARGA HAMAN ADJI', 'ADD', 155348, 3.211::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'ADAMOU NDAM NJOYA', 'CDU', 83860, 1.733::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'AYAH PAUL ABINE', 'PAP', 61158, 1.264::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'WALLA KAHBANG EDITH', 'CPP', 34639, 0.716::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'DZONGANG ALBERT', 'LA DYNAMIQUE', 26396, 0.545::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'MOMO JEAN DE DIEU', 'PADDEC', 23791, 0.491::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'EKINDI JEAN JACQUES', 'MP', 21593, 0.446::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'MUNA BERNARD ACHUO', 'AFP', 18444, 0.381::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'DANG ESTHER BAYIBIDIO', 'BRIC', 15775, 0.326::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'BILE OLIVIER', 'UFP', 15202, 0.314::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'EKANE ANICET', 'MANIDEM', 11081, 0.229::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'HAMENI BIELEU VICTORIN', 'UFDC', 10615, 0.219::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'NGO FRITZ', 'MEC', 9259, 0.191::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'NJEUNGA JEAN', 'FUC', 9219, 0.190::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'FEUZEU ISAAC', 'MERCI', 9216, 0.190::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'KAMGANG HUBERT', 'UPA', 8250, 0.170::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'ATANGANA NSOE', 'GC', 8032, 0.166::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'LONTOUO MARCUS', 'CNC', 7875, 0.162::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'NYAMNDI GEORGE', 'SLC', 5925, 0.122::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'TABI OWONO JOACHIM', 'AMEC', 5795, 0.119::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2011-4000-8000-000000000001'::uuid, 'elecam-presidentielle-2011-rapport-en', 2011, 'presidential', 'candidate', 'SOH FONE DANIEL', 'PSU', 5074, 0.104::numeric, NULL::int, NULL::int, 1692, 1717),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'BIYA Paul', 'RDPC', 2521934, 71.250::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'Maurice KAMTO', 'MRC', 503384, 14.230::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'Cabral Libii Li NGUE NGUE', 'UNIVERS', 221995, 6.280::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'OSIH Joshua NAMBANGI', 'SDF', 118706, 3.350::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'NDAM NJOYA ADAMOU', 'UDC', 61220, 1.730::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'GARGA HAMAN ADJI', 'ADD', 55048, 1.550::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'NDIFOR AFANWI Frankline', 'MCNC', 23687, 0.670::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'MATOMBA Serge Espoir', 'PURS', 19704, 0.560::numeric, NULL::int, NULL::int, 3488, 3500),
        ('11111111-2018-4000-8000-000000000004'::uuid, 'elecam-presidentielle-2018-rapport-fr', 2018, 'presidential', 'candidate', 'MUNA AKERE TABENG', 'FPD', 12262, 0.350::numeric, NULL::int, NULL::int, 3488, 3500)
    ) AS v(election_id, source_document_slug, election_year, contest_type, actor_type, actor_name, party, votes, percentage, seats, women_seats, source_line_start, source_line_end)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, actor_type, actor_name, party, metric_type, votes, percentage, seats,
    women_seats, source_line_start, source_line_end, confidence, status, notes
)
SELECT r.election_id, sd.id, r.source_document_slug, r.election_year, r.contest_type,
       'national', r.actor_type, r.actor_name, r.party, 'votes', r.votes, r.percentage,
       r.seats, r.women_seats, r.source_line_start, r.source_line_end,
       'official_report', 'verified', 'Candidate vote total from ELECAM report.'
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = r.source_document_slug
ON CONFLICT (election_id, contest_type, result_level, actor_type, actor_name, party, metric_type) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    votes = EXCLUDED.votes,
    percentage = EXCLUDED.percentage,
    seats = EXCLUDED.seats,
    women_seats = EXCLUDED.women_seats,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    updated_at = NOW();

WITH rows AS (
    SELECT * FROM (VALUES
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'CPDM', 85, 2555689, 63.52::numeric, 148, 47, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'SDF', 35, 508901, 12.65::numeric, 18, 3, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'NUDP', 31, 478503, 11.89::numeric, 5, 2, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'CRM', 7, 142620, 3.54::numeric, 1, 1, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'CDU', 5, 71926, 1.79::numeric, 4, 2, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'UPC', 5, 68949, 1.71::numeric, 3, 2, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'MDR', 4, 32218, 0.80::numeric, 1, 1, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'NADP', 7, 34338, 0.85::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'CNSF', 2, 28339, 0.70::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'PAP', 5, 18589, 0.46::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'MANIDEM', 2, 15771, 0.39::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'PM', 4, 14126, 0.35::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'PADDEC', 1, 10386, 0.26::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'MCNC', 1, 8130, 0.20::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'MDP', 1, 5574, 0.14::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'ADD', 1, 4487, 0.11::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'MLDC', 1, 4481, 0.11::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'PURS', 1, 4086, 0.10::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'BRIC', 1, 3421, 0.09::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'AMEC', 1, 3088, 0.08::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'CDP', 1, 2277, 0.06::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'UFDC', 1, 1608, 0.04::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'FUC', 1, 1481, 0.04::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'OPDC', 1, 1244, 0.03::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'FPR', 1, 994, 0.02::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'CNC', 2, 766, 0.02::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'UDP', 1, 685, 0.02::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'PSU', 1, 380, 0.01::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2013-4000-8000-000000000002'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'legislative', 'MNPC', 2, 236, 0.01::numeric, 0, 0, NULL::int, 2949, 3055),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'CPDM', NULL::int, NULL::int, NULL::numeric, 152, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'NUDP', NULL::int, NULL::int, NULL::numeric, 7, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'CPNR', NULL::int, NULL::int, NULL::numeric, 5, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'SDF', NULL::int, NULL::int, NULL::numeric, 5, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'CDU', NULL::int, NULL::int, NULL::numeric, 4, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'CNSF', NULL::int, NULL::int, NULL::numeric, 3, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'MDR', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2020-4000-8000-000000000005'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'legislative', 'UMS', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 3116, 3165),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'CPDM', NULL::int, NULL::int, NULL::numeric, 8685, NULL::int, 303, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'SDF', NULL::int, NULL::int, NULL::numeric, 826, NULL::int, 23, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'NUDP', NULL::int, NULL::int, NULL::numeric, 518, NULL::int, 15, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'UPC', NULL::int, NULL::int, NULL::numeric, 179, NULL::int, 7, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'CDU', NULL::int, NULL::int, NULL::numeric, 163, NULL::int, 5, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'MDR', NULL::int, NULL::int, NULL::numeric, 149, NULL::int, 5, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'UFP', NULL::int, NULL::int, NULL::numeric, 25, NULL::int, 1, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'UMS', NULL::int, NULL::int, NULL::numeric, 21, NULL::int, 1, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'CRM', NULL::int, NULL::int, NULL::numeric, 19, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'CNSF', NULL::int, NULL::int, NULL::numeric, 14, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'NADP', NULL::int, NULL::int, NULL::numeric, 13, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'ADD', NULL::int, NULL::int, NULL::numeric, 5, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'PM', NULL::int, NULL::int, NULL::numeric, 3, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'CPP', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'UNIVERS', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'PADDEC', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'MLDC', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'AFP', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'FPD', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'RCPU', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'MCNC', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2013-4000-8000-000000000003'::uuid, 'elecam-legislatives-municipales-2013-rapport-en', 2013, 'municipal', 'PURS', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 3077, 3114),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'CPDM', NULL::int, NULL::int, NULL::numeric, 9037, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'NUDP', NULL::int, NULL::int, NULL::numeric, 561, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'PCRN', NULL::int, NULL::int, NULL::numeric, 206, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'CDU', NULL::int, NULL::int, NULL::numeric, 205, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'CNSF', NULL::int, NULL::int, NULL::numeric, 197, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'SDF', NULL::int, NULL::int, NULL::numeric, 185, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'MDR', NULL::int, NULL::int, NULL::numeric, 92, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'MPCN', NULL::int, NULL::int, NULL::numeric, 50, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'UMS', NULL::int, NULL::int, NULL::numeric, 53, NULL::int, NULL::int, 3166, 3230),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'MCNC', NULL::int, NULL::int, NULL::numeric, 18, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'NADP', NULL::int, NULL::int, NULL::numeric, 11, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'PAL', NULL::int, NULL::int, NULL::numeric, 5, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'MPCC', NULL::int, NULL::int, NULL::numeric, 3, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'UPSR', NULL::int, NULL::int, NULL::numeric, 3, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'MP', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'UNIVERSE', NULL::int, NULL::int, NULL::numeric, 2, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'FDC', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 6168, 6195),
        ('11111111-2020-4000-8000-000000000006'::uuid, 'elecam-legislatives-municipales-2020-rapport-en', 2020, 'municipal', 'MANIDEM', NULL::int, NULL::int, NULL::numeric, 1, NULL::int, NULL::int, 6168, 6195)
    ) AS v(election_id, source_document_slug, election_year, contest_type, party, lists_presented, votes, percentage, seats, women_seats, councils_controlled, source_line_start, source_line_end)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, actor_type, actor_name, party, metric_type, lists_presented, votes,
    percentage, seats, women_seats, councils_controlled, source_line_start, source_line_end,
    confidence, status, notes
)
SELECT r.election_id, sd.id, r.source_document_slug, r.election_year, r.contest_type,
       'national', 'party', r.party, r.party, 'seats', r.lists_presented, r.votes,
       r.percentage, r.seats, r.women_seats, r.councils_controlled, r.source_line_start,
       r.source_line_end, 'official_report', 'verified', 'Party-level national result from ELECAM report.'
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = r.source_document_slug
ON CONFLICT (election_id, contest_type, result_level, actor_type, actor_name, party, metric_type) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    lists_presented = EXCLUDED.lists_presented,
    votes = EXCLUDED.votes,
    percentage = EXCLUDED.percentage,
    seats = EXCLUDED.seats,
    women_seats = EXCLUDED.women_seats,
    councils_controlled = EXCLUDED.councils_controlled,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    updated_at = NOW();
