const https = require('https');

const symbols = [
  'nf_AU0', 'nf_AG0',
  'shfe_au0', 'shfe_ag0',
  'AU0', 'AG0',
  'SC0', // Crude Oil
];

const url = `https://hq.sinajs.cn/list=${symbols.join(',')}`;

https.get(url, {
  headers: { 'Referer': 'https://finance.sina.com.cn' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data);
  });
});
