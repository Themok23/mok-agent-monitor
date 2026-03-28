import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Home } from "lucide-react";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center animate-fade-in">
      <div className="card max-w-xl w-full p-8 md:p-10 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-cyan-400" />
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-cyan-500/40 mb-2">404</p>
        <h2 className="text-2xl font-semibold text-cyan-400 mb-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>Page not found</h2>
        <p className="text-sm text-cyan-200 mb-8">
          The route you requested does not exist. Use navigation to return to a valid page.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn-primary" onClick={() => navigate("/")}>
            <Home className="w-4 h-4" />
            Go to Dashboard
          </button>
          <button
            className="btn-ghost border border-cyan-500/20 hover:border-cyan-400 text-cyan-400 hover:text-cyan-300"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
