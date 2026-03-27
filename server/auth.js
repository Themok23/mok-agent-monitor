/**
 * Basic auth middleware for password-protecting the dashboard.
 * Reads credentials from environment variables:
 *   DASHBOARD_USER (default: "mok")
 *   DASHBOARD_PASS (required for auth to be active)
 *
 * If DASHBOARD_PASS is not set, auth is disabled (local dev mode).
 * The /api/hooks/event endpoint is exempted - it uses HOOK_SECRET instead.
 */

function authMiddleware(req, res, next) {
  const pass = process.env.DASHBOARD_PASS;

  // Auth disabled if no password configured
  if (!pass) return next();

  // Exempt the hooks endpoint - it authenticates via HOOK_SECRET
  if (req.path === "/api/hooks/event" || req.path === "/api/health") {
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
