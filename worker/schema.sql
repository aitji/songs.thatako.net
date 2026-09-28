CREATE TABLE
    IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, -- YYYY-MM-DD (utc+7)
        open_at INTEGER NOT NULL, -- epoch ms
        close_at INTEGER NOT NULL, -- epoch ms
        request_cap INTEGER NOT NULL DEFAULT 2,
        request_open INTEGER NOT NULL DEFAULT 1, -- PR pause/resume switch
        created_at INTEGER NOT NULL
    );

CREATE TABLE
    IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        youtube_id TEXT NOT NULL,
        title TEXT,
        channel TEXT,
        nickname TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        source TEXT NOT NULL DEFAULT 'student',
        position INTEGER,
        skip_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        played_at INTEGER,
        skipped_at INTEGER,
        reviewed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions (id)
    );

CREATE INDEX IF NOT EXISTS idx_requests_session ON requests (session_id);

CREATE INDEX IF NOT EXISTS idx_requests_device ON requests (session_id, device_id);

CREATE INDEX IF NOT EXISTS idx_requests_youtube ON requests (session_id, youtube_id);

CREATE TABLE
    IF NOT EXISTS login_attempts (
        ip TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        window_start INTEGER NOT NULL
    );