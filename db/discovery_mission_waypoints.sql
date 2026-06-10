-- Waypoints for the 12 new discovery missions (ids 84-95 at generation time).
-- These missions were inserted without mission_waypoints, so the client could
-- never complete them in-flight (checkDirectMissionArrival needs arrival_lat,
-- which discovery missions lack) and the server auto-completed them on ANY
-- landing (missionAllWpReached defaults true when waypoints are empty).
-- Adding circuit waypoints around each landmark fixes both: the client now
-- completes by flying the waypoints, and the server requires all of them.
--
-- Generated because the MySQL MCP server blocks INSERT (UPDATE/READ only).
-- Idempotent: each row inserts only if that (mission, order_index) is absent.
-- Missions are matched by title + type to stay environment-independent.
-- Altitudes are kept near each mission's spawn altitude so they are reachable.

START TRANSACTION;

-- Uluru Outback Discovery (spawn -25.3450, 131.0360, 4500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Uluru North Face', -25.3300000, 131.0360000, 4500 FROM missions m
WHERE m.title = 'Uluru Outback Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Uluru East Face', -25.3450000, 131.0560000, 4500 FROM missions m
WHERE m.title = 'Uluru Outback Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Uluru South Face', -25.3600000, 131.0360000, 4500 FROM missions m
WHERE m.title = 'Uluru Outback Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Uluru West Face', -25.3450000, 131.0160000, 4500 FROM missions m
WHERE m.title = 'Uluru Outback Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Great Barrier Reef Skim (spawn -16.7000, 146.0000, 3500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Outer Reef', -16.6500000, 146.0500000, 3500 FROM missions m
WHERE m.title = 'Great Barrier Reef Skim' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Coral Cay', -16.7000000, 146.0800000, 3000 FROM missions m
WHERE m.title = 'Great Barrier Reef Skim' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Turquoise Lagoon', -16.7500000, 146.0300000, 3000 FROM missions m
WHERE m.title = 'Great Barrier Reef Skim' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Reef Edge', -16.7000000, 145.9700000, 3500 FROM missions m
WHERE m.title = 'Great Barrier Reef Skim' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Monument Valley Buttes (spawn 36.9980, -110.0980, 6500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'West Mitten Butte', 37.0050000, -110.1130000, 6500 FROM missions m
WHERE m.title = 'Monument Valley Buttes' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'East Mitten Butte', 36.9970000, -110.0980000, 6500 FROM missions m
WHERE m.title = 'Monument Valley Buttes' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Merrick Butte', 36.9850000, -110.0850000, 6500 FROM missions m
WHERE m.title = 'Monument Valley Buttes' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);

-- Angkor Wat Temples (spawn 13.4120, 103.8660, 3500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Angkor Wat', 13.4125000, 103.8670000, 3000 FROM missions m
WHERE m.title = 'Angkor Wat Temples' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Bayon Temple', 13.4413000, 103.8590000, 3000 FROM missions m
WHERE m.title = 'Angkor Wat Temples' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Ta Prohm', 13.4348000, 103.8890000, 3000 FROM missions m
WHERE m.title = 'Angkor Wat Temples' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'West Baray', 13.4350000, 103.7960000, 3500 FROM missions m
WHERE m.title = 'Angkor Wat Temples' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Taj Mahal and Agra (spawn 27.1750, 78.0420, 3500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Taj Mahal', 27.1751000, 78.0421000, 3000 FROM missions m
WHERE m.title = 'Taj Mahal and Agra' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Agra Fort', 27.1795000, 78.0211000, 3000 FROM missions m
WHERE m.title = 'Taj Mahal and Agra' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Yamuna Bend', 27.2000000, 78.0300000, 3500 FROM missions m
WHERE m.title = 'Taj Mahal and Agra' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Mehtab Bagh', 27.1830000, 78.0420000, 3000 FROM missions m
WHERE m.title = 'Taj Mahal and Agra' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Venice Lagoon Circuit (spawn 45.4340, 12.3390, 2500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'St Marks Square', 45.4340000, 12.3390000, 2000 FROM missions m
WHERE m.title = 'Venice Lagoon Circuit' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Grand Canal', 45.4400000, 12.3260000, 2000 FROM missions m
WHERE m.title = 'Venice Lagoon Circuit' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Murano Island', 45.4590000, 12.3520000, 2500 FROM missions m
WHERE m.title = 'Venice Lagoon Circuit' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Lido Beach', 45.4100000, 12.3700000, 2500 FROM missions m
WHERE m.title = 'Venice Lagoon Circuit' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Yosemite Valley Discovery (spawn 37.7450, -119.5930, 9500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Half Dome', 37.7460000, -119.5330000, 9500 FROM missions m
WHERE m.title = 'Yosemite Valley Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Glacier Point', 37.7270000, -119.5730000, 9500 FROM missions m
WHERE m.title = 'Yosemite Valley Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'El Capitan', 37.7340000, -119.6370000, 9500 FROM missions m
WHERE m.title = 'Yosemite Valley Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Yosemite Falls', 37.7560000, -119.5970000, 9500 FROM missions m
WHERE m.title = 'Yosemite Valley Discovery' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Santorini Caldera Loop (spawn 36.3930, 25.4610, 4000 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Fira Town', 36.4170000, 25.4310000, 4000 FROM missions m
WHERE m.title = 'Santorini Caldera Loop' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Oia Village', 36.4610000, 25.3760000, 4000 FROM missions m
WHERE m.title = 'Santorini Caldera Loop' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Nea Kameni Volcano', 36.4040000, 25.3960000, 3500 FROM missions m
WHERE m.title = 'Santorini Caldera Loop' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Akrotiri', 36.3510000, 25.4030000, 4000 FROM missions m
WHERE m.title = 'Santorini Caldera Loop' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Cappadocia Balloons (spawn 38.6430, 34.8290, 5500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Goreme', 38.6430000, 34.8290000, 5500 FROM missions m
WHERE m.title = 'Cappadocia Balloons' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Uchisar Castle', 38.6310000, 34.8060000, 5500 FROM missions m
WHERE m.title = 'Cappadocia Balloons' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Love Valley', 38.6620000, 34.8170000, 5500 FROM missions m
WHERE m.title = 'Cappadocia Balloons' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Avanos', 38.7150000, 34.8460000, 5500 FROM missions m
WHERE m.title = 'Cappadocia Balloons' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

-- Banff and Lake Louise (spawn 51.4170, -116.2180, 11000 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Lake Louise', 51.4170000, -116.2180000, 11000 FROM missions m
WHERE m.title = 'Banff and Lake Louise' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Victoria Glacier', 51.3760000, -116.2740000, 11000 FROM missions m
WHERE m.title = 'Banff and Lake Louise' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Moraine Lake', 51.3220000, -116.1860000, 11000 FROM missions m
WHERE m.title = 'Banff and Lake Louise' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);

-- Torres del Paine Spires (spawn -50.9400, -73.4000, 9500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Cuernos del Paine', -50.9400000, -73.4000000, 9500 FROM missions m
WHERE m.title = 'Torres del Paine Spires' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Torres Towers', -50.9100000, -73.2900000, 9500 FROM missions m
WHERE m.title = 'Torres del Paine Spires' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Grey Glacier', -50.9900000, -73.5200000, 9500 FROM missions m
WHERE m.title = 'Torres del Paine Spires' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);

-- Denali High Approach (spawn 63.0690, -151.0070, 16500 ft)
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 1, 'Denali Summit', 63.0690000, -151.0070000, 16500 FROM missions m
WHERE m.title = 'Denali High Approach' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 1);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 2, 'Kahiltna Glacier', 62.9500000, -151.1500000, 16500 FROM missions m
WHERE m.title = 'Denali High Approach' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 2);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 3, 'Ruth Glacier', 62.8800000, -150.7700000, 16500 FROM missions m
WHERE m.title = 'Denali High Approach' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 3);
INSERT INTO mission_waypoints (mission_id, order_index, name, latitude, longitude, altitude_ft)
SELECT m.id, 4, 'Wickersham Wall', 63.1100000, -151.0400000, 16500 FROM missions m
WHERE m.title = 'Denali High Approach' AND m.type = 'discovery'
  AND NOT EXISTS (SELECT 1 FROM mission_waypoints w WHERE w.mission_id = m.id AND w.order_index = 4);

COMMIT;
