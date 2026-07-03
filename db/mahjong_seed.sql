-- Mahjong Solitaire seed data (mysql-rpg / DATABASE_RPG_URL)
-- The tile catalog and level layouts are defined in code (src/game/mahjong).
-- Users and scores are created at runtime.

-- 20-tier rank ladder (rank_order 1 = entry rank). Fully configurable.
INSERT INTO mahjong_ranks (rank_order, name, color, icon) VALUES
    (1,  'Madeira',     '#8a6a4b', '🪵'),
    (2,  'Pedra',       '#9aa0a8', '🪨'),
    (3,  'Ferro',       '#7d8791', '⚙️'),
    (4,  'Bronze',      '#b0793a', '🥉'),
    (5,  'Prata',       '#c7ccd4', '🥈'),
    (6,  'Ouro',        '#e7c873', '🥇'),
    (7,  'Platina',     '#a8d8d8', '🔷'),
    (8,  'Esmeralda',   '#3fbf7f', '💚'),
    (9,  'Topázio',     '#f2b632', '💛'),
    (10, 'Ametista',    '#9966cc', '💜'),
    (11, 'Safira',      '#2f6fd6', '💙'),
    (12, 'Rubi',        '#d63a52', '❤️'),
    (13, 'Diamante',    '#7fd4f0', '💎'),
    (14, 'Ônix',        '#3a3f4a', '🖤'),
    (15, 'Obsidiana',   '#4a3a5f', '🔮'),
    (16, 'Mestre',      '#d67f2f', '🎖️'),
    (17, 'Grão-Mestre', '#c93f3f', '🏵️'),
    (18, 'Campeão',     '#e7a83a', '🏆'),
    (19, 'Lenda',       '#f0d264', '🌟'),
    (20, 'Imortal',     '#ffd700', '👑')
ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), icon = VALUES(icon);

-- Rank system settings (numeric values only).
-- rank_up_days: evaluation window length in days.
-- rank_up_top_n: how many players per rank are promoted each window.
-- rank_last_period: last processed period index (sweep guard, managed by the server).
INSERT INTO mahjong_settings (setting_key, setting_value) VALUES
    ('rank_up_days', 7),
    ('rank_up_top_n', 3),
    ('rank_last_period', 0)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
