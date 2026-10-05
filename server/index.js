require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' })); // selfies arrive as compressed base64
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  const cors = require('cors');
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

/* ------------------------------------------------------------- routes */

app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/captures', require('./routes/captures'));
app.use('/api/requirements', require('./routes/requirements'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/media', require('./routes/media'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/dashboard', require('./routes/dashboard'));

/* ------------------------------------------------- SPA (single service) */

const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist, { maxAge: '1y', index: false }));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) res.status(503).send('Client build not found. Run: npm run build');
  });
});

/* ------------------------------------------------------ error handling */

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ error: `That ${field} is already in use` });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Malformed id' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

/* --------------------------------------------------------------- boot */

async function start() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('mongo connected');

  if (process.env.SEED_ON_BOOT === 'true') {
    try {
      await require('./utils/seed').seed({ quiet: true });
    } catch (e) {
      console.error('seed skipped:', e.message);
    }
  }

  app.listen(PORT, () => console.log(`rockbreakers listening on :${PORT}`));
}

start().catch((e) => {
  console.error('startup failed:', e.message);
  process.exit(1);
});
