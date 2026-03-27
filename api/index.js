/**
 * Vercel serverless API entry point.
 * Wraps the Express app for serverless deployment.
 * Uses Neon PostgreSQL instead of SQLite.
 */

const express = require("express");
const cors = require("cors");
const { authMiddleware, hookAuthMiddleware } = require("../server/auth");
const neonDb = require("../server/db-neon");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(authMiddleware);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), mode: "vercel" });
});

// Hooks endpoint (receives events from local Claude Code)
app.post("/api/hooks/event", hookAuthMiddleware, async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const { hook_type, data } = req.body;

    const sessionId = data?.session_id || data?.sessionId || "unknown";
    const toolName = data?.tool_name || data?.toolName || null;
    const model = data?.model || null;
    const cwd = data?.cwd || null;

    // Auto-create session if needed
    const existing = await neonDb.getSession(sessionId);
    if (!existing && sessionId !== "unknown") {
      await neonDb.insertSession(sessionId, null, "active", cwd, model, null);
      // Create main agent
      await neonDb.insertAgent(
        `${sessionId}-main`, sessionId, "main", "main",
        null, "connected", null, null, null
      );
    } else if (existing && existing.status !== "active") {
      await neonDb.reactivateSession(sessionId);
    }

    // Determine agent ID
    const agentId = data?.agent_id || `${sessionId}-main`;

    // Insert event
    await neonDb.insertEvent(
      sessionId, agentId, hook_type, toolName,
      data?.summary || null, JSON.stringify(data)
    );

    // Update agent status based on hook type
    if (hook_type === "PreToolUse") {
      await neonDb.updateAgent(null, "working", null, toolName, null, null, agentId).catch(() => {});
    } else if (hook_type === "PostToolUse") {
      await neonDb.updateAgent(null, "idle", null, null, null, null, agentId).catch(() => {});
    } else if (hook_type === "Stop" || hook_type === "SessionEnd") {
      await neonDb.updateSession(null, "completed", new Date().toISOString(), null, sessionId);
      await neonDb.updateAgent(null, "completed", null, null, new Date().toISOString(), null, agentId).catch(() => {});
    }

    // Update token usage if present
    if (data?.usage) {
      const u = data.usage;
      await neonDb.upsertTokenUsage(
        sessionId, model || "unknown",
        u.input_tokens || 0, u.output_tokens || 0,
        u.cache_read_tokens || 0, u.cache_write_tokens || 0
      ).catch(() => {});
    }

    await neonDb.touchSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Hook event error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Sessions
app.get("/api/sessions", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const limit = parseInt(req.query.limit || "50");
    const offset = parseInt(req.query.offset || "0");
    const status = req.query.status;
    const sessions = status
      ? await neonDb.listSessionsByStatus(status, limit, offset)
      : await neonDb.listSessions(limit, offset);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const session = await neonDb.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agents
app.get("/api/agents", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const sessionId = req.query.session_id;
    const status = req.query.status;
    const limit = parseInt(req.query.limit || "50");
    const offset = parseInt(req.query.offset || "0");
    let agents;
    if (sessionId) {
      agents = await neonDb.listAgentsBySession(sessionId);
    } else if (status) {
      agents = await neonDb.listAgentsByStatus(status, limit, offset);
    } else {
      agents = await neonDb.listAgentsByStatus("working", limit, offset);
    }
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Events
app.get("/api/events", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const sessionId = req.query.session_id;
    const limit = parseInt(req.query.limit || "100");
    const offset = parseInt(req.query.offset || "0");
    const events = sessionId
      ? await neonDb.listEventsBySession(sessionId)
      : await neonDb.listEvents(limit, offset);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats
app.get("/api/stats", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const stats = await neonDb.getStats();
    const agentCounts = await neonDb.agentStatusCounts();
    const sessionCounts = await neonDb.sessionStatusCounts();
    const tokens = await neonDb.getTokenTotals();
    res.json({
      ...stats,
      agent_status: agentCounts,
      session_status: sessionCounts,
      tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics
app.get("/api/analytics", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const [tools, dailyEvents, dailySessions, agentTypes, eventTypes] = await Promise.all([
      neonDb.toolUsageCounts(),
      neonDb.dailyEventCounts(),
      neonDb.dailySessionCounts(),
      neonDb.agentTypeDistribution(),
      neonDb.eventTypeCounts(),
    ]);
    res.json({
      tool_usage: tools,
      daily_events: dailyEvents,
      daily_sessions: dailySessions,
      agent_types: agentTypes,
      event_types: eventTypes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pricing
app.get("/api/pricing", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const pricing = await neonDb.listPricing();
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
