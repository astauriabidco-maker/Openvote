-- Clean up
DELETE FROM reports;
DELETE FROM users;

-- Users
INSERT INTO users (id, username, role, password_hash) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'admin', 'super_admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgJR4xT.p3w5Wp3X8x3X8x3X8x'),
('550e8400-e29b-41d4-a716-446655440001', 'observer1', 'observer', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgJR4xT.p3w5Wp3X8x3X8x3X8x');

-- Reports
INSERT INTO reports (id, observer_id, incident_type, description, gps_location, h3_index, status, created_at) VALUES 
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440001', 'Fraude électorale', 'Bourrage d''urnes observé au bureau 12', ST_GeomFromText('POINT(9.70 4.05)', 4326), '8a33908d1a1ffff', 'verified', NOW()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440001', 'Retard ouverture', 'Le bureau n''est toujours pas ouvert à 9h', ST_GeomFromText('POINT(9.71 4.06)', 4326), '8a33908d1a1ffff', 'pending', NOW()),
(uuid_generate_v4(), '550e8400-e29b-41d4-a716-446655440001', 'Violence', 'Altercation devant le bureau de vote', ST_GeomFromText('POINT(9.69 4.04)', 4326), '8a33908d1a1ffff', 'pending', NOW());
