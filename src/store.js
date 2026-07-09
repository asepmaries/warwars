const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERWDP_JSON = path.join(DATA_DIR, 'userwdp.json');
const USERWDP_TXT = path.join(DATA_DIR, 'userwdp.txt');
const USERWDP2_JSON = path.join(DATA_DIR, 'userwdp2.json');
const USERWDP2_TXT = path.join(DATA_DIR, 'userwdp2.txt');
const HASIL_TXT = path.join(DATA_DIR, 'hasil.txt');
const LIMIT_TXT = path.join(DATA_DIR, 'userlimit.txt');
const REGION_TXT = path.join(DATA_DIR, 'region.txt');
const SALAH_TXT = path.join(DATA_DIR, 'userid_salah.txt');

const SHEET_STORE = {
  main: {
    key: 'main',
    json: USERWDP_JSON,
    txt: USERWDP_TXT,
    source_file: 'userwdp.txt',
  },
  sheet2: {
    key: 'sheet2',
    json: USERWDP2_JSON,
    txt: USERWDP2_TXT,
    source_file: 'userwdp2.txt',
  },
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o775 });
  }
}

function normalizeUserId(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d+$/.test(text)) return text;
  if (/^[0-9.eE+-]+$/.test(text)) {
    const num = Number(text);
    if (Number.isFinite(num) && Math.abs(num - Math.round(num)) < 0.0001) {
      return String(Math.round(num));
    }
  }
  return text;
}

function makePairKey(user, server) {
  return `${user}|${String(server || '').trim()}`;
}

function parseLines(content) {
  return String(content)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

function readJson(file) {
  if (!fs.existsSync(file)) return { rows: [], row_count: 0 };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' ? data : { rows: [], row_count: 0 };
  } catch {
    return { rows: [], row_count: 0 };
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getSheetStore(sheetKey = 'main') {
  return SHEET_STORE[sheetKey] || SHEET_STORE.main;
}

function mergeLinesByUser(existingContent, newContent, minParts = 2) {
  const map = new Map();

  const ingest = (content) => {
    parseLines(content).forEach((line) => {
      if (/^user\|/i.test(line)) return;
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < minParts) return;
      const user = normalizeUserId(parts[0]);
      if (!user) return;
      const idOrVal = parts[1] || '';
      const key = (minParts >= 3) ? `${user}|${idOrVal}` : user;
      map.set(key, parts.join('|'));
    });
  };

  ingest(existingContent);
  ingest(newContent);

  if (!map.size) return '';
  return `${Array.from(map.values()).join('\n')}\n`;
}

function uploadUserWdp(content, sheetKey = 'main') {
  ensureDataDir();
  const store = getSheetStore(sheetKey);
  const data = readJson(store.json);
  const rows = data.rows || [];
  const existingBefore = rows.length;
  const index = {};
  rows.forEach((row, i) => {
    const k = makePairKey(row.user, row.server);
    index[k] = i;
  });
  const originalKeys = new Set(Object.keys(index));
  const seenIncoming = new Set();

  const errors = [];
  let added = 0;
  let updated = 0;
  let incoming = 0;
  let duplicateInUpload = 0;

  parseLines(content).forEach((line, i) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Baris ${i + 1}: format harus user|id|jumlah`);
      return;
    }
    const user = normalizeUserId(parts[0]);
    if (!user) {
      errors.push(`Baris ${i + 1}: user id kosong`);
      return;
    }

    incoming++;
    const server = parts[1];
    const jumlah = parseInt(parts[2], 10) || 0;
    const pairKey = makePairKey(user, server);
    const alreadySeen = seenIncoming.has(pairKey);
    if (alreadySeen) {
      duplicateInUpload++;
    } else {
      seenIncoming.add(pairKey);
    }

    if (index[pairKey] !== undefined) {
      rows[index[pairKey]].server = server;
      rows[index[pairKey]].jumlah = jumlah;
      if (!alreadySeen && originalKeys.has(pairKey)) {
        updated++;
      }
      return;
    }

    rows.push({
      user,
      server,
      jumlah,
      link_invoice: '',
    });
    index[pairKey] = rows.length - 1;
    if (!alreadySeen) {
      added++;
    }
  });

  if (!incoming && !errors.length) {
    throw new Error('File kosong atau tidak ada baris valid.');
  }

  const existingTxt = fs.existsSync(store.txt) ? fs.readFileSync(store.txt, 'utf8') : '';
  fs.writeFileSync(store.txt, mergeLinesByUser(existingTxt, content, 3));

  data.updated_at = new Date().toISOString();
  data.source_file = store.source_file;
  data.sheet = sheetKey;
  data.row_count = rows.length;
  data.rows = rows;
  writeJson(store.json, data);

  return {
    ok: true,
    sheet: sheetKey,
    existing_before: existingBefore,
    incoming,
    incoming_unique: seenIncoming.size,
    duplicate_in_upload: duplicateInUpload,
    expected_row_count: existingBefore + added,
    row_count: rows.length,
    added,
    updated,
    errors,
  };
}

function loadUserStores() {
  const mainData = readJson(USERWDP_JSON);
  const sheet2Data = readJson(USERWDP2_JSON);
  const mainRows = mainData.rows || [];
  const sheet2Rows = sheet2Data.rows || [];
  const indexMain = {};
  const indexSheet2 = {};
  const userMain = {};
  const userSheet2 = {};
  mainRows.forEach((row, i) => {
    const k = makePairKey(row.user, row.server);
    indexMain[k] = i;
    if (userMain[row.user] === undefined) userMain[row.user] = i;
  });
  sheet2Rows.forEach((row, i) => {
    const k = makePairKey(row.user, row.server);
    indexSheet2[k] = i;
    if (userSheet2[row.user] === undefined) userSheet2[row.user] = i;
  });
  return { mainData, sheet2Data, mainRows, sheet2Rows, indexMain, indexSheet2, userMain, userSheet2 };
}

function uploadHasil(content) {
  ensureDataDir();
  if (!fs.existsSync(USERWDP_JSON) && !fs.existsSync(USERWDP2_JSON)) {
    throw new Error('Upload user dulu sebelum upload hasil');
  }

  const { mainData, sheet2Data, mainRows, sheet2Rows, indexMain, indexSheet2, userMain, userSheet2 } = loadUserStores();

  let matched = 0;
  let matched_main = 0;
  let matched_sheet2 = 0;
  const missing = [];
  const errors = [];
  const hasilRows = [];

  parseLines(content).forEach((line, i) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Baris ${i + 1}: format harus user|id|link_invoice`);
      return;
    }
    const user = normalizeUserId(parts[0]);
    const link = parts[2];
    const server = parts[1];
    hasilRows.push({ user, server, link_invoice: link });

    const pairKey = makePairKey(user, server);
    let inMain = !!user && indexMain[pairKey] !== undefined;
    let inSheet2 = !!user && indexSheet2[pairKey] !== undefined;

    if (!inMain && !inSheet2) {
      // fallback: user has at least one server entry
      if (userMain[user] !== undefined) inMain = true;
      if (userSheet2[user] !== undefined) inSheet2 = true;
    }

    if (!inMain && !inSheet2) {
      missing.push(user);
      return;
    }

    if (inMain) {
      const idx = (indexMain[pairKey] !== undefined) ? indexMain[pairKey] : userMain[user];
      mainRows[idx].jumlah = 1;
      mainRows[idx].link_invoice = link;
      matched_main++;
    }
    if (inSheet2) {
      const idx = (indexSheet2[pairKey] !== undefined) ? indexSheet2[pairKey] : userSheet2[user];
      sheet2Rows[idx].jumlah = 1;
      sheet2Rows[idx].link_invoice = link;
      matched_sheet2++;
    }
    matched++;
  });

  const existingHasil = fs.existsSync(HASIL_TXT) ? fs.readFileSync(HASIL_TXT, 'utf8') : '';
  fs.writeFileSync(HASIL_TXT, mergeLinesByUser(existingHasil, content, 3));

  mainData.rows = mainRows;
  mainData.hasil_updated_at = new Date().toISOString();
  mainData.row_count = mainRows.length;
  writeJson(USERWDP_JSON, mainData);

  sheet2Data.rows = sheet2Rows;
  sheet2Data.hasil_updated_at = new Date().toISOString();
  sheet2Data.row_count = sheet2Rows.length;
  writeJson(USERWDP2_JSON, sheet2Data);

  return {
    ok: true,
    matched,
    matched_main,
    matched_sheet2,
    missing: [...new Set(missing.filter(Boolean))],
    hasil_count: hasilRows.length,
    hasil_total: parseLines(fs.readFileSync(HASIL_TXT, 'utf8')).length,
    errors,
  };
}

function uploadLimit(content) {
  ensureDataDir();
  const errors = [];
  let incoming = 0;

  parseLines(content).forEach((line, i) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Baris ${i + 1}: format harus user|id`);
      return;
    }
    incoming++;
  });

  if (!incoming && !errors.length) {
    throw new Error('File kosong atau tidak ada baris valid.');
  }

  const existingLimit = fs.existsSync(LIMIT_TXT) ? fs.readFileSync(LIMIT_TXT, 'utf8') : '';
  const merged = mergeLinesByUser(existingLimit, content, 2);
  fs.writeFileSync(LIMIT_TXT, merged);

  return {
    ok: true,
    limit_count: incoming,
    limit_total: parseLines(merged).length,
    errors,
    updated_at: new Date().toISOString(),
  };
}

function uploadRegion(content) {
  ensureDataDir();
  const errors = [];
  let incoming = 0;

  parseLines(content).forEach((line, i) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Baris ${i + 1}: format harus user|id`);
      return;
    }
    incoming++;
  });

  if (!incoming && !errors.length) {
    throw new Error('File kosong atau tidak ada baris valid.');
  }

  const existingRegion = fs.existsSync(REGION_TXT) ? fs.readFileSync(REGION_TXT, 'utf8') : '';
  const merged = mergeLinesByUser(existingRegion, content, 2);
  fs.writeFileSync(REGION_TXT, merged);

  return {
    ok: true,
    region_count: incoming,
    region_total: parseLines(merged).length,
    errors,
    updated_at: new Date().toISOString(),
  };
}

function uploadSalah(content) {
  ensureDataDir();
  const errors = [];
  let incoming = 0;

  parseLines(content).forEach((line, i) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Baris ${i + 1}: format harus user|id`);
      return;
    }
    incoming++;
  });

  if (!incoming && !errors.length) {
    throw new Error('File kosong atau tidak ada baris valid.');
  }

  const existingSalah = fs.existsSync(SALAH_TXT) ? fs.readFileSync(SALAH_TXT, 'utf8') : '';
  const merged = mergeLinesByUser(existingSalah, content, 2);
  fs.writeFileSync(SALAH_TXT, merged);

  return {
    ok: true,
    salah_count: incoming,
    salah_total: parseLines(merged).length,
    errors,
    updated_at: new Date().toISOString(),
  };
}

function loadHasilMap() {
  if (!fs.existsSync(HASIL_TXT)) return {};
  const map = {};
  parseLines(fs.readFileSync(HASIL_TXT, 'utf8')).forEach((line) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    const user = normalizeUserId(parts[0]);
    if (user) map[user] = parts[2] || true;
  });
  return map;
}

function loadLimitMap() {
  if (!fs.existsSync(LIMIT_TXT)) return {};
  const map = {};
  parseLines(fs.readFileSync(LIMIT_TXT, 'utf8')).forEach((line) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    const user = normalizeUserId(parts[0]);
    if (user) map[user] = parts[1] || '';
  });
  return map;
}

function loadRegionMap() {
  if (!fs.existsSync(REGION_TXT)) return {};
  const map = {};
  parseLines(fs.readFileSync(REGION_TXT, 'utf8')).forEach((line) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    const user = normalizeUserId(parts[0]);
    if (user) map[user] = parts[1] || '';
  });
  return map;
}

function loadSalahMap() {
  if (!fs.existsSync(SALAH_TXT)) return {};
  const map = {};
  parseLines(fs.readFileSync(SALAH_TXT, 'utf8')).forEach((line) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    const user = normalizeUserId(parts[0]);
    if (user) map[user] = parts[1] || '';
  });
  return map;
}

function classifyRow(row, hasilMap, limitMap, regionMap, salahMap = {}) {
  const user = row.user;
  const gotInvoice = !!hasilMap[user] || String(row.link_invoice || '').trim() !== '';
  if (gotInvoice) return { status: 'sukses', sort: 0, hasil: '1' };
  if (limitMap[user]) return { status: 'limit', sort: 1, hasil: 'limit' };
  if (regionMap[user]) return { status: 'region_invalid', sort: 2, hasil: 'region_invalid' };
  if (salahMap[user]) return { status: 'userid_salah', sort: 4, hasil: 'userid_salah' };
  return { status: 'zonk', sort: 3, hasil: '' };
}

function buildSheetPayload(sheetKey = 'main') {
  const store = getSheetStore(sheetKey);
  const data = readJson(store.json);
  const hasilMap = loadHasilMap();
  const limitMap = loadLimitMap();
  const regionMap = loadRegionMap();
  const salahMap = loadSalahMap();
  const rows = data.rows || [];

  const enriched = rows.map((row, i) => ({
    ...row,
    ...classifyRow(row, hasilMap, limitMap, regionMap, salahMap),
    _order: i,
  }));

  enriched.sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a._order - b._order;
  });

  const finalRows = enriched.map((row) => {
    const { _order, ...rest } = row;
    return {
      user: String(rest.user),
      server: String(rest.server || ''),
      jumlah: '1',
      hasil: String(rest.hasil || ''),
      link_invoice: String(rest.link_invoice || ''),
      status: rest.status,
      sort: rest.sort,
    };
  });

  return {
    sheet: sheetKey,
    updated_at: data.updated_at || null,
    row_count: finalRows.length,
    counts: {
      sukses: finalRows.filter((r) => r.status === 'sukses').length,
      limit: finalRows.filter((r) => r.status === 'limit').length,
      region_invalid: finalRows.filter((r) => r.status === 'region_invalid').length,
      userid_salah: finalRows.filter((r) => r.status === 'userid_salah').length,
      zonk: finalRows.filter((r) => r.status === 'zonk').length,
    },
    rows: finalRows,
  };
}

function getSheetData(sheetKey = 'main') {
  return buildSheetPayload(sheetKey);
}

function resetData() {
  ensureDataDir();
  const targets = [USERWDP_JSON, USERWDP_TXT, USERWDP2_JSON, USERWDP2_TXT, HASIL_TXT, LIMIT_TXT, REGION_TXT, SALAH_TXT];
  const deleted = [];

  targets.forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      deleted.push(path.basename(file));
    }
  });

  return {
    ok: true,
    message: 'Semua data user, hasil, limit, region, dan userid_salah dihapus',
    deleted,
    deleted_count: deleted.length,
  };
}

function getMeta() {
  ensureDataDir();
  const mainData = readJson(USERWDP_JSON);
  const sheet2Data = readJson(USERWDP2_JSON);
  const emptyCounts = { sukses: 0, limit: 0, region_invalid: 0, userid_salah: 0, zonk: 0 };
  const sheetMain = fs.existsSync(USERWDP_JSON) ? buildSheetPayload('main') : { counts: emptyCounts, row_count: 0 };
  const sheet2 = fs.existsSync(USERWDP2_JSON) ? buildSheetPayload('sheet2') : { counts: emptyCounts, row_count: 0 };

  return {
    userwdp: {
      exists: fs.existsSync(USERWDP_JSON),
      updated_at: mainData.updated_at || null,
      row_count: mainData.row_count || 0,
    },
    userwdp2: {
      exists: fs.existsSync(USERWDP2_JSON),
      updated_at: sheet2Data.updated_at || null,
      row_count: sheet2Data.row_count || 0,
    },
    hasil: {
      exists: fs.existsSync(HASIL_TXT),
      updated_at: mainData.hasil_updated_at || sheet2Data.hasil_updated_at || null,
      line_count: fs.existsSync(HASIL_TXT) ? parseLines(fs.readFileSync(HASIL_TXT, 'utf8')).length : 0,
    },
    limit: {
      exists: fs.existsSync(LIMIT_TXT),
      line_count: fs.existsSync(LIMIT_TXT) ? parseLines(fs.readFileSync(LIMIT_TXT, 'utf8')).length : 0,
    },
    region: {
      exists: fs.existsSync(REGION_TXT),
      line_count: fs.existsSync(REGION_TXT) ? parseLines(fs.readFileSync(REGION_TXT, 'utf8')).length : 0,
    },
    salah: {
      exists: fs.existsSync(SALAH_TXT),
      line_count: fs.existsSync(SALAH_TXT) ? parseLines(fs.readFileSync(SALAH_TXT, 'utf8')).length : 0,
    },
    sheet_counts: sheetMain.counts,
    sheet2_counts: sheet2.counts,
  };
}

module.exports = {
  uploadUserWdp,
  uploadHasil,
  uploadLimit,
  uploadRegion,
  uploadSalah,
  resetData,
  getSheetData,
  getMeta,
  USERWDP_JSON,
  USERWDP2_JSON,
};
