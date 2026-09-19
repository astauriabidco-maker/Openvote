-- Migration 033: Resultats officiels Presidentielle 2025
-- ======================================================
-- Archive la proclamation officielle du Conseil constitutionnel et les cartes
-- analytiques LAM, puis importe les resultats nationaux et regionaux verifies
-- visuellement depuis les pages 33, 36 et 37 de la decision.
-- ======================================================

INSERT INTO source_documents
    (slug, title, publisher, source_url, document_type, language, published_date,
     local_path, extracted_text_path, sha256_checksum, mime_type, file_size_bytes,
     retrieved_at, granularity, reference_year, confidence, status, notes)
VALUES
    (
        'conseil-constitutionnel-presidentielle-2025-resultats',
        'Decision no 54/CC/SRCER du 27 octobre 2025 portant proclamation des resultats de l''election du President de la Republique',
        'Conseil constitutionnel du Cameroun',
        'local-user-supplied:/Users/user/Downloads/Conseil-Constitutionnel-Cameroun-decision-du-27-octobre-2025-de-proclamation-des-esultats-Election-Presidentielle-12-octobe-2025.pdf',
        'election_result_proclamation',
        'fr',
        '2025-10-27',
        'data/sources/official/pdfs/conseil-constitutionnel-presidentielle-2025-proclamation-resultats.pdf',
        'data/sources/official/extracted/conseil-constitutionnel-presidentielle-2025-proclamation-resultats-ocr.txt',
        '6a055a0e6356fa093e0169ec212ff7b428436c8483e141ec18067440ab0dde38',
        'application/pdf',
        12678853,
        '2026-09-19T00:00:00+02:00',
        'national,region,candidate',
        2025,
        'official',
        'ocr_extracted',
        'PDF scanne fourni localement. OCR local genere avec pdftoppm + tesseract; chiffres importes verifies visuellement sur les pages 33, 36 et 37.'
    ),
    (
        'lam-2025-participation-par-departement',
        'Cameroun presidentielle 2025 - Participation par departement',
        'Les Afriques dans le Monde - LAMencartes',
        'https://www.lesafriquesdanslemonde.fr/cameroun-presidentielle-2025/',
        'analytical_map',
        'fr',
        NULL,
        'data/sources/analysis/lam-2025/images/lam-2025-participation-par-departement.jpg',
        NULL,
        '4afffd667ce3913e59ec1a9f9edf642350c2e41b9ace77c81197b1727f871f98',
        'image/jpeg',
        382296,
        '2026-09-19T00:00:00+02:00',
        'department',
        2025,
        'secondary_check',
        'verified',
        'Carte analytique LAM; ne remplace pas la proclamation officielle.'
    ),
    (
        'lam-2025-suffrages-rapport-inscrits',
        'Cameroun presidentielle 2025 - Suffrages obtenus par rapport aux inscrits',
        'Les Afriques dans le Monde - LAMencartes',
        'https://www.lesafriquesdanslemonde.fr/cameroun-presidentielle-2025/',
        'analytical_map',
        'fr',
        NULL,
        'data/sources/analysis/lam-2025/images/lam-2025-suffrages-rapport-inscrits.jpeg',
        NULL,
        'd70795b83f1d113f864452b5b64ba3e228e4107b08747adb17a8329046f50d0c',
        'image/jpeg',
        401085,
        '2026-09-19T00:00:00+02:00',
        'department',
        2025,
        'secondary_check',
        'verified',
        'Carte analytique LAM; ne remplace pas la proclamation officielle.'
    ),
    (
        'lam-2025-vote-biya-par-departement',
        'Cameroun presidentielle 2025 - Repartition du vote Biya par departement',
        'Les Afriques dans le Monde - LAMencartes',
        'https://www.lesafriquesdanslemonde.fr/cameroun-presidentielle-2025/',
        'analytical_map',
        'fr',
        NULL,
        'data/sources/analysis/lam-2025/images/lam-2025-vote-biya-par-departement.jpeg',
        NULL,
        '83452132a69c6021e66436f5de917846559e6b24114d0b658c51fdc3896fa46c',
        'image/jpeg',
        402099,
        '2026-09-19T00:00:00+02:00',
        'department',
        2025,
        'secondary_check',
        'verified',
        'Carte analytique LAM; ne remplace pas la proclamation officielle.'
    ),
    (
        'lam-2025-vote-tchiroma-par-departement',
        'Cameroun presidentielle 2025 - Repartition du vote Tchiroma par departement',
        'Les Afriques dans le Monde - LAMencartes',
        'https://www.lesafriquesdanslemonde.fr/cameroun-presidentielle-2025/',
        'analytical_map',
        'fr',
        NULL,
        'data/sources/analysis/lam-2025/images/lam-2025-vote-tchiroma-par-departement.jpg',
        NULL,
        '2045c7254d0e3fbb6cf0b30121b6efc0b0bb6dff9f2477557be102391e894a31',
        'image/jpeg',
        415985,
        '2026-09-19T00:00:00+02:00',
        'department',
        2025,
        'secondary_check',
        'verified',
        'Carte analytique LAM; ne remplace pas la proclamation officielle.'
    )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    publisher = EXCLUDED.publisher,
    source_url = EXCLUDED.source_url,
    document_type = EXCLUDED.document_type,
    language = EXCLUDED.language,
    published_date = EXCLUDED.published_date,
    local_path = EXCLUDED.local_path,
    extracted_text_path = EXCLUDED.extracted_text_path,
    sha256_checksum = EXCLUDED.sha256_checksum,
    mime_type = EXCLUDED.mime_type,
    file_size_bytes = EXCLUDED.file_size_bytes,
    retrieved_at = EXCLUDED.retrieved_at,
    granularity = EXCLUDED.granularity,
    reference_year = EXCLUDED.reference_year,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes;

INSERT INTO elections (id, name, type, status, date, description, region_ids)
VALUES (
    '00002025-0000-4000-8000-000000000001',
    'Presidentielle Cameroun 2025',
    'presidential',
    'archived',
    '2025-10-12T00:00:00Z',
    'Resultats proclames par le Conseil constitutionnel le 27 octobre 2025.',
    'all'
)
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
        ('national', '', 8082692, 4668446, 4610826, 57620, 57.760::numeric, 33, 33, 'Total general page 33.'),
        ('region', 'ADAMAWA', 511932, 232096, 229000, 3096, 45.340::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'CENTRE', 1484347, 1036887, 1029629, 7258, 69.850::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'EAST', 394359, 263325, 260601, 2724, 66.770::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'FAR NORTH', 1261595, 734662, 717293, 17369, 58.230::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'LITTORAL', 1340024, 661382, 655794, 5588, 49.360::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'NORTH', 793505, 408917, 399519, 9398, 51.530::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'NORTH-WEST', 628096, 297875, 295665, 2210, 47.430::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'WEST', 877580, 528969, 522531, 6438, 60.280::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'SOUTH', 326329, 288098, 286647, 1451, 88.280::numeric, 33, 33, 'Region total page 33.'),
        ('region', 'SOUTH-WEST', 430706, 199459, 197667, 1792, 46.310::numeric, 33, 33, 'Region total page 33.'),
        ('diaspora', 'DIASPORA', 34219, 16776, 16480, 296, 49.030::numeric, 33, 33, 'Diaspora total page 33.')
    ) AS v(result_level, region_name, registered_voters, actual_voters, valid_votes, blank_or_invalid_votes, percentage, source_line_start, source_line_end, notes)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, region_name, actor_type, actor_name, party, metric_type,
    registered_voters, actual_voters, valid_votes, blank_or_invalid_votes, percentage,
    source_line_start, source_line_end, confidence, status, notes
)
SELECT '00002025-0000-4000-8000-000000000001'::uuid, sd.id,
       'conseil-constitutionnel-presidentielle-2025-resultats', 2025, 'presidential',
       r.result_level, r.region_name, 'election', '', '', 'summary',
       r.registered_voters, r.actual_voters, r.valid_votes, r.blank_or_invalid_votes, r.percentage,
       r.source_line_start, r.source_line_end, 'official', 'verified', r.notes
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = 'conseil-constitutionnel-presidentielle-2025-resultats'
ON CONFLICT (
    election_id, contest_type, result_level, region_name, department_name, commune_name,
    actor_type, actor_name, party, metric_type
) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    source_document_slug = EXCLUDED.source_document_slug,
    registered_voters = EXCLUDED.registered_voters,
    actual_voters = EXCLUDED.actual_voters,
    valid_votes = EXCLUDED.valid_votes,
    blank_or_invalid_votes = EXCLUDED.blank_or_invalid_votes,
    percentage = EXCLUDED.percentage,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();

WITH rows AS (
    SELECT * FROM (VALUES
        ('candidate', 'BIYA PAUL', 'RDPC', 2474179, 53.660::numeric, 36, 36),
        ('candidate', 'ISSA TCHIROMA', 'FSNC', 1622334, 35.190::numeric, 36, 36),
        ('candidate', 'LIBII LI NGUE NGUE CABRAL', 'PCRN', 157568, 3.410::numeric, 36, 36),
        ('candidate', 'BELLO BOUBA MAIGARI', 'UNDP', 112758, 2.450::numeric, 36, 36),
        ('candidate', 'TOMAINO HERMINE PATRICIA epouse NDAM NJOYA', 'UDC', 76721, 1.660::numeric, 36, 36),
        ('candidate', 'OSIH JOSHUA NAMBANGI', 'SDF', 55841, 1.210::numeric, 36, 36),
        ('candidate', 'ATEKI SETA CAXTON', 'PAL', 39935, 0.870::numeric, 36, 36),
        ('candidate', 'IYODI HIRAM SAMUEL', 'FDC', 18828, 0.400::numeric, 36, 36),
        ('candidate', 'MATOMBA SERGE ESPOIR', 'PURS', 15925, 0.350::numeric, 36, 36),
        ('candidate', 'BOUGHA HAGBE JACQUES', 'MCNC', 13612, 0.300::numeric, 36, 36),
        ('candidate', 'KWEMO PIERRE', 'UMS', 12873, 0.280::numeric, 36, 36),
        ('candidate', 'MUNA AKERE TABENG', 'UNIVERS', 10252, 0.220::numeric, 36, 36)
    ) AS v(actor_type, actor_name, party, votes, percentage, source_line_start, source_line_end)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, actor_type, actor_name, party, metric_type, votes, percentage,
    source_line_start, source_line_end, confidence, status, notes
)
SELECT '00002025-0000-4000-8000-000000000001'::uuid, sd.id,
       'conseil-constitutionnel-presidentielle-2025-resultats', 2025, 'presidential',
       'national', r.actor_type, r.actor_name, r.party, 'votes', r.votes, r.percentage,
       r.source_line_start, r.source_line_end, 'official', 'verified',
       'Candidate ranking from page 36 of the Conseil constitutionnel proclamation.'
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = 'conseil-constitutionnel-presidentielle-2025-resultats'
ON CONFLICT (
    election_id, contest_type, result_level, region_name, department_name, commune_name,
    actor_type, actor_name, party, metric_type
) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    source_document_slug = EXCLUDED.source_document_slug,
    votes = EXCLUDED.votes,
    percentage = EXCLUDED.percentage,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();
