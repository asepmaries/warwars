const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const INQUIRY_URL = 'https://gopay.co.id/games/v1/order/inquiry';

const ANDROID_VERSIONS = ['11', '12', '13', '14'];
const MODELS = [
  'SM-A225F', 'SM-A135F', 'SM-A205F', 'SM-A326B', 'SM-A127F',
  'SM-A325F', 'SM-A528B', 'SM-A536B', 'SM-A546B', 'SM-A426B',
  'SM-M136B', 'SM-M326B', 'SM-A047F', 'SM-A057F', 'SM-A235F',
  'Redmi Note 12', 'Redmi Note 13', 'Redmi 13C', 'Poco X6',
];
const CHROME_VERSIONS = ['135', '136', '137', '138', '139', '140'];
const BUILDS = [
  'TP1A.220624.014', 'TP1A.221005.002', 'UP1A.231005.007',
  'UP1A.231105.003', 'AP1A.240305.019', 'BP1A.250205.002',
];

let cachedCaptchaToken = null;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function getRandomUserAgent() {
  const androidVer = pick(ANDROID_VERSIONS);
  const model = pick(MODELS);
  const chromeVer = pick(CHROME_VERSIONS);
  const minor = String(Math.floor(Math.random() * 6));
  const build = pick(BUILDS);
  const userAgent = `Mozilla/5.0 (Linux; Android ${androidVer}; ${model} Build/${build}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer}.0.${minor}.0 Mobile Safari/537.36`;
  const secChUa = `"Android WebView";v="${chromeVer}", "Chromium";v="${chromeVer}", "Not/A)Brand";v="24"`;
  return { userAgent, secChUa };
}

function generateSentryTrace() {
  const traceId = randomHex(16);
  const parentId = randomHex(8);
  return {
    sentryTrace: `${traceId}-${parentId}-1`,
    baggage: `sentry-environment=production,sentry-release=vQMo5GDY05ylXAQzFup_V,sentry-public_key=3f2904ecef7bc7859d6299eaf817040c,sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-sampled=true`,
  };
}

function buildInquiryHeaders(captchaToken) {
  const ua = getRandomUserAgent();
  const sentry = generateSentryTrace();
  return {
    'sec-ch-ua-platform': '"Android"',
    authorization: 'Bearer undefined',
    'sec-ch-ua': ua.secChUa,
    'sec-ch-ua-mobile': '?1',
    baggage: sentry.baggage,
    'sentry-trace': sentry.sentryTrace,
    'user-agent': ua.userAgent,
    'x-captcha-token': captchaToken,
    'content-type': 'application/json',
    'x-client': 'mobile',
    accept: '*/*',
    origin: 'https://gopay.co.id',
    'x-requested-with': 'mark.via.gp',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    referer: 'https://gopay.co.id/games/mobile-legends-bang-bang',
    'accept-language': 'en-US,en;q=0.9',
    'x-timestamp': String(Date.now()),
    cookie: 'acw_tc=9581d31c17748587792257129e0deb0a34ec18f05b8a68459d00a474893677; slug=mobile-legends-bang-bang',
  };
}

function buildInquiryBody(userId, zoneId) {
  return {
    productId: Number(process.env.WDP_PRODUCT_ID || 19),
    productItemId: Number(process.env.WDP_PRODUCT_ITEM_ID || 366),
    data: { userId: String(userId), zoneId: String(zoneId) },
    paymentChannelId: 73,
    phoneNumber: process.env.WDP_PHONE || '628783219212',
    voucher: process.env.WDP_VOUCHER || 'WARWDPGG',
    quantity: 1,
  };
}

function reloadPaths() {
  return [
    process.env.WDP_RELOAD_FILE,
    path.join(ROOT, 'files', 'reload.txt'),
    path.join(DATA_DIR, 'reload.txt'),
    path.join(ROOT, 'reload.txt'),
    path.join(ROOT, '..', 'reload.txt'),
  ].filter(Boolean);
}

async function fetchFreshCaptchaToken() {
  const reloadFile = reloadPaths().find((file) => fs.existsSync(file));
  if (!reloadFile) {
    throw new Error('File reload.txt tidak ditemukan. Letakkan di folder files/ atau data/');
  }

  const reloadBody = fs.readFileSync(reloadFile);
  const url = 'https://www.google.com/recaptcha/api2/reload?k=6Le4GDcqAAAAAFTD31YUpEd1qMPgntTn1xFH7n_o';
  const headers = {
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua': '"Android WebView";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
    'content-type': 'application/x-protobuffer',
    'sec-ch-ua-mobile': '?1',
    origin: 'https://www.google.com',
    'x-requested-with': 'mark.via.gp',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    referer: 'https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le4GDcqAAAAAFTD31YUpEd1qMPgntTn1xFH7n_o&co=aHR0cHM6Ly9nb3BheS5jby5pZDo0NDM.&hl=en&v=79clEdOi5xQbrrpL2L8kGmK3&size=invisible&anchor-ms=20000&execute-ms=30000&cb=34spuflel6ax',
    'accept-language': 'en-US,en;q=0.9',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: reloadBody,
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  if (!res.ok || !text) {
    throw new Error(`Gagal ambil captcha (HTTP ${res.status})`);
  }

  const match = text.match(/"rresp","([^"]+)"/);
  if (!match) {
    throw new Error('Gagal parse captcha token dari Google');
  }

  const token = match[1];
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(DATA_DIR, 'captcha_token.txt'), token);
  cachedCaptchaToken = token;
  return token;
}

function getSessionCaptchaToken() {
  if (!cachedCaptchaToken) {
    throw new Error('Sesi cek belum dimulai. Panggil /api/cek/begin terlebih dahulu.');
  }
  return cachedCaptchaToken;
}

async function beginCekSession() {
  const token = await fetchFreshCaptchaToken();
  return {
    ok: true,
    refreshed: true,
    token_length: token.length,
    reload_file: reloadPaths().find((file) => fs.existsSync(file)) || null,
  };
}

function classifyCekResponse(httpCode, payload, rawText) {
  const message = String(payload?.message || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('cannot procceed this sku')) {
    return {
      status: 'region_invalid',
      label: 'Region tidak valid',
      http: httpCode,
      message: message || 'cannot procceed this sku, please contact administration',
    };
  }

  if (message === 'Error_InvalidZoneId' || lower.includes('error_invalidzoneid')) {
    return {
      status: 'user_invalid',
      label: 'User ID salah',
      http: httpCode,
      message,
    };
  }

  if ((httpCode === 200 || httpCode === 201) && payload) {
    const orderId = payload?.data?.orderId || payload?.orderId;
    if (orderId) {
      return {
        status: 'valid',
        label: 'Bisa / Support',
        http: httpCode,
        message: `OrderID: ${orderId}`,
        orderId: String(orderId),
      };
    }
  }

  return {
    status: 'valid',
    label: 'Bisa / Support',
    http: httpCode,
    message: message || String(rawText || '').slice(0, 200),
  };
}

async function inquiryUser(userId, zoneId) {
  const captchaToken = getSessionCaptchaToken();
  const headers = buildInquiryHeaders(captchaToken);
  const body = buildInquiryBody(userId, zoneId);

  let res;
  let rawText = '';
  try {
    res = await fetch(INQUIRY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    rawText = await res.text();
  } catch (err) {
    return {
      ok: false,
      userId: String(userId),
      zoneId: String(zoneId),
      status: 'error',
      label: 'Error koneksi',
      http: 0,
      message: err.message || 'Request gagal',
      error: err.message,
    };
  }

  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  const classified = classifyCekResponse(res.status, payload, rawText);
  return {
    ok: true,
    userId: String(userId),
    zoneId: String(zoneId),
    ...classified,
    raw: payload || rawText.slice(0, 500),
  };
}

module.exports = {
  inquiryUser,
  beginCekSession,
  classifyCekResponse,
};