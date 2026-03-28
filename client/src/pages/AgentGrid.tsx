import { useEffect, useState, useCallback, useRef, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { Agent, Stats, WSMessage } from "../lib/types";

// Status -> color + glow
const STATUS_MAP: Record<string, { color: string; emissive: number; label: string }> = {
  working:   { color: "#00ffcc", emissive: 2.0, label: "WORKING" },
  connected: { color: "#4488ff", emissive: 1.5, label: "CONNECTED" },
  idle:      { color: "#ff9900", emissive: 1.2, label: "IDLE" },
  completed: { color: "#334455", emissive: 0.4, label: "DONE" },
  error:     { color: "#ff2244", emissive: 1.8, label: "ERROR" },
};

// Floating agent node
function AgentNode({
  agent,
  position,
  isMain,
}: {
  agent: Agent;
  position: [number, number, number];
  isMain: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cfg = STATUS_MAP[agent.status] || STATUS_MAP["idle"]!;
  const color = new THREE.Color(cfg.color);
  const radius = isMain ? 0.8 : 0.45;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    // Breathing animation for active agents
    if (agent.status === "working") {
      meshRef.current.scale.setScalar(1 + Math.sin(t * 3 + position[0]) * 0.15);
    } else if (agent.status === "idle") {
      meshRef.current.scale.setScalar(1 + Math.sin(t * 1.5 + position[0]) * 0.08);
    }
    // Gentle float
    meshRef.current.position.y = position[1] + Math.sin(t * 0.8 + position[0] * 0.5) * 0.2;
  });

  return (
    <group position={position}>
      {/* Core sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={cfg.emissive}
          metalness={0.6}
          roughness={0.3}
          transparent
          opacity={agent.status === "completed" ? 0.4 : 0.9}
        />
      </mesh>
      {/* Outer ring for main agents */}
      {isMain && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.2, 0.04, 8, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={cfg.emissive * 0.5}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
      {/* Tool indicator */}
      {agent.current_tool && (
        <Text
          position={[0, -radius - 0.5, 0]}
          fontSize={0.22}
          color="#00ffcc"
          anchorX="center"
          anchorY="top"
          font="/fonts/orbitron.woff"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {agent.current_tool}
        </Text>
      )}
      {/* Agent name */}
      <Text
        position={[0, radius + 0.4, 0]}
        fontSize={isMain ? 0.28 : 0.2}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        maxWidth={4}
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {agent.name?.slice(0, 30) || "Agent"}
      </Text>
      {/* Status label */}
      <Text
        position={[0, radius + 0.15, 0]}
        fontSize={0.14}
        color={cfg.color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.008}
        outlineColor="#000000"
      >
        {cfg.label}
      </Text>
    </group>
  );
}

// Connection line between agents
function ConnectionLine({
  from,
  to,
  active,
}: {
  from: [number, number, number];
  to: [number, number, number];
  active: boolean;
}) {
  return (
    <Line
      points={[new THREE.Vector3(...from), new THREE.Vector3(...to)]}
      color={active ? "#00ffcc" : "#223344"}
      lineWidth={active ? 2 : 1}
      transparent
      opacity={active ? 0.6 : 0.2}
      dashed={!active}
      dashScale={4}
      dashSize={0.5}
      gapSize={0.3}
    />
  );
}

// Grid floor
function Floor() {
  return (
    <group>
      <gridHelper args={[60, 60, "#0a1a2a", "#060e18"]} position={[0, -5, 0]} />
      <mesh position={[0, -5.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#030810" emissive="#010408" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// Scene
function Scene({ agents }: { agents: Agent[] }) {
  // Separate main and sub agents
  const mainAgents = useMemo(() => agents.filter((a) => a.type === "main"), [agents]);
  const subAgents = useMemo(() => agents.filter((a) => a.type === "subagent"), [agents]);

  // Layout main agents in a circle
  const mainPositions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    const count = mainAgents.length;
    const baseRadius = Math.max(5, count * 2.2);
    mainAgents.forEach((agent, i) => {
      const angle = (i / Math.max(count, 1)) * Math.PI * 2;
      const x = Math.cos(angle) * baseRadius;
      const z = Math.sin(angle) * baseRadius;
      map.set(agent.id, [x, 0, z]);
    });
    return map;
  }, [mainAgents]);

  // Layout sub agents around their parent
  const subPositions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    // Group subs by parent
    const grouped = new Map<string, Agent[]>();
    for (const sub of subAgents) {
      const parentId = sub.parent_agent_id || `${sub.session_id}-main`;
      if (!grouped.has(parentId)) grouped.set(parentId, []);
      grouped.get(parentId)!.push(sub);
    }

    for (const [parentId, subs] of grouped) {
      const parentPos = mainPositions.get(parentId) || [0, 0, 0];
      subs.forEach((sub, i) => {
        const angle = (i / subs.length) * Math.PI * 2 + Math.PI / 4;
        const r = 2.5;
        map.set(sub.id, [
          parentPos[0] + Math.cos(angle) * r,
          parentPos[1] + 1,
          parentPos[2] + Math.sin(angle) * r,
        ]);
      });
    }
    return map;
  }, [subAgents, mainPositions]);

  return (
    <>
      <color attach="background" args={["#030810"]} />
      <fog attach="fog" args={["#030810", 25, 70]} />

      <ambientLight intensity={0.2} />
      <pointLight position={[0, 15, 0]} intensity={1.5} color="#00ffcc" distance={60} />
      <pointLight position={[10, 5, -10]} intensity={0.8} color="#4488ff" distance={40} />

      <Stars radius={100} depth={50} count={800} factor={3} fade speed={0.1} />
      <Floor />

      {/* Connection lines from subs to parents */}
      {subAgents.map((sub) => {
        const parentId = sub.parent_agent_id || `${sub.session_id}-main`;
        const parentPos = mainPositions.get(parentId);
        const subPos = subPositions.get(sub.id);
        if (!parentPos || !subPos) return null;
        const isActive = sub.status === "working" || sub.status === "connected";
        return (
          <ConnectionLine key={`line-${sub.id}`} from={parentPos} to={subPos} active={isActive} />
        );
      })}

      {/* Main agent nodes */}
      {mainAgents.map((agent) => {
        const pos = mainPositions.get(agent.id);
        if (!pos) return null;
        return <AgentNode key={agent.id} agent={agent} position={pos} isMain />;
      })}

      {/* Sub agent nodes */}
      {subAgents.map((agent) => {
        const pos = subPositions.get(agent.id);
        if (!pos) return null;
        return <AgentNode key={agent.id} agent={agent} position={pos} isMain={false} />;
      })}

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.3}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={50}
      />
    </>
  );
}

// Error boundary
class Grid3DErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("3D Grid error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#030810]">
          <div className="text-center">
            <div className="text-4xl opacity-30 mb-3">&#x2B22;</div>
            <p className="text-cyan-400 text-sm" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              3D ENGINE OFFLINE
            </p>
            <p className="text-cyan-500/40 text-xs mt-2">
              {this.state.error || "WebGL may not be available"}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Main page component
export function AgentGrid() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    try {
      const [agentRes, statsRes] = await Promise.all([
        api.agents.list({ limit: 100 }).catch(() => ({ agents: [] })),
        api.stats.get().catch(() => null),
      ]);
      setAgents(agentRes.agents || []);
      if (statsRes) setStats(statsRes);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (
        msg.type === "agent_created" ||
        msg.type === "agent_updated" ||
        msg.type === "session_created" ||
        msg.type === "session_updated"
      ) {
        load();
      }
    });
  }, [load]);

  // Count by status
  const working = agents.filter((a) => a.status === "working").length;
  const idle = agents.filter((a) => a.status === "idle").length;
  const connected = agents.filter((a) => a.status === "connected").length;
  const completed = agents.filter((a) => a.status === "completed").length;

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* HUD overlay */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h1
          className="text-lg font-semibold text-cyan-400 mb-1"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          AGENT GRID
        </h1>
        <p className="text-xs text-cyan-500/50">Real-time Neural Network View</p>
      </div>

      {/* Stats HUD - top right */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        <div className="bg-black/60 border border-cyan-500/20 rounded-lg p-3 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-cyan-500/50">AGENTS</span>
            <span className="text-white text-right">{agents.length}</span>
            <span className="text-[#00ffcc]/50">WORKING</span>
            <span className="text-[#00ffcc] text-right">{working}</span>
            <span className="text-[#ff9900]/50">IDLE</span>
            <span className="text-[#ff9900] text-right">{idle}</span>
            <span className="text-[#4488ff]/50">CONNECTED</span>
            <span className="text-[#4488ff] text-right">{connected}</span>
            <span className="text-[#334455]/80">DONE</span>
            <span className="text-[#667788] text-right">{completed}</span>
            {stats && (
              <>
                <span className="text-cyan-500/50 mt-1">SESSIONS</span>
                <span className="text-white text-right mt-1">{stats.total_sessions}</span>
                <span className="text-cyan-500/50">EVENTS</span>
                <span className="text-white text-right">{stats.events_today} today</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <Grid3DErrorBoundary>
          <Canvas
            camera={{ position: [15, 12, 15], fov: 50, near: 0.1, far: 150 }}
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            onCreated={(state) => {
              state.gl.setClearColor("#030810");
            }}
          >
            <Scene agents={agents} />
          </Canvas>
        </Grid3DErrorBoundary>

        {/* Empty state overlay */}
        {agents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center bg-black/40 backdrop-blur-sm rounded-xl p-8 border border-cyan-500/10">
              <div className="text-3xl mb-3 opacity-30">&#x2B22;</div>
              <p className="text-cyan-400 text-sm" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                AWAITING AGENTS
              </p>
              <p className="text-cyan-500/40 text-xs mt-2 max-w-xs">
                Start a Claude Code session to see agents appear as nodes in the grid
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
