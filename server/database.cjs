const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'gold_admin.db');

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// 初始化数据库表
function initDatabase() {
  db.serialize(() => {
    // 用户表
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'active',
        plan TEXT DEFAULT 'trial',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    ensureUsersStatusUpdatedAtColumn();
    normalizeUsersIdentityFields();

    // 用户配置表
    db.run(`
      CREATE TABLE IF NOT EXISTS user_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        monitor_gold BOOLEAN DEFAULT 1,
        monitor_silver BOOLEAN DEFAULT 0,
        notify_mode TEXT DEFAULT 'interval',
        interval_hours INTEGER DEFAULT 2,
        drop_threshold REAL DEFAULT 2.0,
        price_threshold REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 通知日志表
    db.run(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        asset TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        content TEXT,
        html_content TEXT,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    ensureNotificationLogsHtmlContentColumn();

    // 金价缓存表
    db.run(`
      CREATE TABLE IF NOT EXISTS price_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT,
        data_type TEXT,
        data_json TEXT,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS form_tokens (
        token TEXT PRIMARY KEY,
        bound_email TEXT,
        status TEXT DEFAULT 'active',
        bound_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized');
    
    // 创建默认管理员账户
    createDefaultAdmin();
  });
}

function ensureUsersStatusUpdatedAtColumn() {
  db.all('PRAGMA table_info(users)', [], (err, rows) => {
    if (err) {
      console.error('Error checking users table schema:', err);
      return;
    }

    const hasColumn = (rows || []).some((r) => r?.name === 'status_updated_at');
    if (!hasColumn) {
      db.run(
        'ALTER TABLE users ADD COLUMN status_updated_at DATETIME',
        (alterErr) => {
          if (alterErr) {
            console.error('Error adding status_updated_at column:', alterErr);
            return;
          }
          db.run(
            'UPDATE users SET status_updated_at = created_at WHERE status_updated_at IS NULL',
            (updateErr) => {
              if (updateErr) {
                console.error('Error backfilling status_updated_at:', updateErr);
              }
            },
          );
        },
      );
      return;
    }

    db.run(
      'UPDATE users SET status_updated_at = created_at WHERE status_updated_at IS NULL',
      (updateErr) => {
        if (updateErr) {
          console.error('Error normalizing status_updated_at:', updateErr);
        }
      },
    );
  });
}

function normalizeUsersIdentityFields() {
  db.run(
    `UPDATE users
     SET email = TRIM(email, char(9) || char(10) || char(13) || ' '),
         user_id = TRIM(user_id, char(9) || char(10) || char(13) || ' ')
     WHERE email != TRIM(email, char(9) || char(10) || char(13) || ' ')
        OR user_id != TRIM(user_id, char(9) || char(10) || char(13) || ' ')`,
    (err) => {
      if (err) {
        console.error('Error normalizing user identity fields:', err);
      }
    },
  );
}

// 创建默认管理员
const bcrypt = require('bcryptjs');

function createDefaultAdmin() {
  const adminEmail = 'admin@gold.com';
  const adminPassword = 'admin123';
  
  db.get('SELECT id FROM users WHERE email = ?', [adminEmail], (err, row) => {
    if (err) {
      console.error('Error checking admin:', err);
      return;
    }
    
    if (!row) {
      const passwordHash = bcrypt.hashSync(adminPassword, 10);
      db.run(
        `INSERT INTO users (user_id, name, email, password_hash, role, status, plan) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['U-ADMIN', '管理员', adminEmail, passwordHash, 'admin', 'active', 'paid'],
        (err) => {
          if (err) {
            console.error('Error creating admin:', err);
          } else {
            console.log('Default admin account created');
          }
        }
      );
    }
  });
}

// 数据库操作方法
function ensureNotificationLogsHtmlContentColumn() {
  db.all('PRAGMA table_info(notification_logs)', [], (err, rows) => {
    if (err) return;
    const hasColumn = (rows || []).some((r) => r?.name === 'html_content');
    if (!hasColumn) {
      db.run('ALTER TABLE notification_logs ADD COLUMN html_content TEXT', (e) => {
        if (e) console.error('Error adding html_content column:', e);
      });
    }
  });
}

const dbOperations = {
  // 用户相关
  createUser: (userData) => {
    return new Promise((resolve, reject) => {
      const { user_id, name, email, password_hash, role, status, plan } = userData;
      db.run(
        `INSERT INTO users (user_id, name, email, password_hash, role, status, plan) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user_id, name, email, password_hash, role || 'user', status || 'active', plan || 'trial'],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...userData });
        }
      );
    });
  },

  getUserByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT *
         FROM users
         WHERE LOWER(TRIM(email, char(9) || char(10) || char(13) || ' '))
           = LOWER(TRIM(?, char(9) || char(10) || char(13) || ' '))`,
        [email],
        (err, row) => {
        if (err) reject(err);
        else resolve(row);
        },
      );
    });
  },

  getUserById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  getAllUsers: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  updateUser: (id, updates) => {
    return new Promise((resolve, reject) => {
      const keys = Object.keys(updates || {});
      if (!keys.length) {
        resolve({ changes: 0 });
        return;
      }

      const values = keys.map((k) => updates[k]);
      const assignments = keys.map((key) => `${key} = ?`);
      if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
        assignments.push('status_updated_at = CURRENT_TIMESTAMP');
      }
      assignments.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      db.run(
        `UPDATE users SET ${assignments.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  deleteUser: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  // 用户配置相关
  getUserConfig: (userId) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM user_configs WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  createOrUpdateUserConfig: (userId, config) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT id FROM user_configs WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const fields = Object.keys(config);
        const values = Object.values(config);

        if (row) {
          // 更新
          const setClause = fields.map(f => `${f} = ?`).join(', ');
          values.push(userId);
          db.run(
            `UPDATE user_configs SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
            values,
            function(err) {
              if (err) reject(err);
              else resolve({ id: row.id, user_id: userId, ...config });
            }
          );
        } else {
          // 创建
          const fieldNames = ['user_id', ...fields].join(', ');
          const placeholders = fields.map(() => '?').join(', ');
          db.run(
            `INSERT INTO user_configs (user_id, ${fieldNames.replace('user_id, ', '')}) VALUES (?, ${placeholders})`,
            [userId, ...values],
            function(err) {
              if (err) reject(err);
              else resolve({ id: this.lastID, user_id: userId, ...config });
            }
          );
        }
      });
    });
  },

  // 通知日志相关
  createNotificationLog: (log) => {
    return new Promise((resolve, reject) => {
      const { user_id, asset, mode, status, content, html_content, sent_at } = log;
      db.run(
        `INSERT INTO notification_logs (user_id, asset, mode, status, content, html_content, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user_id, asset, mode, status, content, html_content || null, sent_at],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...log });
        }
      );
    });
  },

  getUserNotificationLogs: (userId, limit = 50) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM notification_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  getAllNotificationLogs: (limit = 100) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT l.*, u.name as user_name, u.email 
         FROM notification_logs l 
         JOIN users u ON l.user_id = u.id 
         ORDER BY l.created_at DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  getLatestSentNotificationLog: (userId, asset, mode) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT *
         FROM notification_logs
         WHERE user_id = ? AND asset = ? AND mode = ? AND status = 'sent'
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, asset, mode],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  },

  getLatestSentNotificationLogByContentLike: (userId, asset, mode, contentLike) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT *
         FROM notification_logs
         WHERE user_id = ? AND asset = ? AND mode = ? AND status = 'sent' AND content LIKE ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, asset, mode, contentLike],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  },

  // 金价缓存相关
  savePriceCache: (source, dataType, dataJson) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO price_cache (source, data_type, data_json) VALUES (?, ?, ?)',
        [source, dataType, JSON.stringify(dataJson)],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  },

  getLatestPriceCache: (source, dataType) => {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM price_cache WHERE source = ? AND data_type = ? ORDER BY fetched_at DESC LIMIT 1',
        [source, dataType],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              row.data_json = JSON.parse(row.data_json);
            }
            resolve(row);
          }
        }
      );
    });
  },

  getFormToken: (token) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM form_tokens WHERE token = ?', [token], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  ensureFormToken: (token) => {
    return new Promise((resolve, reject) => {
      db.run('INSERT OR IGNORE INTO form_tokens (token) VALUES (?)', [token], (err) => {
        if (err) reject(err);
        else resolve({ token });
      });
    });
  },

  bindFormTokenToEmail: (token, email) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM form_tokens WHERE token = ?', [token], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('Token not found'));
          return;
        }

        if (row.status !== 'active') {
          reject(new Error('Token is not active'));
          return;
        }

        if (row.bound_email && row.bound_email.toLowerCase() !== String(email).toLowerCase()) {
          reject(new Error('Token already bound to another email'));
          return;
        }

        if (!row.bound_email) {
          db.run(
            'UPDATE form_tokens SET bound_email = ?, bound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE token = ?',
            [email, token],
            (err) => {
              if (err) reject(err);
              else resolve({ token, bound_email: email });
            }
          );
          return;
        }

        resolve({ token, bound_email: row.bound_email });
      });
    });
  },

  // 生成用户ID
  generateUserId: () => {
    return new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) reject(err);
        else {
          const count = row.count + 1;
          resolve(`U-${1000 + count}`);
        }
      });
    });
  }
  ,

  expireOverdueActiveUsers: () => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users
         SET status = 'inactive',
             status_updated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE role != 'admin'
           AND status = 'active'
           AND status_updated_at <= datetime('now', '-30 days')`,
        [],
        function(err) {
          if (err) {
            if (String(err.message || '').includes('no such column: status_updated_at')) {
              resolve({ skipped: true, changes: 0 });
              return;
            }
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        }
      );
    });
  },
};

module.exports = { db, dbOperations };
