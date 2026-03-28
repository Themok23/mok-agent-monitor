import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Columns3,
  Users,
  FolderOpen,
  Activity,
  BarChart3,
  Workflow,
  Settings,
  Wifi,
  WifiOff,
  Github,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Hexagon,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/kanban", icon: Columns3, label: "Agent Board" },
  { to: "/agents", icon: Users, label: "Agent Fleet" },
  { to: "/grid", icon: Hexagon, label: "Agent Grid 3D" },
  { to: "/sessions", icon: FolderOpen, label: "Sessions" },
  { to: "/activity", icon: Activity, label: "Activity Feed" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/workflows", icon: Workflow, label: "Workflows" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

const STORAGE_KEY = "sidebar-collapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

interface SidebarProps {
  wsConnected: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ wsConnected, collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 bg-[#060610] border-r border-cyan-500/10 flex flex-col z-30 overflow-y-auto overflow-x-hidden transition-[width] duration-200 ${
        collapsed ? "w-[4.25rem]" : "w-60"
      }`}
      style={{ boxShadow: "1px 0 20px rgba(0, 255, 255, 0.05)" }}
    >
      {/* Brand */}
      <div className="px-3 py-4 border-b border-cyan-500/10">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-2"}`}>
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-cyan-400 truncate" style={{ fontFamily: "Orbitron, monospace" }}>MOK HQ</h1>
              <p className="text-[11px] text-cyan-500/50">Agent Command Center</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(0,255,255,0.1)]"
                  : "text-gray-500 hover:text-cyan-300 hover:bg-cyan-500/5 border border-transparent"
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-2">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-gray-600 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 flex-shrink-0 mx-auto" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div
        className={`px-3 py-3 border-t border-cyan-500/10 space-y-2 ${collapsed ? "items-center" : ""}`}
      >
        <div className={`flex items-center text-xs ${collapsed ? "justify-center" : "gap-2"}`}>
          {wsConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" style={{ filter: "drop-shadow(0 0 4px rgba(0, 255, 255, 0.3))" }} />
              {!collapsed && <span className="text-cyan-400">Live</span>}
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              {!collapsed && <span className="text-gray-500">Disconnected</span>}
            </>
          )}
          {!collapsed && <span className="ml-auto text-gray-600">v1.0.0</span>}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Themok23/mok-agent-monitor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-cyan-400 transition-colors"
              title="GitHub"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://themok.company"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-cyan-400 transition-colors flex items-center gap-1 text-[11px]"
              title="themok.company"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>themok.company</span>
            </a>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center gap-2">
            <a
              href="https://github.com/Themok23/mok-agent-monitor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-cyan-400 transition-colors"
              title="GitHub"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://themok.company"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-cyan-400 transition-colors"
              title="themok.company"
            >
              <Globe className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}

export { STORAGE_KEY as SIDEBAR_STORAGE_KEY, loadCollapsed };
