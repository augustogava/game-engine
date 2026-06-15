-- Mahjong Solitaire schema (mysql-rpg / DATABASE_RPG_URL)
-- Numeric-only conventions where applicable. No string enums.

CREATE TABLE IF NOT EXISTS mahjong_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    ip VARCHAR(45) NOT NULL DEFAULT 'unknown',
    location VARCHAR(255) NOT NULL DEFAULT 'unknown',
    total_points BIGINT NOT NULL DEFAULT 0,
    best_iq INT NOT NULL DEFAULT 0,
    best_level INT NOT NULL DEFAULT 0,
    games_won INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_mahjong_users_user (user_id),
    UNIQUE KEY idx_mahjong_users_email (email),
    KEY idx_mahjong_users_points (total_points),
    KEY idx_mahjong_users_iq (best_iq)
);

CREATE TABLE IF NOT EXISTS mahjong_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    level INT NOT NULL,
    tiles INT NOT NULL,
    time_ms INT NOT NULL,
    points INT NOT NULL,
    iq INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mahjong_scores_user (user_id),
    KEY idx_mahjong_scores_created (created_at),
    CONSTRAINT fk_mahjong_scores_user FOREIGN KEY (user_id) REFERENCES mahjong_users (user_id) ON DELETE CASCADE
);
