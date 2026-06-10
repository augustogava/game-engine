-- New achievements (25) and new missions (25: 13 route + 12 discovery).
-- Generated because the MySQL MCP server blocks INSERT (UPDATE/READ only).
-- The achievement speed-criteria fix and credit_reward normalization were already
-- applied directly via the MCP server; this file only contains the new rows (INSERTs).
-- Safe to run once. Route distances are computed accurately from the airports table.

START TRANSACTION;

-- =========================================================================
-- 25 NEW ACHIEVEMENTS (existing, evaluator-known criteria_types only)
-- =========================================================================
INSERT INTO achievements (code, title, description, icon, category, criteria_type, criteria_value, sort_order, is_active, credit_reward) VALUES
  ('flights_25',        'Taking Off',             'Complete 25 flights.',                          'plane',     'milestone',   'total_flights',       25,      460, 1, 18),
  ('flights_2500',      'Sky Veteran',            'Complete 2,500 flights.',                       'plane',     'milestone',   'total_flights',       2500,    470, 1, 65),
  ('flights_5000',      'Eternal Aviator',        'Complete 5,000 flights.',                       'plane',     'milestone',   'total_flights',       5000,    480, 1, 80),
  ('hours_25',          'Logbook Filler',         'Log 25 total flight hours.',                    'clock',     'hours',       'total_flight_hours',  25,      490, 1, 13),
  ('hours_2500',        'Time Lord',              'Log 2,500 total flight hours.',                 'clock',     'hours',       'total_flight_hours',  2500,    500, 1, 50),
  ('hours_5000',        'Living Legend',          'Log 5,000 total flight hours.',                 'clock',     'hours',       'total_flight_hours',  5000,    510, 1, 65),
  ('distance_250000',   'Quarter Million',        'Fly 250,000 km in total.',                      'route',     'distance',    'total_distance_km',   250000,  520, 1, 28),
  ('distance_1000000',  'Million Kilometer Club', 'Fly 1,000,000 km in total.',                    'route',     'distance',    'total_distance_km',   1000000, 530, 1, 40),
  ('airports_10',       'Getting Around',         'Visit 10 distinct airports.',                   'map-pin',   'exploration', 'distinct_airports',   10,      540, 1, 12),
  ('airports_500',      'Atlas Master',           'Visit 500 distinct airports.',                  'map-pin',   'exploration', 'distinct_airports',   500,     550, 1, 40),
  ('missions_10',       'On a Roll',              'Complete 10 missions.',                         'target',    'missions',    'missions_completed',  10,      560, 1, 12),
  ('missions_500',      'Mission Immortal',       'Complete 500 missions.',                        'target',    'missions',    'missions_completed',  500,     570, 1, 40),
  ('landings_25',       'Steady Approach',        'Perform 25 successful landings.',               'arrow-down','landings',    'successful_landings', 25,      580, 1, 12),
  ('landings_1000',     'Touchdown Titan',        'Perform 1,000 successful landings.',            'arrow-down','landings',    'successful_landings', 1000,    590, 1, 40),
  ('smooth_landing_5',  'Ghost Landing',          'Land with a vertical speed under 5 fpm.',       'feather',   'landings',    'smooth_landing',      5,       600, 1, 35),
  ('points_100',        'First Points',           'Earn 100 reward points.',                       'star',      'points',      'total_reward_points', 100,     610, 1, 6),
  ('points_500',        'Point Starter',          'Earn 500 reward points.',                       'star',      'points',      'total_reward_points', 500,     620, 1, 8),
  ('points_25000',      'Point Magnate',          'Earn 25,000 reward points.',                    'star',      'points',      'total_reward_points', 25000,   630, 1, 30),
  ('points_50000',      'Point Overlord',         'Earn 50,000 reward points.',                    'star',      'points',      'total_reward_points', 50000,   640, 1, 40),
  ('altitude_10000',    'Above the Clouds',       'Reach 10,000 ft of altitude.',                  'mountain',  'performance', 'max_altitude_ft',     10000,   650, 1, 6),
  ('altitude_20000',    'High Flyer',             'Reach 20,000 ft of altitude.',                  'mountain',  'performance', 'max_altitude_ft',     20000,   660, 1, 8),
  ('altitude_45000',    'Edge of Space',          'Reach 45,000 ft of altitude.',                  'mountain',  'performance', 'max_altitude_ft',     45000,   670, 1, 20),
  ('speed_150',         'Picking Up Pace',        'Reach an average speed of 150 knots.',          'gauge',     'performance', 'avg_speed_knots',     150,     680, 1, 6),
  ('speed_250',         'Cruising Fast',          'Reach an average speed of 250 knots.',          'gauge',     'performance', 'avg_speed_knots',     250,     690, 1, 8),
  ('speed_550',         'Supersonic',             'Reach an average speed of 550 knots.',          'gauge',     'performance', 'avg_speed_knots',     550,     700, 1, 25);

-- =========================================================================
-- 13 NEW ROUTE MISSIONS (free / requires_pro = 0)
-- distance_nm computed via ST_Distance_Sphere from the real airport coordinates.
-- Aircraft: 2 = Cessna 172 (beginner), 3 = Learjet 45 (intermediate), 5 = Boeing 737-900 (advanced/expert).
-- =========================================================================
INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Faro to Lisbon Coastal Hop', 'Short hop up the Portuguese Atlantic coast from Faro to Lisbon.', 'route', 'beginner', 25628, 25648, 180,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 80, 1, 1, 0, 2
FROM airports d, airports a WHERE d.id = 25628 AND a.id = 25648;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Naples to Rome Express', 'Quick coastal leg from Naples up to Rome Fiumicino.', 'route', 'beginner', 25365, 25358, 170,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 70, 1, 1, 0, 2
FROM airports d, airports a WHERE d.id = 25365 AND a.id = 25358;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Buffalo to Toronto Border Hop', 'A very short cross-border hop from Buffalo to Toronto Pearson.', 'route', 'beginner', 21461, 12061, 150,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 45, 1, 1, 0, 2
FROM airports d, airports a WHERE d.id = 21461 AND a.id = 12061;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Heraklion to Athens Aegean', 'Cross the Aegean Sea from Crete up to Athens.', 'route', 'beginner', 25150, 25141, 200,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 95, 1, 1, 0, 2
FROM airports d, airports a WHERE d.id = 25150 AND a.id = 25141;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Zurich to Frankfurt Rhine Run', 'Northbound business leg from Zurich to Frankfurt.', 'route', 'intermediate', 25783, 13237, 360,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 45, 1, 1, 0, 3
FROM airports d, airports a WHERE d.id = 25783 AND a.id = 13237;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Madrid to Lisbon Iberian Link', 'Cross the Iberian Peninsula from Madrid to Lisbon.', 'route', 'intermediate', 24645, 25648, 380,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 55, 1, 1, 0, 3
FROM airports d, airports a WHERE d.id = 24645 AND a.id = 25648;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Cancun to Miami Caribbean Return', 'Gulf crossing from Cancun back to Miami.', 'route', 'intermediate', 26611, 23122, 400,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 75, 1, 1, 0, 3
FROM airports d, airports a WHERE d.id = 26611 AND a.id = 23122;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Melbourne to Sydney Coastal', 'Southeast Australia hop from Melbourne up to Sydney.', 'route', 'intermediate', 46432, 46834, 380,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 70, 1, 1, 0, 3
FROM airports d, airports a WHERE d.id = 46432 AND a.id = 46834;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Christchurch to Auckland Strait', 'Fly the length of New Zealand from Christchurch to Auckland.', 'route', 'advanced', 29767, 29758, 620,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 70, 1, 1, 0, 5
FROM airports d, airports a WHERE d.id = 29767 AND a.id = 29758;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Denver to Chicago Plains Crossing', 'Eastbound crossing of the Great Plains from Denver to Chicago.', 'route', 'advanced', 21737, 23438, 680,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 115, 1, 1, 0, 5
FROM airports d, airports a WHERE d.id = 21737 AND a.id = 23438;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Brisbane to Melbourne Long Coast', 'Long eastern-seaboard run from Brisbane down to Melbourne.', 'route', 'advanced', 45496, 46432, 660,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 110, 1, 1, 0, 5
FROM airports d, airports a WHERE d.id = 45496 AND a.id = 46432;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Dubai to Frankfurt Continental', 'Ultra long-haul from Dubai across the Middle East and Europe to Frankfurt.', 'route', 'expert', 30398, 13237, 1300,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 360, 1, 1, 0, 5
FROM airports d, airports a WHERE d.id = 30398 AND a.id = 13237;

INSERT INTO missions (title, description, type, difficulty, departure_airport_id, arrival_airport_id, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, required_aircraft_id)
SELECT 'Sao Paulo to Santiago Andes', 'Long South American crossing over the Andes from Sao Paulo to Santiago.', 'route', 'expert', 32962, 33239, 1200,
  ROUND(ST_Distance_Sphere(POINT(d.longitude, d.latitude), POINT(a.longitude, a.latitude)) / 1852, 2), 210, 1, 1, 0, 5
FROM airports d, airports a WHERE d.id = 32962 AND a.id = 33239;

-- =========================================================================
-- 12 NEW DISCOVERY MISSIONS (free / requires_pro = 0)
-- Spawn coordinates set; aircraft chosen so its ceiling clears the spawn altitude.
-- =========================================================================
INSERT INTO missions (title, description, type, difficulty, reward_points, distance_nm, estimated_duration_min, is_active, is_enabled, requires_pro, spawn_latitude, spawn_longitude, spawn_altitude_ft, required_aircraft_id) VALUES
  ('Uluru Outback Discovery',     'Circle the iconic Uluru monolith in the Australian outback.',        'discovery', 'beginner',     180, 30.00, 30, 1, 1, 0, -25.3450000, 131.0360000,  4500, 2),
  ('Great Barrier Reef Skim',     'Low scenic run over the turquoise Great Barrier Reef.',              'discovery', 'beginner',     200, 60.00, 45, 1, 1, 0, -16.7000000, 146.0000000,  3500, 2),
  ('Monument Valley Buttes',      'Weave between the red sandstone buttes of Monument Valley.',         'discovery', 'beginner',     180, 35.00, 30, 1, 1, 0,  36.9980000, -110.0980000, 6500, 2),
  ('Angkor Wat Temples',          'Aerial tour of the ancient Angkor Wat temple complex.',             'discovery', 'beginner',     190, 30.00, 30, 1, 1, 0,  13.4120000, 103.8660000,  3500, 2),
  ('Taj Mahal and Agra',          'Scenic loop over the Taj Mahal and the city of Agra.',              'discovery', 'beginner',     190, 30.00, 30, 1, 1, 0,  27.1750000, 78.0420000,   3500, 2),
  ('Venice Lagoon Circuit',       'Trace the canals and islands of the Venice lagoon.',                'discovery', 'beginner',     180, 30.00, 30, 1, 1, 0,  45.4340000, 12.3390000,   2500, 2),
  ('Yosemite Valley Discovery',   'Soar over the granite cliffs and waterfalls of Yosemite Valley.',   'discovery', 'intermediate', 360, 45.00, 35, 1, 1, 0,  37.7450000, -119.5930000, 9500, 2),
  ('Santorini Caldera Loop',      'Orbit the volcanic caldera and white villages of Santorini.',       'discovery', 'intermediate', 360, 70.00, 40, 1, 1, 0,  36.3930000, 25.4610000,   4000, 2),
  ('Cappadocia Balloons',         'Drift over the fairy chimneys and balloons of Cappadocia.',         'discovery', 'intermediate', 360, 60.00, 40, 1, 1, 0,  38.6430000, 34.8290000,   5500, 2),
  ('Banff and Lake Louise',       'High mountain tour over Banff and the turquoise Lake Louise.',      'discovery', 'advanced',     620, 90.00, 50, 1, 1, 0,  51.4170000, -116.2180000, 11000, 3),
  ('Torres del Paine Spires',     'Navigate the granite spires of Patagonia''s Torres del Paine.',     'discovery', 'advanced',     640, 100.00, 55, 1, 1, 0, -50.9400000, -73.4000000, 9500, 3),
  ('Denali High Approach',        'High-altitude approach to North America''s highest peak, Denali.',  'discovery', 'expert',       950, 110.00, 50, 1, 1, 0,  63.0690000, -151.0070000, 16500, 5);

COMMIT;
