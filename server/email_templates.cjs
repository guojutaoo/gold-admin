const getStyles = () => `
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #d4af37; color: #fff; padding: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 500; }
    .content { padding: 30px; }
    .price-card { background: #f8f9fa; border-left: 4px solid #d4af37; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .price-large { font-size: 28px; font-weight: bold; color: #d4af37; margin: 10px 0; }
    .label { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .footer { background: #eee; padding: 15px; text-align: center; font-size: 12px; color: #888; }
    .trend-up { color: #d9534f; }
    .trend-down { color: #5cb85c; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .info-label { font-weight: bold; color: #555; }
    .info-value { color: #333; }
  </style>
`;

const generateThresholdHtml = (data) => {
  const { asset, label, price, threshold, time, direction } = data;
  const dirText = direction === 'up' ? '上涨' : '下跌';
  const colorClass = direction === 'up' ? 'trend-up' : 'trend-down';
  const arrow = direction === 'up' ? '↑' : '↓';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      ${getStyles()}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>价格触达阈值提醒</h1>
        </div>
        <div class="content">
          <p>您关注的 <strong>${label}</strong> 已触发${dirText}阈值。</p>
          
          <div class="price-card">
            <div class="label">当前价格</div>
            <div class="price-large ${colorClass}">${price} <span style="font-size:16px;">元/克</span> ${arrow}</div>
            <div class="info-row">
              <span class="info-label">设定阈值</span>
              <span class="info-value">${threshold} 元/克</span>
            </div>
            <div class="info-row">
              <span class="info-label">触发方向</span>
              <span class="info-value">${dirText}</span>
            </div>
            <div class="info-row">
              <span class="info-label">更新时间</span>
              <span class="info-value">${time}</span>
            </div>
          </div>
          
          <p style="font-size: 13px; color: #999;">
            * 此邮件由系统自动发送，请勿回复。<br>
            * 监测策略：区间内仅提醒一次，直到下一个周期。
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Gold Monitor System
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateDropHtml = (data) => {
  const { asset, label, price, changePercent, threshold, time, direction } = data;
  const dirText = direction === 'up' ? '暴涨' : '暴跌';
  const colorClass = direction === 'up' ? 'trend-up' : 'trend-down';
  const arrow = direction === 'up' ? '↑' : '↓';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      ${getStyles()}
    </head>
    <body>
      <div class="container">
        <div class="header" style="background: #e67e22;">
          <h1>价格剧烈波动提醒</h1>
        </div>
        <div class="content">
          <p>您关注的 <strong>${label}</strong> 出现了${dirText}。</p>
          
          <div class="price-card" style="border-left-color: #e67e22;">
            <div class="label">波动幅度</div>
            <div class="price-large ${colorClass}">${changePercent}% ${arrow}</div>
            <div class="info-row">
              <span class="info-label">当前价格</span>
              <span class="info-value">${price} <span style="font-size:14px;">元/克</span></span>
            </div>
            <div class="info-row">
              <span class="info-label">设定阈值</span>
              <span class="info-value">${threshold}%</span>
            </div>
            <div class="info-row">
              <span class="info-label">更新时间</span>
              <span class="info-value">${time}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Gold Monitor System
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateIntervalHtml = (data) => {
  const { gold, silver, time, interval } = data;
  
  let goldHtml = '';
  if (gold) {
    goldHtml = `
      <div class="price-card">
        <div class="label">黄金 (最低价品类)</div>
        <div class="price-large">${gold.price} <span style="font-size:16px;">元/克</span></div>
        <div class="info-row">
          <span class="info-label">品类</span>
          <span class="info-value">${gold.label}</span>
        </div>
      </div>
    `;
  }

  let silverHtml = '';
  if (silver) {
    silverHtml = `
      <div class="price-card" style="border-left-color: #bdc3c7;">
        <div class="label">白银 (基准)</div>
        <div class="price-large" style="color: #7f8c8d;">${silver.price} <span style="font-size:16px;">元/克</span></div>
        <div class="info-row">
          <span class="info-label">涨跌幅</span>
          <span class="info-value">${silver.changePercent}%</span>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      ${getStyles()}
    </head>
    <body>
      <div class="container">
        <div class="header" style="background: #2c3e50;">
          <h1>定时价格播报</h1>
        </div>
        <div class="content">
          <p>根据您的设置，每 <strong>${interval}小时</strong> 为您推送最新行情。</p>
          
          ${goldHtml}
          ${silverHtml}
          
          <div class="info-row" style="margin-top: 20px;">
            <span class="info-label">更新时间</span>
            <span class="info-value">${time}</span>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Gold Monitor System
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  generateThresholdHtml,
  generateDropHtml,
  generateIntervalHtml
};
