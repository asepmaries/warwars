const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERWDP_JSON = path.join(DATA_DIR, 'userwdp.json');
const USERWDP_TXT = path.join(DATA_DIR, 'userwdp.txt');
const HASIL_TXT = path.join(DATA_DIR, 'hasil.txt');
const LIMIT_TXT = path.join(DATA_DIR, 'userlimit.txt');

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

function uploadUserWdp(content) {
  ensureDataDir();
  const rows = [];
  const errors = [];

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
    rows.push({
      user,
      server: parts[1],
      jumlah: parseInt(parts[2], 10) || 0,
      link_invoice: '',
    });
  });

  if (!rows.length && !errors.length) {
    throw new Error('File kosong atau tidak ada baris valid.');
  }

  const payload = {
    updated_at: new Date().toISOString(),
    source_file: 'userwdp.txt',
    row_count: rows.length,
    rows,
  };

  fs.writeFileSync(USERWDP_TXT, content, 'utf8');
  writeJson(USERWDP_JSON, payload);

  return { ok: true, row_count: rows.length, errors };
}

function uploadHasil(content) {
  ensureDataDir();
  if (!fs.existsSync(USERWDP_JSON)) {
    throw new Error('Upload userwdp dulu sebelum upload hasil');
  }

  const data = readJson(USERWDP_JSON);
  const rows = data.rows || [];
  const index = {};
  rows.forEach((row, i) => {
    index[row.user] = i;
  });

  let matched = 0;
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
    hasilRows.push({ user, server: parts[1], link_invoice: link });

    if (!user || index[user] === undefined) {
      missing.push(user);
      return;
    }
    rows[index[user]].jumlah = 1;
    rows[index[user]].link_invoice = link;
    matched++;
  });

  fs.writeFileSync(HASIL_TXT, content, 'utf8');
  data.rows = rows;
  data.hasil_updated_at = new Date().toISOString();
  data.row_count = rows.length;
  writeJson(USERWDP_JSON, data);

  return {
    ok: true,
    matched,
    missing: [...new Set(missing.filter(Boolean))],
    hasil_count: hasilRows.length,
    errors,
  };
}

function uploadLimit(content) {
  ensureDataDir();
  const errors = [];
  let count = 0;

  parseLines(content).forEach((line, i) => {
    if (/^user\|/i.test(line)) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Baris ${i + 1}: format harus user|id`);
      return;
    }
    count++;
  });

  fs.writeFileSync(LIMIT_TXT, content, 'utf8');

  return {
    ok: true,
    limit_count: count,
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
    if (user) map[user] = true;
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

function classifyRow(row, hasilMap, limitMap) {
  const user = row.user;
  const isSuccess = !!hasilMap[user] || Number(row.jumlah) === 1;
  if (isSuccess) return { status: 'sukses', sort: 0, hasil: '1' };
  if (limitMap[user]) return { status: 'limit', sort: 1, hasil: 'limit' };
  return { status: 'zonk', sort: 2, hasil: '' };
}

function getSheetData() {
  const data = readJson(USERWDP_JSON);
  const hasilMap = loadHasilMap();
  const limitMap = loadLimitMap();
  const rows = data.rows || [];

  const enriched = rows.map((row, i) => ({
    ...row,
    ...classifyRow(row, hasilMap, limitMap),
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
      hasil: String(rest.hasil || ''),
      link_invoice: String(rest.link_invoice || ''),
      status: rest.status,
      sort: rest.sort,
    };
  });

  return {
    updated_at: data.updated_at || null,
    row_count: finalRows.length,
    counts: {
      sukses: finalRows.filter((r) => r.status === 'sukses').length,
      limit: finalRows.filter((r) => r.status === 'limit').length,
      zonk: finalRows.filter((r) => r.status === 'zonk').length,
    },
    rows: finalRows,
  };
}

function getMeta() {
  ensureDataDir();
  const data = readJson(USERWDP_JSON);
  const sheet = getSheetData();

  return {
    userwdp: {
      exists: fs.existsSync(USERWDP_JSON),
      updated_at: data.updated_at || null,
      row_count: data.row_count || 0,
    },
    hasil: {
      exists: fs.existsSync(HASIL_TXT),
      updated_at: data.hasil_updated_at || null,
      line_count: fs.existsSync(HASIL_TXT) ? parseLines(fs.readFileSync(HASIL_TXT, 'utf8')).length : 0,
    },
    limit: {
      exists: fs.existsSync(LIMIT_TXT),
      line_count: fs.existsSync(LIMIT_TXT) ? parseLines(fs.readFileSync(LIMIT_TXT, 'utf8')).length : 0,
    },
    sheet_counts: sheet.counts,
  };
}

module.exports = {
  uploadUserWdp,
  uploadHasil,
  uploadLimit,
  getSheetData,
  getMeta,
  USERWDP_JSON,
};