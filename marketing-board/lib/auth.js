import crypto from 'node:crypto';

const cookieName = 'board_session';

function passphrase() {
  return process.env.MARKETING_BOARD_PASSPHRASE || '';
}

export function isAuthEnabled() {
  return Boolean(passphrase());
}

function sign(value) {
  return crypto.createHmac('sha256', passphrase()).update(value).digest('base64url');
}

function makeSessionValue() {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

function verifySessionValue(value) {
  if (!value || !isAuthEnabled()) return false;
  const [issuedAt, signature] = value.split('.');
  if (!issuedAt || !signature) return false;
  const expected = sign(issuedAt);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function setAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${encodeURIComponent(makeSessionValue())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
  );
}

export function requireBoardAuth(req, res, next) {
  if (!isAuthEnabled() || req.path === '/auth') return next();

  const headerToken = req.get('X-Board-Token');
  if (headerToken && headerToken === passphrase()) return next();

  const cookies = parseCookies(req.get('Cookie'));
  if (verifySessionValue(cookies[cookieName])) return next();

  return res.status(401).json({ error: 'unauthorized' });
}

export function authenticatePassphrase(candidate) {
  return isAuthEnabled() && candidate === passphrase();
}
