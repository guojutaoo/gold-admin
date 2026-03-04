const API_BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:3001/api' 
  : '/api';

/**
 * 获取初懵 API 金价数据（通过后端代理）
 */
export async function fetchChumengPrices() {
  try {
    const url = `${API_BASE_URL}/gold-prices`;
    console.log('[ChumengPriceService] Fetching prices from:', url);
    console.log('[ChumengPriceService] Environment:', import.meta.env.DEV ? 'development' : 'production');

    const response = await fetch(url);

    console.log('[ChumengPriceService] Response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[ChumengPriceService] API Response:', JSON.stringify(data, null, 2));

    if (data.error) {
      throw new Error(`API error: ${data.error}`);
    }

    if (data.code !== 200) {
      throw new Error(`API error: ${data.msg || 'Unknown error'}`);
    }

    // 解析数据
    const result = {
      // 国内十大金店
      stores: data['国内十大金店'] || [],

      // 国际黄金
      international: {
        gold: parseInternationalItem(data['国际黄金'], '国际金价'),
        silver: parseInternationalItem(data['国际黄金'], '国际银价'),
        platinum: parseInternationalItem(data['国际黄金'], '国际铂金'),
        palladium: parseInternationalItem(data['国际黄金'], '国际钯金'),
      },

      // 国内黄金
      domestic: {
        gold: parseDomesticItem(data['国内黄金'], '国内金价'),
        silver: parseDomesticItem(data['国内黄金'], '国内银价'),
        investmentBar: parseDomesticItem(data['国内黄金'], '投资金条'),
        goldRecycle: parseDomesticItem(data['国内黄金'], '黄金回收价格'),
        platinumRecycle: parseDomesticItem(data['国内黄金'], '铂金回收价格'),
        gold18kRecycle: parseDomesticItem(data['国内黄金'], '18K金回收价格'),
        palladiumRecycle: parseDomesticItem(data['国内黄金'], '钯金回收价格'),
      },

      // 元数据
      meta: {
        time: data.time,
        timestamp: data.timestamp,
        execTime: data.exec_time,
        updated: new Date().toLocaleString('zh-CN')
      }
    };

    console.log('[ChumengPriceService] Parsed result:', result);
    return result;
  } catch (error) {
    console.error('[ChumengPriceService] Failed to fetch prices:', error);
    throw error;
  }
}

/**
 * 解析国际黄金数据项
 */
function parseInternationalItem(array, name) {
  if (!array || !Array.isArray(array)) return null;

  const item = array.find(i => i['品种'] === name);
  if (!item) return null;

  return {
    name: item['品种'],
    price: parseFloat(item['最新价']) || 0,
    change: parseFloat(item['涨跌']) || 0,
    changePercent: item['幅度'],
    high: parseFloat(item['最高价']) || 0,
    low: parseFloat(item['最低价']) || 0,
    date: item['报价时间']
  };
}

/**
 * 解析国内黄金数据项
 */
function parseDomesticItem(array, name) {
  if (!array || !Array.isArray(array)) return null;

  const item = array.find(i => i['品种'] === name);
  if (!item) return null;

  return {
    name: item['品种'],
    price: parseFloat(item['最新价']) || 0,
    change: item['涨跌'] === '-' ? null : parseFloat(item['涨跌']),
    changePercent: item['幅度'] === '-' ? null : item['幅度'],
    high: item['最高价'] === '-' ? null : parseFloat(item['最高价']),
    low: item['最低价'] === '-' ? null : parseFloat(item['最低价']),
    date: item['报价时间']
  };
}

/**
 * 获取金店价格统计
 */
export function getStorePriceStats(stores) {
  if (!stores || stores.length === 0) return null;

  const goldPrices = stores
    .filter(s => s['单位'] === '元/克' && s['黄金价格'] !== '-')
    .map(s => parseFloat(s['黄金价格']))
    .filter(p => !isNaN(p));

  if (goldPrices.length === 0) return null;

  return {
    avg: (goldPrices.reduce((a, b) => a + b, 0) / goldPrices.length).toFixed(0),
    min: Math.min(...goldPrices),
    max: Math.max(...goldPrices),
    count: goldPrices.length
  };
}
