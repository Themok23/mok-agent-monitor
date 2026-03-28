/**
 * Basic auth middleware for password-protecting the dashboard.
 * 
 * On Vercel, static files (HTML/JS/CSS) are served directly without
 * going through this middleware. API routes DO go through it.
 * 
 * Strategy: Exempt all /api/* routes from basic auth since the
 * frontend JS needs to call them without credentials. The hooks
 * endpoint uses its own HOOK_SECRET for security.
 * 
 * For local mode, basic auth protects the whole app (including API),
 * but the frontend is served from the same origin so the browser
 * sends credentials automatically after the initial login prompt.
 */

function authMiddleware(req, res, next) {
  const pass = process.env.DASHBOARD_PASS;

  // Auth disabled if no password configured
  if (!pass) return next();

  // On Vercel: exempt ALL API routes from basic auth.
  // The frontend JS makes fetch() calls without auth headers.
  // Hook endpoint is separately protected by HOOK_SECRET.
  if (req.path.startsWith("/api/")) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="MOK Agent Monitor"');
    return res.status(401).send("Authentication required");
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, pwd] = decoded.split(":");
  const expectedUser = process.env.DASHBOARD_USER || "mok";

  if (user === expectedUser && pwd === pass) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="MOK Agent Monitor"');
  return res.status(401).send("Invalid credentials");
}

/**
 * Validates HOOK_SECRET on the hooks endpoint.
 * If HOOK_SECRET is set, incoming hook events must include it
 * as a Bearer token or query parameter.
 */
function hookAuthMiddleware(req, res, next) {
  const secret = process.env.HOOK_SECRET;
  if (!secret) return next();

  const bearerToken = req.headers.authorization?.replace("Bearer ", "");
  const queryToken = req.query.secret;

  if (bearerToken === secret || queryToken === secret) {
    return next();
  }

  return res.status(403).json({ error: "Invalid hook secret" });
}

module.exports = { authMiddleware, hookAuthMiddleware };
