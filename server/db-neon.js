/**
 * Neon PostgreSQL database adapter.
 * Drop-in replacement for db.js when running on Vercel.
 * Uses @neondatabase/serverless for HTTP-based queries.
 *
 * Requires: DATABASE_URL env var pointing to Neon connection string.
 */

const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

// Track if schema has been initialized
let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','error','abandoned')),
      cwd TEXT,
      model TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      metadata TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'main' CHECK(type IN ('main','subagent')),
      subagent_type TEXT,
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','connected','working','completed','error')),
      task TEXT,
      current_tool TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      parent_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      metadata TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      summary TEXT,
      data TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS token_usage (
      session_id TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'unknown',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      baseline_input INTEGER NOT NULL DEFAULT 0,
      baseline_output INTEGER NOT NULL DEFAULT 0,
      baseline_cache_read INTEGER NOT NULL DEFAULT 0,
      baseline_cache_write INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, model),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS model_pricing (
      model_pattern TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      input_per_mtok REAL NOT NULL DEFAULT 0,
      output_per_mtok REAL NOT NULL DEFAULT 0,
      cache_read_per_mtok REAL NOT NULL DEFAULT 0,
      cache_write_per_mtok REAL NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC)`;

  // Seed default pricing
  const pricingCount = await sql`SELECT COUNT(*) as c FROM model_pricing`;
  if (parseInt(pricingCount[0].c) === 0) {
    const defaults = [
      ["claude-opus-4-6%", "Claude Opus 4.6", 5, 25, 0.5, 6.25],
      ["claude-opus-4-5%", "Claude Opus 4.5", 5, 25, 0.5, 6.25],
      ["claude-sonnet-4-6%", "Claude Sonnet 4.6", 3, 15, 0.3, 3.75],
      ["claude-sonnet-4-5%", "Claude Sonnet 4.5", 3, 15, 0.3, 3.75],
      ["claude-haiku-4-5%", "Claude Haiku 4.5", 1, 5, 0.1, 1.25],
    ];
    for (const [pattern, name, inp, out, cr, cw] of defaults) {
      await sql`
        INSERT INTO model_pricing (model_pattern, display_name, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok)
        VALUES (${pattern}, ${name}, ${inp}, ${out}, ${cr}, ${cw})
        ON CONFLICT (model_pattern) DO NOTHING
      `;
    }
  }

  schemaReady = true;
}

/**
 * Async query wrapper that mirrors the SQLite prepared statement interface.
 * Returns objects compatible with the existing route handlers.
 */
const neonDb = {
  sql,
  ensureSchema,

  async getSession(id) {
    const rows = await sql`SELECT * FROM sessions WHERE id = ${id}`;
    return rows[0] || null;
  },

  async listSessions(limit, offset) {
    return sql`
      SELECT s.*, COUNT(a.id)::int as agent_count, s.updated_at as last_activity
      FROM sessions s LEFT JOIN agents a ON a.session_id = s.id
      GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
  },

  async listSessionsByStatus(status, limit, offset) {
    return sql`
      SELECT s.*, COUNT(a.id)::int as agent_count, s.updated_at as last_activity
      FROM sessions s LEFT JOIN agents a ON a.session_id = s.id
      WHERE s.status = ${status} GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
  },

  async insertSession(id, name, status, cwd, model, metadata) {
    await sql`
      INSERT INTO sessions (id, name, status, cwd, model, metadata)
      VALUES (${id}, ${name}, ${status}, ${cwd}, ${model}, ${metadata})
    `;
  },

  async updateSession(name, status, endedAt, metadata, id) {
    await sql`
      UPDATE sessions SET
        name = COALESCE(${name}, name),
        status = COALESCE(${status}, status),
        ended_at = COALESCE(${endedAt}::timestamptz, ended_at),
        metadata = COALESCE(${metadata}, metadata),
        updated_at = NOW()
      WHERE id = ${id}
    `;
  },

  async reactivateSession(id) {
    await sql`UPDATE sessions SET status = 'active', ended_at = NULL, updated_at = NOW() WHERE id = ${id}`;
  },

  async getAgent(id) {
    const rows = await sql`SELECT * FROM agents WHERE id = ${id}`;
    return rows[0] || null;
  },

  async listAgentsBySession(sessionId) {
    return sql`SELECT * FROM agents WHERE session_id = ${sessionId} ORDER BY started_at ASC`;
  },

  async listAgentsByStatus(status, limit, offset) {
    return sql`SELECT * FROM agents WHERE status = ${status} ORDER BY started_at DESC LIMIT ${limit} OFFSET ${offset}`;
  },

  async insertAgent(id, sessionId, name, type, subagentType, status, task, parentAgentId, metadata) {
    await sql`
      INSERT INTO agents (id, session_id, name, type, subagent_type, status, task, parent_agent_id, metadata)
      VALUES (${id}, ${sessionId}, ${name}, ${type}, ${subagentType}, ${status}, ${task}, ${parentAgentId}, ${metadata})
    `;
  },

  async updateAgent(name, status, task, currentTool, endedAt, metadata, id) {
    await sql`
      UPDATE agents SET
        name = COALESCE(${name}, name),
        status = COALESCE(${status}, status),
        task = COALESCE(${task}, task),
        current_tool = ${currentTool},
        ended_at = COALESCE(${endedAt}::timestamptz, ended_at),
        metadata = COALESCE(${metadata}, metadata),
        updated_at = NOW()
      WHERE id = ${id}
    `;
  },

  async reactivateAgent(id) {
    await sql`UPDATE agents SET status = 'connected', ended_at = NULL, current_tool = NULL, updated_at = NOW() WHERE id = ${id}`;
  },

  async touchSession(id) {
    await sql`UPDATE sessions SET updated_at = NOW() WHERE id = ${id}`;
  },

  async insertEvent(sessionId, agentId, eventType, toolName, summary, data) {
    await sql`
      INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, data)
      VALUES (${sessionId}, ${agentId}, ${eventType}, ${toolName}, ${summary}, ${data})
    `;
  },

  async listEvents(limit, offset) {
    return sql`SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`;
  },

  async listEventsBySession(sessionId) {
    return sql`SELECT * FROM events WHERE session_id = ${sessionId} ORDER BY created_at DESC, id DESC`;
  },

  async getStats() {
    const rows = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM sessions) as total_sessions,
        (SELECT COUNT(*)::int FROM sessions WHERE status = 'active') as active_sessions,
        (SELECT COUNT(*)::int FROM agents WHERE status IN ('working', 'connected', 'idle')) as active_agents,
        (SELECT COUNT(*)::int FROM agents) as total_agents,
        (SELECT COUNT(*)::int FROM events) as total_events
    `;
    return rows[0];
  },

  async agentStatusCounts() {
    return sql`SELECT status, COUNT(*)::int as count FROM agents GROUP BY status`;
  },

  async sessionStatusCounts() {
    return sql`SELECT status, COUNT(*)::int as count FROM sessions GROUP BY status`;
  },

  async upsertTokenUsage(sessionId, model, input, output, cacheRead, cacheWrite) {
    await sql`
      INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
      VALUES (${sessionId}, ${model}, ${input}, ${output}, ${cacheRead}, ${cacheWrite})
      ON CONFLICT(session_id, model) DO UPDATE SET
        input_tokens = token_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = token_usage.output_tokens + EXCLUDED.output_tokens,
        cache_read_tokens = token_usage.cache_read_tokens + EXCLUDED.cache_read_tokens,
        cache_write_tokens = token_usage.cache_write_tokens + EXCLUDED.cache_write_tokens
    `;
  },

  async getTokenTotals() {
    const rows = await sql`
      SELECT
        COALESCE(SUM(input_tokens + baseline_input), 0)::int as total_input,
        COALESCE(SUM(output_tokens + baseline_output), 0)::int as total_output,
        COALESCE(SUM(cache_read_tokens + baseline_cache_read), 0)::int as total_cache_read,
        COALESCE(SUM(cache_write_tokens + baseline_cache_write), 0)::int as total_cache_write
      FROM token_usage
    `;
    return rows[0];
  },

  async getTokensBySession(sessionId) {
    return sql`
      SELECT model,
        (input_tokens + baseline_input)::int as input_tokens,
        (output_tokens + baseline_output)::int as output_tokens,
        (cache_read_tokens + baseline_cache_read)::int as cache_read_tokens,
        (cache_write_tokens + baseline_cache_write)::int as cache_write_tokens
      FROM token_usage WHERE session_id = ${sessionId}
    `;
  },

  async listPricing() {
    return sql`SELECT * FROM model_pricing ORDER BY display_name ASC`;
  },

  async toolUsageCounts() {
    return sql`
      SELECT tool_name, COUNT(*)::int as count
      FROM events WHERE tool_name IS NOT NULL
      GROUP BY tool_name ORDER BY count DESC LIMIT 20
    `;
  },

  async dailyEventCounts() {
    return sql`
      SELECT DATE(created_at)::text as date, COUNT(*)::int as count
      FROM events WHERE created_at >= NOW() - INTERVAL '365 days'
      GROUP BY DATE(created_at) ORDER BY date ASC
    `;
  },

  async dailySessionCounts() {
    return sql`
      SELECT DATE(started_at)::text as date, COUNT(*)::int as count
      FROM sessions WHERE started_at >= NOW() - INTERVAL '365 days'
      GROUP BY DATE(started_at) ORDER BY date ASC
    `;
  },

  async agentTypeDistribution() {
    return sql`
      SELECT subagent_type, COUNT(*)::int as count
      FROM agents WHERE type = 'subagent' AND subagent_type IS NOT NULL
      GROUP BY subagent_type ORDER BY count DESC
    `;
  },

  async eventTypeCounts() {
    return sql`
      SELECT event_type, COUNT(*)::int as count
      FROM events GROUP BY event_type ORDER BY count DESC
    `;
  },
};

module.exports = neonDb;
