const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/gold-prices',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('--- Gold Prices ---');
      console.log(JSON.stringify(json.gold, null, 2));
      console.log('--- Silver Prices ---');
      console.log(JSON.stringify(json.silver, null, 2));
      console.log('--- Exchange Rate ---');
      console.log(json.exchange_rate);
    } catch (e) {
      console.error('Parse error:', e);
      console.log('Raw:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.end();
