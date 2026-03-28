import type { LucideIcon } from "lucide-react";
import { Tip } from "./Tip";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accentColor?: string;
  /** Raw value shown as custom tooltip on hover */
  raw?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  accentColor = "text-accent",
  raw,
}: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span
          className="text-xs font-medium text-cyan-500/60 uppercase tracking-wider truncate"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          {label}
        </span>
        <Icon className={`w-5 h-5 flex-shrink-0 ${accentColor}`} />
      </div>
      <div className="flex items-end gap-2 min-w-0">
        <Tip raw={raw}>
          <span className="text-2xl font-semibold text-white truncate">{value}</span>
        </Tip>
        {trend && <span className="text-xs text-cyan-500/40 mb-1 flex-shrink-0">{trend}</span>}
      </div>
    </div>
  );
}
