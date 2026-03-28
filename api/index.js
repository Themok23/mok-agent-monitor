/**
 * Vercel serverless API entry point.
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

// Hooks endpoint
app.post("/api/hooks/event", hookAuthMiddleware, async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const { hook_type, data } = req.body;

    const sessionId = data?.session_id || data?.sessionId || "unknown";
    const toolName = data?.tool_name || data?.toolName || null;
    const model = data?.model || null;
    const cwd = data?.cwd || null;

    const existing = await neonDb.getSession(sessionId);
    if (!existing && sessionId !== "unknown") {
      await neonDb.insertSession(sessionId, null, "active", cwd, model, null);
      await neonDb.insertAgent(
        `${sessionId}-main`, sessionId, "main", "main",
        null, "connected", null, null, null
      );
    } else if (existing && existing.status !== "active") {
      await neonDb.reactivateSession(sessionId);
    }

    const agentId = data?.agent_id || `${sessionId}-main`;

    await neonDb.insertEvent(
      sessionId, agentId, hook_type, toolName,
      data?.summary || null, JSON.stringify(data)
    );

    if (hook_type === "PreToolUse") {
      await neonDb.updateAgent(null, "working", null, toolName, null, null, agentId).catch(() => {});
    } else if (hook_type === "PostToolUse") {
      await neonDb.updateAgent(null, "idle", null, null, null, null, agentId).catch(() => {});
    } else if (hook_type === "Stop") {
      // Stop = Claude finished its turn, agent goes idle (not completed)
      await neonDb.updateAgent(null, "idle", null, null, null, null, agentId).catch(() => {});
    } else if (hook_type === "SessionEnd") {
      await neonDb.updateSession(null, "completed", new Date().toISOString(), null, sessionId);
      await neonDb.updateAgent(null, "completed", null, null, new Date().toISOString(), null, agentId).catch(() => {});
    } else if (hook_type === "TeammateIdle") {
      // Teammate finished work, waiting for new tasks
      await neonDb.updateAgent(null, "idle", null, null, null, null, agentId).catch(() => {});
    } else if (hook_type === "SubagentStop") {
      await neonDb.updateAgent(null, "completed", null, null, new Date().toISOString(), null, agentId).catch(() => {});
    }
    // TaskCreated and TaskCompleted are recorded as events (already inserted above)

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
    const rows = status
      ? await neonDb.listSessionsByStatus(status, limit, offset)
      : await neonDb.listSessions(limit, offset);
    // Wrap in { sessions: [...] } to match frontend expectations
    const sessions = Array.isArray(rows) ? rows : (rows?.sessions || rows || []);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const session = await neonDb.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const agents = await neonDb.listAgentsBySession(req.params.id);
    const events = await neonDb.listEventsBySession(req.params.id);
    res.json({
      session,
      agents: Array.isArray(agents) ? agents : (agents?.agents || []),
      events: Array.isArray(events) ? events : (events?.events || []),
    });
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
    let rows;
    if (sessionId) {
      rows = await neonDb.listAgentsBySession(sessionId);
    } else if (status) {
      rows = await neonDb.listAgentsByStatus(status, limit, offset);
    } else {
      rows = await neonDb.listAgentsByStatus("working", limit, offset);
    }
    // Wrap in { agents: [...] }
    const agents = Array.isArray(rows) ? rows : (rows?.agents || []);
    res.json({ agents });
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
    const rows = sessionId
      ? await neonDb.listEventsBySession(sessionId)
      : await neonDb.listEvents(limit, offset);
    const events = Array.isArray(rows) ? rows : (rows?.events || []);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats - match the frontend Stats type exactly
app.get("/api/stats", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const stats = await neonDb.getStats();
    const agentCounts = await neonDb.agentStatusCounts();
    const sessionCounts = await neonDb.sessionStatusCounts();
    const tokens = await neonDb.getTokenTotals();

    // Convert arrays to Record<string, number> for frontend compatibility
    const agents_by_status = {};
    (Array.isArray(agentCounts) ? agentCounts : []).forEach(r => {
      agents_by_status[r.status] = parseInt(r.count) || 0;
    });
    const sessions_by_status = {};
    (Array.isArray(sessionCounts) ? sessionCounts : []).forEach(r => {
      sessions_by_status[r.status] = parseInt(r.count) || 0;
    });

    res.json({
      total_sessions: stats?.total_sessions || 0,
      active_sessions: stats?.active_sessions || 0,
      active_agents: stats?.active_agents || 0,
      total_agents: stats?.total_agents || 0,
      total_events: stats?.total_events || 0,
      events_today: stats?.events_today || 0,
      ws_connections: 0,
      agents_by_status,
      sessions_by_status,
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

// Pricing endpoints
app.get("/api/pricing", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    const pricing = await neonDb.listPricing().catch(() => []);
    res.json({ pricing: Array.isArray(pricing) ? pricing : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pricing/cost", async (req, res) => {
  try {
    await neonDb.ensureSchema();
    // Calculate total cost from token usage and pricing rules
    const tokens = await neonDb.getTokenTotals().catch(() => ({
      total_input: 0, total_output: 0, total_cache_read: 0, total_cache_write: 0
    }));
    // Simple cost estimate (Claude pricing ballpark)
    const inputCost = ((tokens?.total_input || 0) / 1_000_000) * 3;
    const outputCost = ((tokens?.total_output || 0) / 1_000_000) * 15;
    const cacheReadCost = ((tokens?.total_cache_read || 0) / 1_000_000) * 0.3;
    const cacheWriteCost = ((tokens?.total_cache_write || 0) / 1_000_000) * 3.75;
    const total_cost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    res.json({
      total_cost: Math.round(total_cost * 100) / 100,
      breakdown: [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pricing/cost/:sessionId", async (req, res) => {
  try {
    res.json({ total_cost: 0, breakdown: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings info
app.get("/api/settings/info", async (req, res) => {
  try {
    res.json({
      db: { path: "neon", size: 0, counts: {} },
      hooks: { installed: true, path: "remote", hooks: {} },
      server: { uptime: process.uptime(), node_version: process.version, platform: "vercel", ws_connections: 0 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Workflows stub
app.get("/api/workflows", async (req, res) => {
  try {
    res.json({
      stats: { totalSessions: 0, totalAgents: 0, totalSubagents: 0, avgSubagents: 0, successRate: 0, avgDepth: 0, avgDurationSec: 0, totalCompactions: 0, avgCompactions: 0, topFlow: null },
      orchestration: { sessionCount: 0, mainCount: 0, subagentTypes: [], edges: [], outcomes: [], compactions: { total: 0, sessions: 0 } },
      toolFlow: { transitions: [], toolCounts: [] },
      effectiveness: [],
      patterns: { patterns: [], soloSessionCount: 0, soloPercentage: 0 },
      modelDelegation: { mainModels: [], subagentModels: [], tokensByModel: [] },
      errorPropagation: { byDepth: [], byType: [], sessionsWithErrors: 0, totalSessions: 0, errorRate: 0 },
      concurrency: { aggregateLanes: [] },
      complexity: [],
      compaction: { totalCompactions: 0, tokensRecovered: 0, perSession: [], sessionsWithCompactions: 0, totalSessions: 0 },
      cooccurrence: [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
