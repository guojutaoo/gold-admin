const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { generateIntervalHtml, generateThresholdHtml, generateDropHtml } = require('../server/email_templates.cjs');

const DB_PATH = path.join(__dirname, '../data/gold_admin.db');
const db = new sqlite3.Database(DB_PATH);

const userId = 1; // Admin ID
const mockTime = new Date().toISOString();

// ==========================================
// 1. 定时发送邮件 (Interval)
// ==========================================
const mockBenchmark = { 
  price: '1154.20', 
  label: '国内基准金价',
  changePercent: '-1.52'
};
const mockSavings = { 
  price: '1155.32', 
  label: '积存金(工行估算)',
  changePercent: '-1.51'
};
const mockJewelry = { 
  price: '1334.82', 
  label: '品牌首饰金(周大福等)',
  changePercent: '-1.45'
};
const mockSilver = {
  price: '21.65',
  label: '国内白银',
  changePercent: '-2.25'
};

const htmlInterval = generateIntervalHtml({
  benchmarkGold: mockBenchmark,
  savingsGold: mockSavings,
  jewelryGold: mockJewelry,
  silver: mockSilver,
  time: mockTime,
  interval: 2
});

db.run(
  `INSERT INTO notification_logs (user_id, asset, mode, status, content, html_content, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [userId, 'all', 'interval', 'sent', `interval=2;fetched_at=${mockTime};mock=true`, htmlInterval, mockTime],
  function(err) {
    if (err) console.error('Interval Insert failed:', err);
    else console.log('✅ Interval Mock inserted! ID:', this.lastID);
  }
);

// ==========================================
// 2. 价格波动报警邮件 (Drop Alert - Percentage)
// ==========================================
const htmlDrop = generateDropHtml({
  asset: 'gold',
  label: '国内基准金价',
  price: '1120.00',
  changePercent: '-2.52', // 跌幅超过阈值
  threshold: '2.0',       // 设定阈值 2%
  time: mockTime,
  direction: 'down'
});

db.run(
  `INSERT INTO notification_logs (user_id, asset, mode, status, content, html_content, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [userId, 'gold', 'drop', 'sent', `dir=down;category=benchmark;label=国内基准金价;change_percent=-2.52;threshold=2.0;fetched_at=${mockTime}`, htmlDrop, mockTime],
  function(err) {
    if (err) console.error('Drop Alert Insert failed:', err);
    else {
      console.log('✅ Drop Alert Mock inserted! ID:', this.lastID);
      db.close();
    }
  }
);
