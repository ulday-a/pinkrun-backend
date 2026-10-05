const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.TEST_ADMIN_KEY || 'pinkrun-test';
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.TEST_ADMIN_KEY ||
  'pinkrun-test-session-secret';

const COOKIE_NAME = 'pinkrun_admin_session';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};

  header.split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index === -1) return;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (!name) return;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch (_) {
      cookies[name] = value;
    }
  });

  return cookies;
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function sign(value) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(value)
    .digest('hex');
}

function createSessionToken() {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = crypto.randomBytes(24).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtText, nonce, signature] = parts;
  const expiresAt = Number(expiresAtText);

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    !nonce ||
    !signature
  ) {
    return false;
  }

  const expected = sign(`${expiresAtText}.${nonce}`);
  return safeEqual(signature, expected);
}

function isAdminRequest(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function requireAdmin(req, res, next) {
  if (!isAdminRequest(req)) {
    if (req.method === 'GET') {
      return res.redirect('/admin-test');
    }

    return res.status(401).json({
      error: 'Сессия администратора истекла. Войдите снова.'
    });
  }

  next();
}

function setAdminSessionCookie(res) {
  const token = createSessionToken();

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; ` +
    `Max-Age=${SESSION_MAX_AGE_SECONDS}; ` +
    'Path=/; HttpOnly; Secure; SameSite=Strict'
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
  );
}

function verifyAdminPassword(password) {
  return safeEqual(password || '', ADMIN_PASSWORD);
}

module.exports = {
  isAdminRequest,
  requireAdmin,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  verifyAdminPassword,
};
