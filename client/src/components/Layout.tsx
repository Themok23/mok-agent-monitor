import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, SIDEBAR_STORAGE_KEY, loadCollapsed } from "./Sidebar";

interface LayoutProps {
  wsConnected: boolean;
}

export function Layout({ wsConnected }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#03030a]">
      <Sidebar wsConnected={wsConnected} collapsed={collapsed} onToggle={toggle} />
      <main
        className="min-h-screen min-w-0 transition-[margin-left,width] duration-200 relative border-t border-cyan-500/30 shadow-[inset_0_1px_0_rgba(34,211,238,0.4)]"
        style={{
          marginLeft: collapsed ? "4.25rem" : "15rem",
          width: collapsed ? "calc(100% - 4.25rem)" : "calc(100% - 15rem)",
          backgroundImage: "repeating-linear-gradient(0deg, rgba(34, 211, 238, 0.02) 0px, rgba(34, 211, 238, 0.02) 1px, transparent 1px, transparent 2px)",
        }}
      >
        <div className="p-8 max-w-full overflow-x-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: "linear-gradient(0deg, transparent 24%, rgba(34, 211, 238, 0.1) 25%, rgba(34, 211, 238, 0.1) 26%, transparent 27%, transparent 74%, rgba(34, 211, 238, 0.1) 75%, rgba(34, 211, 238, 0.1) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(34, 211, 238, 0.1) 25%, rgba(34, 211, 238, 0.1) 26%, transparent 27%, transparent 74%, rgba(34, 211, 238, 0.1) 75%, rgba(34, 211, 238, 0.1) 76%, transparent 77%, transparent)", backgroundSize: "50px 50px" }} />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
