import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#0a0e1f] border border-cyan-500/10 flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-cyan-500/30" />
      </div>
      <h3 className="text-base font-medium text-cyan-200 mb-2">{title}</h3>
      <p className="text-sm text-cyan-500/40 max-w-md mb-6">{description}</p>
      {action}
    </div>
  );
}
