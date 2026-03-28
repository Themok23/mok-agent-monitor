import { STATUS_CONFIG, SESSION_STATUS_CONFIG } from "../lib/types";
import type { AgentStatus, SessionStatus } from "../lib/types";

interface AgentStatusBadgeProps {
  status: AgentStatus;
  pulse?: boolean;
}

const CYBERPUNK_STATUS_STYLES = {
  working: {
    bg: "bg-cyan-500/20",
    color: "text-cyan-400",
    border: "border border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  connected: {
    bg: "bg-blue-500/20",
    color: "text-blue-400",
    border: "border border-blue-500/30",
    dot: "bg-blue-400",
  },
  idle: {
    bg: "bg-purple-500/20",
    color: "text-purple-400",
    border: "border border-purple-500/30",
    dot: "bg-purple-400",
  },
  completed: {
    bg: "bg-emerald-500/20",
    color: "text-emerald-400",
    border: "border border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  error: {
    bg: "bg-red-500/20",
    color: "text-red-400",
    border: "border border-red-500/30",
    dot: "bg-red-400",
  },
} as const;

export function AgentStatusBadge({ status, pulse }: AgentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const cyberpunkStyle = CYBERPUNK_STATUS_STYLES[status as keyof typeof CYBERPUNK_STATUS_STYLES];
  const shouldPulse = pulse ?? (status === "working" || status === "connected");

  return (
    <span className={`badge ${cyberpunkStyle.bg} ${cyberpunkStyle.color} ${cyberpunkStyle.border}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${cyberpunkStyle.dot} ${
          shouldPulse ? "animate-pulse-dot shadow-lg shadow-current" : ""
        }`}
      />
      {config.label}
    </span>
  );
}

interface SessionStatusBadgeProps {
  status: SessionStatus;
}

export function SessionStatusBadge({ status }: SessionStatusBadgeProps) {
  const config = SESSION_STATUS_CONFIG[status];
  return <span className={`badge ${config.bg} ${config.color}`}>{config.label}</span>;
}
