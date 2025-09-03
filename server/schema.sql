PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ENGLISH','FRENCH')),
  hourly_rate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','OCCUPIED','MAINTENANCE')),
  light_on INTEGER NOT NULL DEFAULT 0,
  last_maintenance INTEGER DEFAULT NULL,
  total_hours_played INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  table_id INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration_ms INTEGER DEFAULT 0,
  billed_minutes INTEGER DEFAULT 0,
  amount INTEGER DEFAULT 0,
  is_friendly INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT,
  paused_ms INTEGER NOT NULL DEFAULT 0,
  last_resume_time INTEGER,
  break_count INTEGER DEFAULT 0,
  payment_method TEXT DEFAULT 'CASH' CHECK (payment_method IN ('CASH','UPI','CARD')),
  payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID','PARTIAL')),
  discount_percent INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY(table_id) REFERENCES tables(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_table_time ON sessions(table_id, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_name, customer_phone);

CREATE TABLE IF NOT EXISTS daily_summaries (
  date TEXT PRIMARY KEY,
  total_earnings INTEGER NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  friendly_games INTEGER NOT NULL DEFAULT 0,
  english_earnings INTEGER NOT NULL DEFAULT 0,
  french_earnings INTEGER NOT NULL DEFAULT 0,
  cash_earnings INTEGER NOT NULL DEFAULT 0,
  upi_earnings INTEGER NOT NULL DEFAULT 0,
  card_earnings INTEGER NOT NULL DEFAULT 0,
  peak_hour TEXT DEFAULT NULL,
  avg_session_duration INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  total_sessions INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  membership_type TEXT DEFAULT 'REGULAR' CHECK (membership_type IN ('REGULAR','VIP','PREMIUM')),
  discount_percent INTEGER DEFAULT 0,
  last_visit INTEGER,
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS hardware_logs (
  id INTEGER PRIMARY KEY,
  table_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY(table_id) REFERENCES tables(id)
);

-- Triggers for automatic timestamps
CREATE TRIGGER IF NOT EXISTS update_tables_timestamp 
  AFTER UPDATE ON tables
  BEGIN
    UPDATE tables SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
  END;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
 full_name TEXT NOT NULL,
 email TEXT,
 is_active INTEGER NOT NULL DEFAULT 1,
 last_login INTEGER,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
 updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Sessions table for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
 FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Settings table for configurable options
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 description TEXT,
 updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
 updated_by INTEGER,
 FOREIGN KEY(updated_by) REFERENCES users(id)
);

-- Indexes for users and sessions
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Triggers for automatic timestamps
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
 AFTER UPDATE ON users
 BEGIN
   UPDATE users SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
 END;

-- Insert default admin user (password: admin123)
INSERT OR IGNORE INTO users (username, password_hash, role, full_name, email)
VALUES ('admin', '$2b$10$MmsyAQ/AIYtj9P2AKqK7xuVFZXrkHqSzGO/b4z6oxcJ/nWtpCm6oG', 'admin', 'Administrator', 'admin@snookerparlor.com');

-- Insert default employee user (password: employee123)
INSERT OR IGNORE INTO users (username, password_hash, role, full_name, email)
VALUES ('employee', '$2b$10$as1y4GwSTgV0B.4w6Ap0beEQOWRKrZo4dtSRqxKWOt2XKXFSL3PBa', 'employee', 'Employee', 'employee@snookerparlor.com');

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('parlor_name', 'Snooker Parlor', 'Name of the snooker parlor'),
('default_english_rate', '300', 'Default hourly rate for English tables (in rupees)'),
('default_french_rate', '300', 'Default hourly rate for French tables (in rupees)'),
('session_timeout', '24', 'User session timeout in hours'),
('allow_friendly_games', 'true', 'Allow friendly games (no billing)'),
('auto_backup_enabled', 'true', 'Enable automatic database backups');