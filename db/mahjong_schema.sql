-- Mahjong Solitaire schema (mysql-rpg / DATABASE_RPG_URL)
-- Numeric-only conventions where applicable. No string enums.

CREATE TABLE IF NOT EXISTS mahjong_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    ip VARCHAR(45) NOT NULL DEFAULT 'unknown',
    location VARCHAR(255) NOT NULL DEFAULT 'unknown',
    total_points BIGINT NOT NULL DEFAULT 0,
    best_iq DECIMAL(6,1) NOT NULL DEFAULT 0,
    best_level INT NOT NULL DEFAULT 0,
    games_won INT NOT NULL DEFAULT 0,
    rank_order INT NOT NULL DEFAULT 1,
    rank_updated_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_mahjong_users_user (user_id),
    UNIQUE KEY idx_mahjong_users_email (email),
    KEY idx_mahjong_users_points (total_points),
    KEY idx_mahjong_users_iq (best_iq),
    KEY idx_mahjong_users_rank (rank_order)
);

CREATE TABLE IF NOT EXISTS mahjong_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    level INT NOT NULL,
    tiles INT NOT NULL,
    time_ms INT NOT NULL,
    points INT NOT NULL,
    iq DECIMAL(6,1) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mahjong_scores_user (user_id),
    KEY idx_mahjong_scores_created (created_at),
    CONSTRAINT fk_mahjong_scores_user FOREIGN KEY (user_id) REFERENCES mahjong_users (user_id) ON DELETE CASCADE
);

-- Configurable rank ladder (rank_order 1 = lowest / entry rank).
CREATE TABLE IF NOT EXISTS mahjong_ranks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rank_order INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(16) NOT NULL DEFAULT '#c8d0dc',
    icon VARCHAR(16) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_mahjong_ranks_order (rank_order)
);

-- Key/value settings for the rank system (all numeric values).
CREATE TABLE IF NOT EXISTS mahjong_settings (
    setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
    setting_value BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
