const API_KEY = '78VP21JPZWYAG5MF';
const BASE_URL = 'https://www.alphavantage.co/query';

// GLD: SPDR Gold Shares (黄金ETF)
// SLV: iShares Silver Trust (白银ETF)

export async function fetchGoldPrice() {
  try {
    const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=GLD&apikey=${API_KEY}`;
    console.log('[PriceService] Fetching gold price from:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[PriceService] Gold API Response:', JSON.stringify(data, null, 2));

    if (data['Global Quote']) {
      const quote = data['Global Quote'];
      const price = parseFloat(quote['05. price']);
      const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

      // GLD 价格转换为每克人民币 (近似换算)
      // GLD 是每份价格，1份约代表0.0936盎司黄金
      // 1盎司 = 31.1035克
      // 这里简化处理，直接按比例显示
      const pricePerGram = price * 0.21; // 近似换算

      const result = {
        price: pricePerGram,
        change: changePercent,
        updated: new Date().toLocaleString('zh-CN'),
        raw: quote
      };

      console.log('[PriceService] Gold price parsed:', result);
      return result;
    }

    if (data['Note']) {
      console.warn('[PriceService] API limit reached:', data['Note']);
    }

    if (data['Information']) {
      console.warn('[PriceService] API Info:', data['Information']);
    }

    throw new Error(data['Note'] || data['Information'] || 'Invalid response');
  } catch (error) {
    console.error('[PriceService] Failed to fetch gold price:', error);
    throw error;
  }
}

export async function fetchSilverPrice() {
  try {
    const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=SLV&apikey=${API_KEY}`;
    console.log('[PriceService] Fetching silver price from:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[PriceService] Silver API Response:', JSON.stringify(data, null, 2));

    if (data['Global Quote']) {
      const quote = data['Global Quote'];
      const price = parseFloat(quote['05. price']);
      const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

      // SLV 价格转换为每克人民币 (近似换算)
      const pricePerGram = price * 0.035; // 近似换算

      const result = {
        price: pricePerGram,
        change: changePercent,
        updated: new Date().toLocaleString('zh-CN'),
        raw: quote
      };

      console.log('[PriceService] Silver price parsed:', result);
      return result;
    }

    if (data['Note']) {
      console.warn('[PriceService] API limit reached:', data['Note']);
    }

    if (data['Information']) {
      console.warn('[PriceService] API Info:', data['Information']);
    }

    throw new Error(data['Note'] || data['Information'] || 'Invalid response');
  } catch (error) {
    console.error('[PriceService] Failed to fetch silver price:', error);
    throw error;
  }
}

export async function fetchPrices() {
  console.log('[PriceService] Starting to fetch prices...');

  try {
    const [gold, silver] = await Promise.all([
      fetchGoldPrice(),
      fetchSilverPrice()
    ]);

    const result = { gold, silver };
    console.log('[PriceService] All prices fetched successfully:', result);
    return result;
  } catch (error) {
    console.error('[PriceService] Failed to fetch prices:', error);
    throw error;
  }
}
