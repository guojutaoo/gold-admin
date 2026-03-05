const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ensure this path matches actual DB path
const DB_PATH = path.join(__dirname, '../data/gold_admin.db');
console.log('Connecting to:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
  console.log('Connected.');
});

// Assume admin ID=1 exists
const userId = 1;
const asset = 'test';
const mode = 'manual';
const status = 'sent';
const content = 'manual test content';
const sentAt = new Date().toISOString();

db.run(
  `INSERT INTO notification_logs (user_id, asset, mode, status, content, sent_at) 
   VALUES (?, ?, ?, ?, ?, ?)`,
  [userId, asset, mode, status, content, sentAt],
  function(err) {
    if (err) {
      console.error('Insert failed:', err.message);
    } else {
      console.log('Insert success, ID:', this.lastID);
    }
    db.close();
  }
);
