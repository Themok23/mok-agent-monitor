import { useRef, useMemo, Component, type ErrorInfo, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Line,
  Stars,
} from '@react-three/drei';
import * as THREE from 'three';

interface CyberCityProps {
  sessions: Array<{
    id: string;
    status: string;
    agent_count: number;
    model?: string;
    name?: string;
    started_at: string;
  }>;
  agents: Array<{
    id: string;
    session_id: string;
    status: string;
    type: string;
    current_tool?: string;
    name?: string;
  }>;
  onSelectSession?: (sessionId: string) => void;
}

// Status color mapping with glow intensity
const STATUS_COLORS: Record<string, { color: string; intensity: number }> = {
  working: { color: '#00ffff', intensity: 2.0 },
  connected: { color: '#4488ff', intensity: 1.5 },
  idle: { color: '#6633aa', intensity: 0.8 },
  completed: { color: '#115544', intensity: 0.6 },
  error: { color: '#ff2244', intensity: 1.8 },
};

// Building component representing an agent session
function Building({
  position,
  height,
  status,
  sessionId,
  onClick,
}: {
  position: [number, number, number];
  height: number;
  status: string;
  sessionId: string;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  void sessionId; // used for identification
  const statusConfig = STATUS_COLORS[status] || STATUS_COLORS['idle']!;
  const color = new THREE.Color(statusConfig!.color);

  useFrame((state) => {
    if (meshRef.current && status === 'working') {
      meshRef.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      meshRef.current.position.y = (height * 0.5) + Math.sin(state.clock.elapsedTime * 3) * 0.05;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={onClick}
      scale={[1, height * 0.5, 1]}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={statusConfig!.intensity}
        metalness={0.8}
        roughness={0.2}
      />
    </mesh>
  );
}

// Window lights pattern on buildings
function WindowPattern({ position, height }: { position: [number, number, number]; height: number }) {
  return (
    <group>
      {Array.from({ length: Math.ceil(height) }).map((_, i) => (
        <group key={i} position={[position[0], position[1] + i * 0.4, position[2]]}>
          {[0, 1, 2].map((j) => (
            <mesh
              key={`window-${i}-${j}`}
              position={[(j - 1) * 0.25, 0, 0.51]}
              scale={[0.15, 0.15, 0.05]}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={STATUS_COLORS['working']!.color}
                emissive={STATUS_COLORS['working']!.color}
                emissiveIntensity={0.8}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// Neural core - rotating icosahedron at center
function NeuralCore() {
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (coreRef.current) {
      coreRef.current.rotation.x += 0.002;
      coreRef.current.rotation.y += 0.003;
      coreRef.current.scale.z = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
    }
  });

  return (
    <mesh ref={coreRef} position={[0, 0, 0]}>
      <icosahedronGeometry args={[1, 4]} />
      <meshStandardMaterial
        wireframe={true}
        color="#00ffff"
        emissive="#00ffff"
        emissiveIntensity={1.0}
      />
    </mesh>
  );
}

// Data arteries - glowing lines from core to active buildings
function DataArteries({
  buildingPositions,
}: {
  buildingPositions: [number, number, number][];
}) {

  return (
    <>
      {buildingPositions.map((pos, idx) => (
        <Line
          key={`artery-${idx}`}
          points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(...pos)]}
          color="#00ffff"
          lineWidth={2}
          dashed={false}
        />
      ))}
    </>
  );
}

// Grid floor with glowing lines
function GridFloor() {
  return (
    <group>
      <gridHelper args={[100, 100, '#112255', '#001122']} position={[0, -10, 0]} />
      <mesh position={[0, -10.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial
          color="#001122"
          emissive="#001122"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

// Camera controller with orbit and interaction
function CameraController() {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useFrame((state) => {
    if (controlsRef.current && !controlsRef.current.isActive) {
      const time = state.clock.elapsedTime * 0.3;
      camera.position.x = Math.cos(time) * 35;
      camera.position.z = Math.sin(time) * 35;
      camera.position.y = 20 + Math.sin(time * 0.5) * 5;
    }
  });

  return <OrbitControls ref={controlsRef} autoRotate autoRotateSpeed={0.5} />;
}

// Main scene component
function Scene({
  sessions,
  agents,
  onSelectSession,
}: {
  sessions: CyberCityProps['sessions'];
  agents: CyberCityProps['agents'];
  onSelectSession?: (sessionId: string) => void;
}) {
  // Calculate building positions in a grid
  const buildingPositions = useMemo(() => {
    const positions: Map<string, [number, number, number]> = new Map();
    const gridSize = Math.ceil(Math.sqrt(sessions.length));
    const spacing = 8;

    sessions.forEach((session, idx) => {
      const x = (idx % gridSize) * spacing - (gridSize * spacing) / 2;
      const z = Math.floor(idx / gridSize) * spacing - (gridSize * spacing) / 2;
      positions.set(session.id, [x, 0, z]);
    });

    return positions;
  }, [sessions]);

  // Calculate heights based on agent count (events)
  const getHeight = (sessionId: string): number => {
    const session = sessions.find((s) => s.id === sessionId);
    return Math.max(2, (session?.agent_count || 1) * 1.5);
  };

  // Get subagents for a session
  const getSubagents = (sessionId: string) => {
    return agents.filter((a) => a.session_id === sessionId);
  };

  const activePositions = useMemo(
    () => Array.from(buildingPositions.values()),
    [buildingPositions]
  );

  return (
    <>
      <color attach="background" args={['#0a0e1f']} />
      <fog attach="fog" args={['#0a0e1f', 30, 100]} />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 20, 0]} intensity={1.5} color="#00ffff" distance={100} />

      {/* Stars background */}
      <Stars radius={150} depth={50} count={1000} factor={4} fade speed={0.1} />

      {/* Grid floor */}
      <GridFloor />

      {/* Neural core */}
      <NeuralCore />

      {/* Data arteries */}
      <DataArteries buildingPositions={activePositions} />

      {/* Buildings for each session */}
      {sessions.map((session) => {
        const pos = buildingPositions.get(session.id);
        if (!pos) return null;

        const height = getHeight(session.id);
        const subagents = getSubagents(session.id);

        return (
          <group key={session.id}>
            {/* Main building */}
            <Building
              position={pos}
              height={height}
              status={session.status}
              sessionId={session.id}
              onClick={() => onSelectSession?.(session.id)}
            />

            {/* Window patterns */}
            <WindowPattern position={pos} height={height} />

            {/* Subagent buildings */}
            {subagents.map((agent, idx) => {
              const subX = pos[0] + (idx % 2) * 1.5 - 0.75;
              const subZ = pos[2] + Math.floor(idx / 2) * 1.5 - 0.75;
              const subHeight = agent.status === 'working' ? 1.5 : 1;

              return (
                <Building
                  key={agent.id}
                  position={[subX, 0, subZ]}
                  height={subHeight}
                  status={agent.status}
                  sessionId={agent.id}
                  onClick={() => onSelectSession?.(agent.session_id)}
                />
              );
            })}
          </group>
        );
      })}

      {/* Camera controller */}
      <CameraController />

    </>
  );
}

class CyberCityErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CyberCity 3D render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1f', color: '#06b6d4', fontFamily: "'Orbitron', monospace", fontSize: '14px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>&#x2B22;</div>
            <div>3D Engine Offline</div>
            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '6px' }}>WebGL may not be available</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function CyberCity({ sessions, agents, onSelectSession }: CyberCityProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CyberCityErrorBoundary>
        <Canvas
          camera={{ position: [35, 20, 35], near: 0.1, far: 200 }}
          frameloop="always"
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={(state) => {
            state.gl.setClearColor('#0a0e1f');
          }}
        >
          <Scene
            sessions={sessions}
            agents={agents}
            onSelectSession={onSelectSession}
          />
        </Canvas>
      </CyberCityErrorBoundary>
    </div>
  );
}

export default CyberCity;
