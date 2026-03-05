const https = require('https');

// Test various potential symbols for Gold/Silver
const symbols = [
  'hf_GC', 'hf_SI',       // COMEX
  'fx_susdcny',           // Forex USD/CNY (Guess)
  'USDCNY',               // Another guess
  'rate_usd_cny',         // Another guess
  'wh_usd_cny',           // SAFE rate?
];

const url = `https://hq.sinajs.cn/list=${symbols.join(',')}`;

console.log('Fetching:', url);

https.get(url, {
  headers: {
    'Referer': 'https://finance.sina.com.cn',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('\n--- Raw Response ---');
    console.log(data);
    
    console.log('\n--- Parsed Attempt ---');
    const matches = data.matchAll(/var hq_str_(\w+)="([^"]*)";/g);
    for (const match of matches) {
      const sym = match[1];
      const val = match[2];
      const parts = val.split(',');
      
      let price = 0;
      let name = parts[0] || sym;
      let unitGuess = '?';
      
      // Heuristic parsing
      if (sym.startsWith('hf_')) {
        price = parseFloat(parts[0]);
        unitGuess = 'USD/oz';
      } else if (sym.startsWith('g_')) {
        // Bank Gold: often part[0] is buy price, part[1] is sell, part[2] is last?
        // Or simply part[0] is price? Usually Sina bank gold is simple CSV.
        price = parseFloat(parts[0]);
        unitGuess = 'CNY/g';
      } else if (sym === 'AU0' || sym === 'AG0') {
        // Futures: Name, Time, LastPrice, Open, High, Low...
        // Format: Name, Time, Last, Open, High, Low, ...
        // Wait, checking Sina Futures format:
        // var hq_str_AU0="黄金连,150000,574.86,575.00,576.00,573.00,145959,573.90,575.20,12345,23,45,2025-03-05,..."
        // part[0]=Name, part[1]=Time?, part[2]=LastPrice?
        // Actually Sina Futures (inner) format is:
        // 0: Current Price
        // ...
        // Wait, let's look at the raw output to be sure.
        price = parseFloat(parts[0]); // Often this is wrong for Futures via `list=`
        // For `AU0` specifically, Sina returns: 
        // var hq_str_AU0="574.86,0.17,573.90,575.00,576.00,573.00,150000,573.90,575.20,12345,..."
        // 0: Price, 1: Change, 2: Buy, 3: Sell, 4: High, 5: Low, 6: Time, 7: PrevClose...
        unitGuess = (sym === 'AG0' ? 'CNY/kg' : 'CNY/g');
      } else {
        price = parseFloat(parts[3]) || parseFloat(parts[0]); // Stock/Spot standard format often part[3] is current
      }
      
      console.log(`${sym.padEnd(12)} | Price: ${price.toFixed(2).padEnd(8)} | Unit(Guess): ${unitGuess} | RawLen: ${parts.length}`);
    }
  });
}).on('error', err => console.error(err));
