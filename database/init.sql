-- 1. ตาราง USER (ต้องสร้างก่อนเพราะตารางอื่นชี้มาที่นี่)
CREATE TABLE USER (
    id INT AUTO_INCREMENT PRIMARY KEY,
    strava_id VARCHAR(100) UNIQUE NOT NULL, -- UK
    display_name VARCHAR(150),
    access_token TEXT, -- ใช้ TEXT เพราะ Token มักจะมีความยาวมาก
    refresh_token TEXT,
    token_expires_at DATETIME,
    total_points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ตาราง DEVICE (เก็บข้อมูลกระถาง/อุปกรณ์)
CREATE TABLE DEVICE (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, -- FK
    device_id VARCHAR(100) UNIQUE NOT NULL, -- UK (เช่น MAC Address ของ ESP32) — identification
    auth_token_hash VARCHAR(64), -- SHA-256 hex ของ device token — authentication (plaintext token แสดงครั้งเดียวตอน register)
    display_name VARCHAR(150),
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- กำหนด Foreign Key เชื่อมไปหา USER
    FOREIGN KEY (user_id) REFERENCES USER(id) ON DELETE CASCADE
);

-- 3. ตาราง RUN_HISTORY (เก็บประวัติการวิ่ง)
CREATE TABLE RUN_HISTORY (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, -- FK
    strava_activity_id VARCHAR(100) UNIQUE NOT NULL, -- UK
    distance_km FLOAT,
    points_earned INT,
    run_at DATETIME,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES USER(id) ON DELETE CASCADE
);

-- 4. ตาราง ACTION_LOG (เก็บประวัติการกดรดน้ำ/ให้ปุ๋ย)
CREATE TABLE ACTION_LOG (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, -- FK
    device_id INT NOT NULL, -- FK
    action_type VARCHAR(50), -- เช่น 'water' หรือ 'fertilizer'
    status VARCHAR(50), -- เช่น 'pending', 'success', 'failed'
    points_deducted INT,
    duration_seconds INT,
    scheduled_at DATETIME,
    executed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES USER(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES DEVICE(id) ON DELETE CASCADE
);

-- 5. ตาราง SOIL_LOG (เก็บประวัติความชื้น)
CREATE TABLE SOIL_LOG (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL, -- FK
    moisture_percent INT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES DEVICE(id) ON DELETE CASCADE
);

-- 6. ตาราง AUTO_SCHEDULE (เก็บข้อมูลการตั้งเวลารดน้ำอัตโนมัติ)
CREATE TABLE AUTO_SCHEDULE (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL, -- FK
    action_type VARCHAR(50),
    cron_expression VARCHAR(100), -- รูปแบบเวลาการตั้งเวลา (Cron Job)
    duration_seconds INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES DEVICE(id) ON DELETE CASCADE
);