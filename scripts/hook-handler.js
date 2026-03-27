#!/usr/bin/env node

/**
 * Claude Code hook handler.
 * Receives hook event JSON on stdin and forwards it to:
 *   1. Local Agent Dashboard (localhost:4820)
 *   2. Remote Vercel dashboard (if DASHBOARD_REMOTE_URL is set)
 *
 * Designed to fail silently so it never blocks Claude Code.
 */

const http = require("http");
const https = require("https");

const hookType = process.argv[2] || "unknown";
const localPort = parseInt(process.env.CLAUDE_DASHBOARD_PORT || "4820", 10);
const remoteUrl = process.env.DASHBOARD_REMOTE_URL || "";
const hookSecret = process.env.HOOK_SECRET || "";

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let parsedData;
  try {
    parsedData = JSON.parse(input);
  } catch {
    parsedData = { raw: input };
  }

  const payload = JSON.stringify({
    hook_type: hookType,
    data: parsedData,
  });

  // 1. POST to local dashboard
  const localReq = http.request(
    {
      hostname: "127.0.0.1",
      port: localPort,
      path: "/api/hooks/event",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 3000,
    },
    (res) => res.resume()
  );
  localReq.on("error", () => {});
  localReq.on("timeout", () => localReq.destroy());
  localReq.write(payload);
  localReq.end();

  // 2. POST to remote dashboard (if configured)
  if (remoteUrl) {
    try {
      const url = new URL("/api/hooks/event", remoteUrl);
      const isHttps = url.protocol === "https:";
      const mod = isHttps ? https : http;
      const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      };
      if (hookSecret) {
        headers["Authorization"] = "Bearer " + hookSecret;
      }
      const remoteReq = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: "POST",
          headers,
          timeout: 5000,
        },
        (res) => res.resume()
      );
      remoteReq.on("error", () => {});
      remoteReq.on("timeout", () => remoteReq.destroy());
      remoteReq.write(payload);
      remoteReq.end();
    } catch {
      // Silent fail - never block Claude Code
    }
  }

  // Exit after giving requests time to complete
  setTimeout(() => process.exit(0), remoteUrl ? 3000 : 1000);
});

// Safety net timeout
setTimeout(() => process.exit(0), 8000);
