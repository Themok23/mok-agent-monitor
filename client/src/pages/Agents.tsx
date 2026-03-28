import { useState, useEffect, useCallback, useMemo } from "react";
import { Users, ChevronDown, Search, Activity } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { Agent, AgentStatus, WSMessage } from "../lib/types";
import { STATUS_CONFIG } from "../lib/types";
import { timeAgo } from "../lib/format";

type FilterStatus = AgentStatus | "all";
type FilterType = "all" | "main" | "subagent";

interface SummaryStats {
  totalAgents: number;
  activeAgents: number;
  completedToday: number;
  avgSessionDuration: number;
}



export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      setError(null);
      const response = await api.agents.list({
        status: filterStatus === "all" ? undefined : filterStatus,
        limit: 1000,
        offset: 0,
      });
      setAgents(response.agents || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch agents"
      );
      console.error("Error fetching agents:", err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAgents();
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchAgents]);

  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (msg.type === "agent_created" || msg.type === "agent_updated") {
        fetchAgents();
      }
    });
  }, [fetchAgents]);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const statusMatch =
        filterStatus === "all" || agent.status === filterStatus;
      const typeMatch =
        filterType === "all" ||
        (filterType === "main" && agent.type === "main") ||
        (filterType === "subagent" && agent.type === "subagent");
      const searchMatch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.session_id?.toLowerCase().includes(searchQuery.toLowerCase());

      return statusMatch && typeMatch && searchMatch;
    });
  }, [agents, filterStatus, filterType, searchQuery]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const completedToday = agents.filter((a) => {
      if (!a.ended_at) return false;
      const endDate = new Date(a.ended_at);
      const endDateOnly = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate()
      );
      return endDateOnly.getTime() === today.getTime();
    }).length;

    const activeDurations = agents
      .filter((a) => a.started_at && a.ended_at)
      .map((a) => {
        const start = new Date(a.started_at!).getTime();
        const end = new Date(a.ended_at!).getTime();
        return (end - start) / (1000 * 60 * 60); // Convert to hours
      });

    const avgDuration =
      activeDurations.length > 0
        ? activeDurations.reduce((a, b) => a + b, 0) /
          activeDurations.length
        : 0;

    const activeAgents = agents.filter(
      (a) => a.status === "working" || a.status === "connected"
    ).length;

    return {
      totalAgents: agents.length,
      activeAgents,
      completedToday,
      avgSessionDuration: avgDuration,
    } as SummaryStats;
  }, [agents]);

  const workDayGroups = useMemo(() => {
    const now = new Date();
    const groups: Record<string, Agent[]> = {};

    agents.forEach((agent) => {
      if (!agent.ended_at) return;

      const endDate = new Date(agent.ended_at);
      const dayKey = `${endDate.getFullYear()}-${String(
        endDate.getMonth() + 1
      ).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(agent);
    });

    return Object.entries(groups)
      .map(([date, dayAgents]) => {
        const dateObj = new Date(date);
        const daysDiff = Math.floor(
          (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24)
        );

        let label = "Unknown";
        if (daysDiff === 0) label = "Today";
        else if (daysDiff === 1) label = "Yesterday";
        else if (daysDiff < 7) label = `${daysDiff} days ago`;
        else if (daysDiff < 30) label = `${Math.floor(daysDiff / 7)} weeks ago`;
        else label = dateObj.toLocaleDateString();

        const totalHours = dayAgents.reduce((sum, agent) => {
          if (!agent.started_at || !agent.ended_at) return sum;
          const start = new Date(agent.started_at).getTime();
          const end = new Date(agent.ended_at).getTime();
          return sum + (end - start) / (1000 * 60 * 60);
        }, 0);

        return { date, label, totalHours, agents: dayAgents };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [agents]);

  const maxHours = useMemo(() => {
    return Math.max(...workDayGroups.map((g) => g.totalHours), 1);
  }, [workDayGroups]);

  const getStatusColor = (status: AgentStatus): string => {
    const config = STATUS_CONFIG[status];
    return config?.color || "text-gray-400";
  };

  const calculateDuration = (
    startedAt: string | undefined,
    endedAt: string | undefined
  ): string => {
    if (!startedAt) return "-";

    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const ms = end - start;

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  if (loading && agents.length === 0) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border border-cyan-500 border-t-cyan-400 mb-4" />
          <p className="text-cyan-400">Loading agent fleet data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-cyan-400" />
          <h1
            className="text-4xl font-bold text-cyan-400"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            Agent Fleet
          </h1>
        </div>
        <p className="text-white0/50 text-sm">
          Detailed Agent Analytics & Work Time
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg p-6">
          <p
            className="text-white0/40 text-sm mb-2"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            TOTAL AGENTS
          </p>
          <p className="text-3xl font-bold text-cyan-400">
            {stats.totalAgents}
          </p>
          <p className="text-white0/30 text-xs mt-2">All time</p>
        </div>

        <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg p-6">
          <p
            className="text-white0/40 text-sm mb-2"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            ACTIVE NOW
          </p>
          <p className="text-3xl font-bold text-emerald-400">
            {stats.activeAgents}
          </p>
          <p className="text-white0/30 text-xs mt-2">Working or connected</p>
        </div>

        <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg p-6">
          <p
            className="text-white0/40 text-sm mb-2"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            COMPLETED TODAY
          </p>
          <p className="text-3xl font-bold text-violet-400">
            {stats.completedToday}
          </p>
          <p className="text-white0/30 text-xs mt-2">Finished sessions</p>
        </div>

        <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg p-6">
          <p
            className="text-white0/40 text-sm mb-2"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            AVG DURATION
          </p>
          <p className="text-3xl font-bold text-blue-400">
            {stats.avgSessionDuration.toFixed(1)}h
          </p>
          <p className="text-white0/30 text-xs mt-2">Per session</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg p-4 mb-8">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-white0/40" />
            <input
              type="text"
              placeholder="Search agents by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black border border-cyan-500/20 rounded px-3 py-2 pl-10 text-white text-sm placeholder-cyan-500/30 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as FilterStatus)
              }
              className="bg-black border border-cyan-500/20 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400 appearance-none pr-8"
            >
              <option value="all">All Status</option>
              <option value="idle">Idle</option>
              <option value="connected">Connected</option>
              <option value="working">Working</option>
              <option value="completed">Completed</option>
              <option value="error">Error</option>
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-white0/40 pointer-events-none" />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="bg-black border border-cyan-500/20 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400 appearance-none pr-8"
            >
              <option value="all">All Types</option>
              <option value="main">Main Agents</option>
              <option value="subagent">Subagents</option>
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-white0/40 pointer-events-none" />
          </div>

          {/* Auto-refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
              autoRefresh
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-400"
                : "bg-black border-cyan-500/20 text-white0/40 hover:border-cyan-500/40"
            }`}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            {autoRefresh ? "Live" : "Paused"}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Agent Table */}
      <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg overflow-hidden mb-8">
        {filteredAgents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-white0/40 text-sm">
              {searchQuery || filterStatus !== "all" || filterType !== "all"
                ? "No agents match your filters"
                : "No agents found"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-cyan-500/10 bg-black/50">
                <tr>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Agent Name
                  </th>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Session
                  </th>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Current Tool
                  </th>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Work Time
                  </th>
                  <th className="px-4 py-3 text-left text-cyan-300 font-semibold">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b border-cyan-500/5 hover:bg-cyan-500/5 transition-colors"
                  >
                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            agent.status === "working"
                              ? "animate-pulse bg-emerald-400"
                              : agent.status === "connected"
                                ? "bg-blue-400"
                                : agent.status === "completed"
                                  ? "bg-violet-400"
                                  : agent.status === "error"
                                    ? "bg-red-400"
                                    : "bg-gray-400"
                          }`}
                        />
                        <span className={`text-xs font-medium ${getStatusColor(agent.status)}`}>
                          {agent.status.toUpperCase()}
                        </span>
                      </div>
                    </td>

                    {/* Agent Name */}
                    <td className="px-4 py-3">
                      <p className="text-white truncate" title={agent.name}>
                        {agent.name}
                      </p>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      {agent.type === "main" ? (
                        <span className="px-2 py-1 bg-cyan-500/20 text-cyan-300 text-xs rounded border border-cyan-500/30">
                          Main
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-violet-500/20 text-violet-300 text-xs rounded border border-violet-500/30">
                          {agent.subagent_type || "Subagent"}
                        </span>
                      )}
                    </td>

                    {/* Session */}
                    <td className="px-4 py-3">
                      <a
                        href={`/sessions/${agent.session_id}`}
                        className="text-blue-400 hover:text-blue-300 text-xs font-mono"
                        title={agent.session_id}
                      >
                        {agent.session_id?.slice(0, 8) || "-"}
                      </a>
                    </td>

                    {/* Current Tool */}
                    <td className="px-4 py-3">
                      <p
                        className="text-white/90/60 text-xs truncate"
                        title={agent.current_tool || ""}
                      >
                        {agent.current_tool
                          ? agent.current_tool.split("/").pop() || agent.current_tool
                          : "-"}
                      </p>
                    </td>

                    {/* Work Duration */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!agent.ended_at &&
                          (agent.status === "working" ||
                            agent.status === "connected") && (
                            <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                          )}
                        <p className="text-white/90/60 text-xs font-mono">
                          {calculateDuration(
                            agent.started_at,
                            agent.ended_at ?? undefined
                          )}
                        </p>
                      </div>
                    </td>

                    {/* Last Activity */}
                    <td className="px-4 py-3">
                      <p className="text-white0/60 text-xs">
                        {agent.updated_at
                          ? timeAgo(agent.updated_at)
                          : "-"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Work Time Breakdown */}
      {workDayGroups.length > 0 && (
        <div className="bg-[#0a0e1f] border border-cyan-500/10 rounded-lg p-6">
          <h2
            className="text-cyan-300 text-lg font-bold mb-6"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            Work Time Breakdown
          </h2>

          <div className="space-y-4">
            {workDayGroups.map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/90 text-sm font-medium">
                    {group.label}
                  </p>
                  <p className="text-cyan-400 text-sm font-semibold">
                    {group.totalHours.toFixed(1)}h
                  </p>
                </div>

                {/* Bar Visualization */}
                <div className="bg-black rounded overflow-hidden h-6 border border-cyan-500/10">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300"
                    style={{
                      width: `${(group.totalHours / maxHours) * 100}%`,
                    }}
                  />
                </div>

                {/* Agent breakdown */}
                <p className="text-white0/40 text-xs mt-2">
                  {group.agents.length} agent
                  {group.agents.length !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
