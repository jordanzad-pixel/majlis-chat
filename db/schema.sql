-- Majlis PostgreSQL schema v1
BEGIN;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY,
 name varchar(40) NOT NULL,
 email text NOT NULL UNIQUE,
 salt text NOT NULL,
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rooms (
 id uuid PRIMARY KEY,
 name varchar(60) NOT NULL,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_members (
 room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY,
 room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 body varchar(3000) NOT NULL CHECK (length(trim(body))>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_room_time_idx ON messages(room_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash char(64) PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
COMMIT;
