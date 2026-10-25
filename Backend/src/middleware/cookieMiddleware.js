/**
 * Parses standard Cookie header safely into an object dictionary.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (e) {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Cookie Parser Middleware.
 * Parses standard Cookie header safely into req.cookies dictionary without third-party dependencies.
 */
function cookieMiddleware(req, res, next) {
  if (req.cookies && typeof req.cookies === 'object') {
    return next();
  }

  req.cookies = parseCookies(req.headers.cookie);
  next();
}

cookieMiddleware.parseCookies = parseCookies;
module.exports = cookieMiddleware;
module.exports.parseCookies = parseCookies;
