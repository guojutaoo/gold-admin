// 新浪财经接口 - 国内金银价格
const SINA_API_URL = 'https://hq.sinajs.cn/list';

/**
 * 解析新浪财经返回的字符串
 * 格式: var hq_str_XXX="..."
 */
function parseSinaResponse(responseText, symbol) {
  console.log(`[SinaPriceService] Raw response for ${symbol}:`, responseText);

  const match = responseText.match(/var hq_str_\w+="([^"]*)"/);
  if (!match || !match[1]) {
    throw new Error(`Invalid response format for ${symbol}`);
  }

  const data = match[1].split(',');
  console.log(`[SinaPriceService] Parsed data for ${symbol}:`, data);

  return data;
}

/**
 * 获取 COMEX 黄金期货价格 (美元/盎司)
 * hf_GC: 纽约商品交易所黄金期货
 */
export async function fetchCOMEXGold() {
  try {
    const url = `${SINA_API_URL}=hf_GC`;
    console.log('[SinaPriceService] Fetching COMEX Gold from:', url);

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn'
      }
    });

    const text = await response.text();
    const data = parseSinaResponse(text, 'hf_GC');

    // hf_GC 数据格式:
    // [0] 最新价, [1] 涨跌, [2] 买入价, [3] 卖出价, [4] 最高价, [5] 最低价,
    // [6] 时间, [7] 昨收, [8] 开盘价, [9] 持仓量, [10] 买量, [11] 卖量,
    // [12] 日期, [13] 名称, [14] 成交量

    const result = {
      symbol: 'GC',
      name: 'COMEX黄金期货',
      price: parseFloat(data[0]) || 0,           // 最新价
      change: parseFloat(data[1]) || 0,          // 涨跌额
      bid: parseFloat(data[2]) || 0,             // 买入价
      ask: parseFloat(data[3]) || 0,             // 卖出价
      high: parseFloat(data[4]) || 0,            // 最高价
      low: parseFloat(data[5]) || 0,             // 最低价
      time: data[6] || '',                       // 时间
      previousClose: parseFloat(data[7]) || 0,   // 昨收
      open: parseFloat(data[8]) || 0,            // 开盘价
      openInterest: parseInt(data[9]) || 0,      // 持仓量
      bidVolume: parseInt(data[10]) || 0,        // 买量
      askVolume: parseInt(data[11]) || 0,        // 卖量
      date: data[12] || '',                      // 日期
      volume: parseInt(data[14]) || 0,           // 成交量
      unit: '美元/盎司',
      updated: new Date().toLocaleString('zh-CN')
    };

    // 计算涨跌幅
    if (result.previousClose > 0) {
      result.changePercent = ((result.price - result.previousClose) / result.previousClose * 100).toFixed(2);
    } else {
      result.changePercent = '0.00';
    }

    console.log('[SinaPriceService] COMEX Gold parsed:', result);
    return result;
  } catch (error) {
    console.error('[SinaPriceService] Failed to fetch COMEX Gold:', error);
    throw error;
  }
}

/**
 * 获取 COMEX 白银期货价格 (美元/盎司)
 * hf_SI: 纽约商品交易所白银期货
 */
export async function fetchCOMEXSilver() {
  try {
    const url = `${SINA_API_URL}=hf_SI`;
    console.log('[SinaPriceService] Fetching COMEX Silver from:', url);

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn'
      }
    });

    const text = await response.text();
    const data = parseSinaResponse(text, 'hf_SI');

    // hf_SI 数据格式与 hf_GC 相同

    const result = {
      symbol: 'SI',
      name: 'COMEX白银期货',
      price: parseFloat(data[0]) || 0,
      change: parseFloat(data[1]) || 0,
      bid: parseFloat(data[2]) || 0,
      ask: parseFloat(data[3]) || 0,
      high: parseFloat(data[4]) || 0,
      low: parseFloat(data[5]) || 0,
      time: data[6] || '',
      previousClose: parseFloat(data[7]) || 0,
      open: parseFloat(data[8]) || 0,
      openInterest: parseInt(data[9]) || 0,
      bidVolume: parseInt(data[10]) || 0,
      askVolume: parseInt(data[11]) || 0,
      date: data[12] || '',
      volume: parseInt(data[14]) || 0,
      unit: '美元/盎司',
      updated: new Date().toLocaleString('zh-CN')
    };

    if (result.previousClose > 0) {
      result.changePercent = ((result.price - result.previousClose) / result.previousClose * 100).toFixed(2);
    } else {
      result.changePercent = '0.00';
    }

    console.log('[SinaPriceService] COMEX Silver parsed:', result);
    return result;
  } catch (error) {
    console.error('[SinaPriceService] Failed to fetch COMEX Silver:', error);
    throw error;
  }
}

/**
 * 获取沪金主力合约价格 (人民币/克)
 * AU0: 上海期货交易所黄金主力合约
 */
export async function fetchShanghaiGold() {
  try {
    const url = `${SINA_API_URL}=AU0`;
    console.log('[SinaPriceService] Fetching Shanghai Gold from:', url);

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn'
      }
    });

    const text = await response.text();
    const data = parseSinaResponse(text, 'AU0');

    // AU0 数据格式:
    // [0] 名称, [1] 时间, [2] 最新价, [3] 昨收, [4] 今开, [5] 最高价,
    // [6] 最低价, [7] 买入价, [8] 卖出价, [9] 持仓量, [10] 成交量,
    // [11] 买量, [12] 卖量, [13] 日期, [14] 涨停价, [15] 跌停价,
    // [16-23] 多档价格...

    const result = {
      symbol: 'AU0',
      name: data[0] || '沪金主力',
      price: parseFloat(data[2]) || 0,           // 最新价
      previousClose: parseFloat(data[3]) || 0,   // 昨收
      open: parseFloat(data[4]) || 0,            // 今开
      high: parseFloat(data[5]) || 0,            // 最高价
      low: parseFloat(data[6]) || 0,             // 最低价
      bid: parseFloat(data[7]) || 0,             // 买入价
      ask: parseFloat(data[8]) || 0,             // 卖出价
      openInterest: parseInt(data[9]) || 0,      // 持仓量
      volume: parseInt(data[10]) || 0,           // 成交量
      bidVolume: parseInt(data[11]) || 0,        // 买量
      askVolume: parseInt(data[12]) || 0,        // 卖量
      date: data[13] || '',                      // 日期
      limitUp: parseFloat(data[14]) || 0,        // 涨停价
      limitDown: parseFloat(data[15]) || 0,      // 跌停价
      unit: '元/克',
      updated: new Date().toLocaleString('zh-CN')
    };

    // 计算涨跌
    result.change = result.price - result.previousClose;
    if (result.previousClose > 0) {
      result.changePercent = ((result.change) / result.previousClose * 100).toFixed(2);
    } else {
      result.changePercent = '0.00';
    }

    console.log('[SinaPriceService] Shanghai Gold parsed:', result);
    return result;
  } catch (error) {
    console.error('[SinaPriceService] Failed to fetch Shanghai Gold:', error);
    throw error;
  }
}

/**
 * 获取沪银主力合约价格 (人民币/千克)
 * AG0: 上海期货交易所白银主力合约
 */
export async function fetchShanghaiSilver() {
  try {
    const url = `${SINA_API_URL}=AG0`;
    console.log('[SinaPriceService] Fetching Shanghai Silver from:', url);

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn'
      }
    });

    const text = await response.text();
    const data = parseSinaResponse(text, 'AG0');

    // AG0 数据格式与 AU0 相同

    const result = {
      symbol: 'AG0',
      name: data[0] || '沪银主力',
      price: parseFloat(data[2]) || 0,
      previousClose: parseFloat(data[3]) || 0,
      open: parseFloat(data[4]) || 0,
      high: parseFloat(data[5]) || 0,
      low: parseFloat(data[6]) || 0,
      bid: parseFloat(data[7]) || 0,
      ask: parseFloat(data[8]) || 0,
      openInterest: parseInt(data[9]) || 0,
      volume: parseInt(data[10]) || 0,
      bidVolume: parseInt(data[11]) || 0,
      askVolume: parseInt(data[12]) || 0,
      date: data[13] || '',
      limitUp: parseFloat(data[14]) || 0,
      limitDown: parseFloat(data[15]) || 0,
      unit: '元/千克',
      updated: new Date().toLocaleString('zh-CN')
    };

    result.change = result.price - result.previousClose;
    if (result.previousClose > 0) {
      result.changePercent = ((result.change) / result.previousClose * 100).toFixed(2);
    } else {
      result.changePercent = '0.00';
    }

    console.log('[SinaPriceService] Shanghai Silver parsed:', result);
    return result;
  } catch (error) {
    console.error('[SinaPriceService] Failed to fetch Shanghai Silver:', error);
    throw error;
  }
}

/**
 * 获取所有金银价格
 */
export async function fetchAllPrices() {
  console.log('[SinaPriceService] Starting to fetch all prices...');

  try {
    const [comexGold, comexSilver, shanghaiGold, shanghaiSilver] = await Promise.all([
      fetchCOMEXGold().catch(err => ({ error: err.message, name: 'COMEX黄金' })),
      fetchCOMEXSilver().catch(err => ({ error: err.message, name: 'COMEX白银' })),
      fetchShanghaiGold().catch(err => ({ error: err.message, name: '沪金主力' })),
      fetchShanghaiSilver().catch(err => ({ error: err.message, name: '沪银主力' }))
    ]);

    const result = {
      comexGold,
      comexSilver,
      shanghaiGold,
      shanghaiSilver,
      timestamp: new Date().toISOString()
    };

    console.log('[SinaPriceService] All prices fetched:', result);
    return result;
  } catch (error) {
    console.error('[SinaPriceService] Failed to fetch all prices:', error);
    throw error;
  }
}
