const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const store = require('./store');

const PORT = Number(process.env.WDP_PORT || 8080);
const HOST = process.env.WDP_HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.text({ type: ['text/*', 'application/octet-stream'], limit: '20mb' }));
app.use(express.json({ limit: '1mb' }));

function readBodyContent(req) {
  if (req.file && req.file.buffer) {
    return req.file.buffer.toString('utf8');
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return req.body;
  }
  if (req.body && typeof req.body.content === 'string') {
    return req.body.content;
  }
  return '';
}

function sendOk(res, payload, code = 200) {
  res.status(code).json(payload);
}

function sendErr(res, message, code = 400) {
  res.status(code).json({ ok: false, error: message });
}

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    const content = readBodyContent(req);
    if (!content.trim()) return sendErr(res, 'File kosong');
    sendOk(res, store.uploadUserWdp(content, 'main'));
  } catch (e) {
    sendErr(res, e.message);
  }
});

app.post('/api/upload-sheet2', upload.single('file'), (req, res) => {
  try {
    const content = readBodyContent(req);
    if (!content.trim()) return sendErr(res, 'File kosong');
    sendOk(res, store.uploadUserWdp(content, 'sheet2'));
  } catch (e) {
    sendErr(res, e.message);
  }
});

app.post('/api/upload-hasil', upload.single('file'), (req, res) => {
  try {
    const content = readBodyContent(req);
    if (!content.trim()) return sendErr(res, 'File kosong');
    sendOk(res, store.uploadHasil(content));
  } catch (e) {
    sendErr(res, e.message);
  }
});

app.post('/api/upload-limit', upload.single('file'), (req, res) => {
  try {
    const content = readBodyContent(req);
    if (!content.trim()) return sendErr(res, 'File kosong');
    sendOk(res, store.uploadLimit(content));
  } catch (e) {
    sendErr(res, e.message);
  }
});

app.get('/api/sheet', (req, res) => {
  if (!fs.existsSync(store.USERWDP_JSON)) {
    return sendErr(res, 'Belum ada data. Upload user utama dulu.', 404);
  }
  sendOk(res, { ok: true, ...store.getSheetData('main') });
});

app.get('/api/sheet2', (req, res) => {
  if (!fs.existsSync(store.USERWDP2_JSON)) {
    return sendErr(res, 'Belum ada data. Upload user order kedua dulu.', 404);
  }
  sendOk(res, { ok: true, ...store.getSheetData('sheet2') });
});

app.get('/api/meta', (req, res) => {
  sendOk(res, { ok: true, meta: store.getMeta() });
});

app.post('/api/reset', (req, res) => {
  try {
    sendOk(res, store.resetData());
  } catch (e) {
    sendErr(res, e.message);
  }
});

app.get('/health', (req, res) => {
  sendOk(res, { ok: true, service: 'wdp-sheet', port: PORT });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/sheet', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'sheet.html'));
});

app.get('/sheet2', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'sheet2.html'));
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  sendErr(res, 'Not found', 404);
});

app.listen(PORT, HOST, () => {
  console.log(`WDP Sheet API: http://${HOST}:${PORT}`);
  console.log(`Sheet utama:   http://${HOST}:${PORT}/sheet`);
  console.log(`Sheet order 2: http://${HOST}:${PORT}/sheet2`);
});