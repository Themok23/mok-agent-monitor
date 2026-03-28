#!/usr/bin/env node

/**
 * Claude Code hook handler.
 * Receives hook event JSON on stdin and forwards it to:
 *   1. Local Agent Dashboard (localhost:4820)
 *   2. Remote Vercel dashboard (if DASHBOARD_REMOTE_URL is set)
 *
 * Runs async - fires HTTP requests and exits when done.
 * Designed to fail silently so it never blocks Claude Code.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const hookType = process.argv[2] || "unknown";
const localPort = parseInt(process.env.CLAUDE_DASHBOARD_PORT || "4820", 10);
const remoteUrl = process.env.DASHBOARD_REMOTE_URL || "";
const hookSecret = process.env.HOOK_SECRET || "";

// Debug log (rotates at 100KB)
const logFile = path.join(__dirname, ".hook-debug.log");
function debugLog(msg) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    let size = 0;
    try { size = fs.statSync(logFile).size; } catch {}
    if (size > 100000) fs.writeFileSync(logFile, line);
    else fs.appendFileSync(logFile, line);
  } catch {}
}

let input = "";
let pending = 0;

function done() {
  pending--;
  if (pending <= 0) process.exit(0);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let parsedData;
  try {
    parsedData = JSON.parse(input);
  } catch {
    parsedData = { raw: input };
  }

  const sessionId = parsedData?.session_id || parsedData?.sessionId || "unknown";
  debugLog(`${hookType} session=${sessionId} tool=${parsedData?.tool_name || "-"}`);

  const payload = JSON.stringify({
    hook_type: hookType,
    data: parsedData,
  });

  pending = 1; // At least local

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
      timeout: 2000,
    },
    (res) => {
      res.resume();
      res.on("end", done);
    }
  );
  localReq.on("error", (err) => {
    debugLog(`LOCAL ERROR: ${err.message}`);
    done();
  });
  localReq.on("timeout", () => {
    debugLog("LOCAL TIMEOUT");
    localReq.destroy();
    done();
  });
  localReq.write(payload);
  localReq.end();

  // 2. POST to remote dashboard (if configured)
  if (remoteUrl) {
    pending++;
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
          timeout: 4000,
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            debugLog(`REMOTE OK: ${res.statusCode}`);
            done();
          });
        }
      );
      remoteReq.on("error", (err) => {
        debugLog(`REMOTE ERROR: ${err.message}`);
        done();
      });
      remoteReq.on("timeout", () => {
        debugLog("REMOTE TIMEOUT");
        remoteReq.destroy();
        done();
      });
      remoteReq.write(payload);
      remoteReq.end();
    } catch (err) {
      debugLog(`REMOTE SETUP ERROR: ${err.message}`);
      done();
    }
  }
});

// Safety net - force exit after 8 seconds no matter what
setTimeout(() => process.exit(0), 8000);
