import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Droplets,
  Leaf,
  Megaphone,
  Mic,
  Music,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  TreePine,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AVATARS } from '../data/gameData';
import { animateHumanAgent, buildHumanEcoAgent } from '../three/humanAgents';
import { MissionDef, UserAccount } from '../types/game';
import { playSFX, setMusicState } from '../utils/sound';

export interface Mission3OperationAdventureProps {
  mission: MissionDef;
  user: UserAccount;
  musicOn: boolean;
  musicVolume: number;
  onToggleMusic: () => void;
  onChangeMusicVolume: (vol: number) => void;
  onClose: () => void;
  onCompleteMission3: (
    score: number,
    chosenOption: string,
    justification: string,
    afterAction?: 'map' | 'next_mission'
  ) => void;
}

type Mission3Stage = 'emergency_call' | 'explore' | 'decision' | 'victory';
type ProposalId = 'A' | 'B' | 'C';
type AudioPlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'blocked';

interface ProposalDef {
  id: ProposalId;
  code: string;
  title: string;
  shortTitle: string;
  kelebihan: string;
  cabaran: string;
  audioScript: string;
  headerGrad: string;
  cardBorder: string;
  glowShadow: string;
}

const EMERGENCY_SCRIPT =
  'Perhatian, Ejen EcoWorld! Hutan Harapan kini dalam bahaya. Kami mempunyai tiga cadangan untuk memulihkan kawasan ini. Namun, setiap cadangan mempunyai kelebihan dan cabarannya. Dengar penerangan dengan teliti, kemudian pilih cadangan yang paling sesuai untuk menyelamatkan Hutan Harapan. Kami mengharapkan bantuan kamu!';

const PROPOSALS: ProposalDef[] = [
  {
    id: 'A',
    code: 'CADANGAN A',
    title: 'PROGRAM PENANAMAN POKOK',
    shortTitle: 'Penanaman Pokok',
    kelebihan: 'Menghijaukan kawasan hutan dan membantu meningkatkan kualiti udara.',
    cabaran: 'Pokok memerlukan masa dan penjagaan untuk membesar.',
    audioScript:
      'Cadangan A: Program Penanaman Pokok. Kelebihannya ialah menghijaukan kawasan hutan dan membantu meningkatkan kualiti udara. Cabarannya pula ialah pokok memerlukan masa dan penjagaan untuk membesar.',
    headerGrad: 'from-emerald-400 via-green-500 to-teal-500',
    cardBorder: 'border-emerald-400/80',
    glowShadow: 'shadow-[0_0_26px_rgba(52,211,153,0.45)]',
  },
  {
    id: 'B',
    code: 'CADANGAN B',
    title: 'GOTONG-ROYONG MEMBERSIHKAN HUTAN',
    shortTitle: 'Gotong-Royong Membersihkan Hutan',
    kelebihan: 'Kawasan hutan menjadi lebih bersih dan selamat.',
    cabaran: 'Memerlukan tenaga dan kerjasama masyarakat.',
    audioScript:
      'Cadangan B: Gotong-Royong Membersihkan Hutan. Kelebihannya ialah kawasan hutan menjadi lebih bersih dan selamat. Cabarannya pula ialah memerlukan tenaga dan kerjasama masyarakat.',
    headerGrad: 'from-cyan-400 via-sky-500 to-blue-600',
    cardBorder: 'border-cyan-400/80',
    glowShadow: 'shadow-[0_0_26px_rgba(34,211,238,0.45)]',
  },
  {
    id: 'C',
    code: 'CADANGAN C',
    title: 'KEMPEN KESEDARAN MENJAGA HUTAN',
    shortTitle: 'Kempen Kesedaran Menjaga Hutan',
    kelebihan: 'Mendidik masyarakat supaya menjaga dan melindungi hutan.',
    cabaran: 'Memerlukan masa untuk mengubah sikap masyarakat.',
    audioScript:
      'Cadangan C: Kempen Kesedaran Menjaga Hutan. Kelebihannya ialah mendidik masyarakat supaya menjaga dan melindungi hutan. Cabarannya pula ialah memerlukan masa untuk mengubah sikap masyarakat.',
    headerGrad: 'from-purple-400 via-violet-500 to-indigo-600',
    cardBorder: 'border-purple-400/80',
    glowShadow: 'shadow-[0_0_26px_rgba(168,85,247,0.45)]',
  },
];

const GUIDING_QUESTIONS = [
  '1. Apakah cadangan yang kamu pilih?',
  '2. Apakah kelebihan dan cabaran cadangan tersebut?',
  '3. Mengapakah cadangan ini paling sesuai untuk menyelamatkan Hutan Harapan?',
];

const MALE_VOICE_RE =
  /osman|andika|ardi|farid|adam|david|mark|daniel|alex|fred|george|guy|ryan|\bmale\b|lelaki/i;
const FEMALE_MS_RE = /yasmin|amira|siti|nur|ain|zura|puteri|rina|female|woman|girl|ms-my-x-ms[bc]/i;

function pickMalaySpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const malayPool = voices.filter((v) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith('ms') || lang.startsWith('id');
  });
  if (malayPool.length === 0) return null;
  const msVoice = malayPool.find((v) => v.lang.toLowerCase().startsWith('ms'));
  if (msVoice) {
    const expressive = malayPool.find(
      (v) =>
        v.lang.toLowerCase().startsWith('ms') &&
        !MALE_VOICE_RE.test(v.name) &&
        FEMALE_MS_RE.test(v.name)
    );
    return expressive || msVoice;
  }
  return malayPool[0];
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ============================================================================
   CUSTOM FOREST STRATEGY ILLUSTRATIONS (COMPACT & EXPANDED SIZES)
   ============================================================================ */
function ProposalIllustration({ id, large = false }: { id: ProposalId; large?: boolean }) {
  const heightCls = large ? 'h-44 sm:h-52' : 'h-28';

  if (id === 'A') {
    return (
      <svg viewBox="0 0 280 150" className={`w-full ${heightCls} rounded-2xl`} aria-hidden="true">
        <defs>
          <linearGradient id="m3PropASky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <rect width="280" height="150" fill="url(#m3PropASky)" />
        <circle cx="48" cy="34" r="18" fill="#fde047" opacity="0.9" />
        <rect x="0" y="106" width="280" height="44" fill="#15803d" />
        {/* Rich soil mound */}
        <ellipse cx="122" cy="116" rx="44" ry="14" fill="#78350f" />
        {/* Young sapling with vibrant leaves */}
        <rect x="119" y="68" width="6" height="44" rx="3" fill="#4d7c0f" />
        <path d="M122 82 Q92 64 98 48 Q118 52 122 76 Z" fill="#4ade80" />
        <path d="M124 74 Q154 56 150 40 Q130 44 124 68 Z" fill="#22c55e" />
        <path d="M122 64 Q106 36 122 26 Q138 36 122 64 Z" fill="#86efac" />
        {/* Blue watering can */}
        <rect x="184" y="76" width="38" height="28" rx="7" fill="#0284c7" />
        <path d="M184 84 L162 72 L160 79 L184 94 Z" fill="#38bdf8" />
        <path d="M222 80 C236 80, 236 100, 222 100" stroke="#38bdf8" strokeWidth="5" fill="none" />
        <circle cx="152" cy="84" r="3" fill="#bae6fd" />
        <circle cx="144" cy="92" r="3" fill="#bae6fd" />
        <circle cx="154" cy="98" r="2.5" fill="#bae6fd" />
      </svg>
    );
  }

  if (id === 'B') {
    return (
      <svg viewBox="0 0 280 150" className={`w-full ${heightCls} rounded-2xl`} aria-hidden="true">
        <defs>
          <linearGradient id="m3PropBSky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <rect width="280" height="150" fill="url(#m3PropBSky)" />
        {/* Background forest silhouettes */}
        <circle cx="48" cy="88" r="24" fill="#047857" />
        <circle cx="232" cy="84" r="26" fill="#047857" />
        <rect x="0" y="106" width="280" height="44" fill="#166534" />
        {/* Trash bags collected neatly */}
        <ellipse cx="78" cy="112" rx="22" ry="18" fill="#1e293b" />
        <rect x="70" y="90" width="16" height="8" rx="3" fill="#334155" />
        <ellipse cx="122" cy="114" rx="18" ry="15" fill="#0ea5e9" />
        <rect x="115" y="95" width="14" height="7" rx="3" fill="#38bdf8" />
        {/* Blue Recycling Bin */}
        <rect x="166" y="64" width="52" height="56" rx="8" fill="#2563eb" />
        <rect x="160" y="56" width="64" height="11" rx="4" fill="#60a5fa" />
        <circle cx="192" cy="92" r="13" fill="#eff6ff" opacity="0.92" />
        <path d="M187 92 L192 85 L197 92 M186 95 L198 95" stroke="#2563eb" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 280 150" className={`w-full ${heightCls} rounded-2xl`} aria-hidden="true">
      <defs>
        <linearGradient id="m3PropCSky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4338ca" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="280" height="150" fill="url(#m3PropCSky)" />
      <rect x="0" y="110" width="280" height="40" fill="#15803d" />
      {/* Wooden Awareness Signboard + Open Book */}
      <rect x="134" y="92" width="12" height="36" fill="#78350f" />
      <rect x="78" y="28" width="124" height="72" rx="8" fill="#92400e" />
      <rect x="86" y="36" width="108" height="56" rx="5" fill="#fef3c7" />
      {/* Green forest emblem inside awareness board */}
      <rect x="137" y="66" width="6" height="18" fill="#78350f" />
      <circle cx="140" cy="57" r="15" fill="#16a34a" />
      <circle cx="128" cy="63" r="10" fill="#22c55e" />
      <circle cx="152" cy="63" r="10" fill="#22c55e" />
      {/* Open educational book in front */}
      <path d="M104 118 Q122 108 140 118 L140 132 Q122 122 104 132 Z" fill="#ffffff" />
      <path d="M176 118 Q158 108 140 118 L140 132 Q158 122 176 132 Z" fill="#e2e8f0" />
      {/* Sunbeam */}
      <circle cx="44" cy="34" r="14" fill="#fde047" opacity="0.85" />
    </svg>
  );
}

/* ============================================================================
   MAIN COMPONENT: ECO RESCUE: MISI 3 – HUTAN HARAPAN
   ============================================================================ */
export function Mission3OperationAdventure({
  mission,
  user,
  musicOn,
  musicVolume,
  onToggleMusic,
  onChangeMusicVolume,
  onClose,
  onCompleteMission3,
}: Mission3OperationAdventureProps) {
  const [stage, setStage] = useState<Mission3Stage>('emergency_call');

  // Shared Continuous Bahasa Melayu Audio Controller (never reads sentence-by-sentence!)
  const [audioKey, setAudioKey] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioPlayStatus>('idle');
  const [emergencyFinishedOnce, setEmergencyFinishedOnce] = useState(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const ttsBlobCacheRef = useRef<Record<string, string>>({});
  const audioModeRef = useRef<'none' | 'tts' | 'speech' | 'silent'>('none');
  const speechPausedRef = useRef(false);
  const silentTimerRef = useRef<number | null>(null);
  const emergencyAutoStartedRef = useRef(false);

  // Stage 2: Explored proposals
  const [activeProposalId, setActiveProposalId] = useState<ProposalId | null>(null);
  const [exploredIds, setExploredIds] = useState<ProposalId[]>([]);

  // Stage 3: Decision & Real Voice Recording ("SUARA EJEN – BENTANGKAN PILIHAN KAMU!")
  const [chosenId, setChosenId] = useState<ProposalId | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceMeter, setVoiceMeter] = useState<number[]>([0.2, 0.3, 0.25, 0.35, 0.22, 0.3, 0.2]);
  const [recordedAudio, setRecordedAudio] = useState<{
    url: string;
    duration: number;
    size: number;
  } | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isPlayingBackVoice, setIsPlayingBackVoice] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const voicePlaybackElRef = useRef<HTMLAudioElement | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  recordedUrlRef.current = recordedAudio?.url || null;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number>(0);

  // Three.js futuristic Hutan Harapan & Command Center backdrop
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Mission3Stage>(stage);
  stageRef.current = stage;

  const avatarDef = AVATARS.find((a) => a.id === user.avatar) || AVATARS[1];

  // =========================================================================
  // LIVE 3D FUTURISTIC HUTAN HARAPAN & COMMAND CENTER CANVAS
  // =========================================================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    const gl = renderer.getContext();
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    const glName = dbg ? String(gl?.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftwareGl = /swiftshader|llvmpipe|softpipe/i.test(glName);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#061938');
    scene.fog = new THREE.FogExp2('#0b2a52', 0.015);

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      180
    );
    camera.position.set(0, 5.2, 17);

    // Warm golden sunlight + futuristic cyan & purple rim lights
    const hemi = new THREE.HemisphereLight('#7dd3fc', '#064e3b', 1.25);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight('#fef08a', 1.5);
    sunLight.position.set(12, 22, 10);
    scene.add(sunLight);
    const cyanLight = new THREE.PointLight('#22d3ee', 2.4, 48);
    cyanLight.position.set(-8, 6, -4);
    scene.add(cyanLight);
    const purpleLight = new THREE.PointLight('#a855f7', 2.0, 48);
    purpleLight.position.set(8, 6, -5);
    scene.add(purpleLight);

    // Glowing Futuristic Command / Forest Platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 10.5, 0.7, 48),
      new THREE.MeshStandardMaterial({ color: '#0c2747', metalness: 0.55, roughness: 0.25 })
    );
    platform.position.y = -0.35;
    scene.add(platform);

    // Flowing Clean EcoWorld Stream Band on Forest Floor
    const streamMat = new THREE.MeshStandardMaterial({
      color: '#0ea5e9',
      emissive: '#0284c7',
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.15,
    });
    const riverPlane = new THREE.Mesh(new THREE.PlaneGeometry(46, 4.5), streamMat);
    riverPlane.rotation.x = -Math.PI / 2;
    riverPlane.position.set(0, -0.45, -10.5);
    scene.add(riverPlane);

    // Hologram Hutan Harapan Rings
    const holoGroup = new THREE.Group();
    holoGroup.position.set(0, 3.8, -4.5);
    scene.add(holoGroup);

    const holoOrbMat = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      emissive: '#10b981',
      emissiveIntensity: 0.55,
      wireframe: true,
    });
    const holoOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 2), holoOrbMat);
    holoGroup.add(holoOrb);

    const ringMat = new THREE.MeshBasicMaterial({ color: '#22d3ee' });
    const holoRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.09, 12, 64), ringMat);
    holoRing.rotation.x = Math.PI / 2.5;
    holoGroup.add(holoRing);

    // Contact shadow for 3D EcoWorld Agent
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
    sGrad.addColorStop(0, 'rgba(2, 6, 23, 0.7)');
    sGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);

    // 3D EcoWorld Agent standing on deck
    const agentRig = buildHumanEcoAgent(avatarDef.id, shadowTex, { showPedestal: true });
    agentRig.group.position.set(-4.8, 0, 2.2);
    agentRig.group.rotation.y = 0.55;
    agentRig.group.scale.setScalar(1.35);
    scene.add(agentRig.group);

    // Lush Hutan Harapan Trees around clearing (grow & brighten vibrantly on victory)
    const trees: THREE.Group[] = [];
    const treeCoords: [number, number, number][] = [
      [-11.5, -0.4, -6.5],
      [-9, -0.4, -14.5],
      [9.5, -0.4, -7],
      [12.5, -0.4, -14.5],
      [0, -0.4, -18],
      [-14.5, -0.4, 2.5],
      [14.5, -0.4, 2],
      [-4.5, -0.4, -15.5],
      [5.5, -0.4, -15.5],
    ];
    treeCoords.forEach(([tx, ty, tz]) => {
      const tg = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.42, 2.3, 8),
        new THREE.MeshStandardMaterial({ color: '#78350f' })
      );
      trunk.position.y = 1.15;
      const crown = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.55, 1),
        new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.65 })
      );
      crown.position.y = 3.0;
      tg.add(trunk, crown);
      tg.position.set(tx, ty, tz);
      scene.add(tg);
      trees.push(tg);
    });

    // Floating Sunlight / Firefly Spores
    const partCount = isSoftwareGl ? 60 : 160;
    const partPos = new Float32Array(partCount * 3);
    for (let i = 0; i < partCount; i++) {
      partPos[i * 3] = (Math.random() - 0.5) * 34;
      partPos[i * 3 + 1] = Math.random() * 14 + 0.5;
      partPos[i * 3 + 2] = (Math.random() - 0.5) * 26 - 3;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
    const partMat = new THREE.PointsMaterial({
      color: '#5eead4',
      size: 0.24,
      transparent: true,
      opacity: 0.85,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    function renderLoop() {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      const st = stageRef.current;
      const isVictory = st === 'victory';
      const isExploreOrDecision = st === 'explore' || st === 'decision';

      const targetBg = new THREE.Color(
        isVictory ? '#0284c7' : isExploreOrDecision ? '#064e3b' : '#061938'
      );
      (scene.background as THREE.Color).lerp(targetBg, dt * 2.0);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.lerp(
          new THREE.Color(isVictory ? '#38bdf8' : isExploreOrDecision ? '#0f766e' : '#0b2a52'),
          dt * 2.0
        );
      }

      holoOrb.rotation.y = elapsed * 0.38;
      holoRing.rotation.z = elapsed * 0.52;
      holoOrbMat.emissive.set(isVictory ? '#4ade80' : '#10b981');
      ringMat.color.set(isVictory ? '#fde047' : '#22d3ee');
      partMat.color.set(isVictory ? '#fef08a' : '#5eead4');
      streamMat.emissiveIntensity = isVictory ? 0.85 : 0.4;

      particles.rotation.y = elapsed * 0.05;
      animateHumanAgent(agentRig, elapsed, dt, {
        isMoving: false,
        hovered: isVictory || st === 'emergency_call',
        selected: true,
      });

      trees.forEach((tr, idx) => {
        const targetScale = isVictory
          ? 1.32 + Math.sin(elapsed * 2 + idx) * 0.05
          : isExploreOrDecision
          ? 1.05
          : 0.9;
        tr.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), dt * 2.8);
      });

      camera.position.x = Math.sin(elapsed * 0.2) * 1.3;
      camera.position.y = 5.0 + Math.cos(elapsed * 0.26) * 0.3;
      camera.lookAt(0, 2.7, -2.5);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameId = window.setTimeout(() => requestAnimationFrame(renderLoop), 65);
      } else {
        frameId = requestAnimationFrame(renderLoop);
      }
    }

    renderLoop();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      shadowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [avatarDef.id]);

  // =========================================================================
  // CONTINUOUS BAHASA MELAYU AUDIO ENGINE (READS ONCE CONTINUOUSLY, NEVER SPLIT)
  // =========================================================================
  const stopCurrentAudio = useCallback(() => {
    speechPausedRef.current = false;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
      audioElRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (silentTimerRef.current) {
      clearTimeout(silentTimerRef.current);
      silentTimerRef.current = null;
    }
    audioModeRef.current = 'none';
    setAudioStatus('idle');
    setMusicState({ suppressedForAudio: false });
  }, []);

  const markAudioEnded = useCallback((key: string) => {
    setAudioStatus('ended');
    setMusicState({ suppressedForAudio: false });
    if (key === 'emergency') {
      setEmergencyFinishedOnce(true);
    }
  }, []);

  const playContinuousMalaySpeechFallback = useCallback(
    (key: string, scriptText: string) => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const malayVoice = pickMalaySpeechVoice(voices);
        if (malayVoice) {
          window.speechSynthesis.cancel();
          speechPausedRef.current = false;
          audioModeRef.current = 'speech';

          const utter = new SpeechSynthesisUtterance(scriptText);
          utter.voice = malayVoice;
          utter.lang = malayVoice.lang;
          utter.rate = 0.95;
          utter.pitch = 1.05;

          utter.onstart = () => {
            setAudioStatus('playing');
            setMusicState({ suppressedForAudio: true });
          };
          utter.onend = () => {
            if (audioModeRef.current === 'speech') {
              markAudioEnded(key);
            }
          };
          utter.onerror = () => {
            if (audioModeRef.current === 'speech') {
              markAudioEnded(key);
            }
          };

          setAudioStatus('playing');
          setMusicState({ suppressedForAudio: true });
          window.speechSynthesis.speak(utter);
          return;
        }
      }

      // Strict Bahasa Melayu guard: Never play an English voice!
      audioModeRef.current = 'silent';
      setAudioStatus('playing');
      setMusicState({ suppressedForAudio: false });
      setAudioNotice(
        'Pelayar ini tidak mempunyai enjin suara Bahasa Melayu tempatan. Baca penerangan lengkap pada skrin di atas (tiada suara Inggeris digunakan).'
      );
      silentTimerRef.current = window.setTimeout(() => {
        markAudioEnded(key);
      }, 6000);
    },
    [markAudioEnded]
  );

  const playContinuousAudio = useCallback(
    async (key: string, scriptText: string, stylePrompt: string) => {
      stopCurrentAudio();
      setAudioKey(key);
      setAudioNotice(null);
      setAudioStatus('loading');

      try {
        let url = ttsBlobCacheRef.current[key];
        if (!url) {
          const resp = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: scriptText, style: stylePrompt }),
          });
          if (!resp.ok) throw new Error('TTS unavailable');
          const data = (await resp.json()) as { audioBase64?: string; mimeType?: string };
          if (!data.audioBase64) throw new Error('Empty audio payload');

          const bin = atob(data.audioBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/wav' }));
          ttsBlobCacheRef.current[key] = url;
        }

        const audio = new Audio(url);
        audioElRef.current = audio;
        audioModeRef.current = 'tts';

        audio.onplay = () => {
          setAudioStatus('playing');
          setMusicState({ suppressedForAudio: true });
        };
        audio.onended = () => {
          markAudioEnded(key);
        };
        audio.onerror = () => {
          playContinuousMalaySpeechFallback(key, scriptText);
        };

        try {
          await audio.play();
        } catch {
          // Autoplay blocked by browser policy — surface clear Play button
          setAudioStatus('blocked');
          setMusicState({ suppressedForAudio: false });
        }
      } catch {
        playContinuousMalaySpeechFallback(key, scriptText);
      }
    },
    [stopCurrentAudio, markAudioEnded, playContinuousMalaySpeechFallback]
  );

  const handlePauseAudio = () => {
    playSFX('click');
    speechPausedRef.current = true;
    setAudioStatus('paused');
    setMusicState({ suppressedForAudio: false });

    if (audioModeRef.current === 'tts' && audioElRef.current) {
      audioElRef.current.pause();
    } else if (audioModeRef.current === 'speech' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    } else if (audioModeRef.current === 'silent' && silentTimerRef.current) {
      clearTimeout(silentTimerRef.current);
      silentTimerRef.current = null;
    }
  };

  const handleResumeAudio = (key: string, scriptText: string, stylePrompt: string) => {
    playSFX('click');
    speechPausedRef.current = false;

    if (audioModeRef.current === 'tts' && audioElRef.current) {
      audioElRef.current.play().catch(() => {
        setAudioStatus('blocked');
      });
      setAudioStatus('playing');
      setMusicState({ suppressedForAudio: true });
    } else if (audioModeRef.current === 'speech' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setAudioStatus('playing');
      setMusicState({ suppressedForAudio: true });
    } else {
      playContinuousAudio(key, scriptText, stylePrompt);
    }
  };

  // Auto-play Aktiviti 1 emergency briefing ONCE on entering emergency_call (never loops/retriggers)
  useEffect(() => {
    if (stage === 'emergency_call' && !emergencyAutoStartedRef.current) {
      emergencyAutoStartedRef.current = true;
      playContinuousAudio(
        'emergency',
        EMERGENCY_SCRIPT,
        'Speak in energetic, friendly, clear standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like the EcoWorld Chief Command Officer calling primary school hero agents.'
      );
    }
  }, [stage, playContinuousAudio]);

  // Cleanup all audio, blob URLs & mic resources on unmount
  useEffect(() => {
    const cacheMap = ttsBlobCacheRef.current;
    return () => {
      stopCurrentAudio();
      Object.values(cacheMap).forEach((u) => URL.revokeObjectURL(u));
      if (voicePlaybackElRef.current) {
        voicePlaybackElRef.current.pause();
        voicePlaybackElRef.current = null;
      }
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      cancelAnimationFrame(meterRafRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopCurrentAudio]);

  // =========================================================================
  // STAGE 3: REAL MICROPHONE RECORDING ("SUARA EJEN – BENTANGKAN PILIHAN KAMU!")
  // =========================================================================
  useEffect(() => {
    if (!isRecording) return;
    const t = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [isRecording]);

  const stopMicRecording = useCallback(() => {
    cancelAnimationFrame(meterRafRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    setMusicState({ suppressedForAudio: false });
  }, []);

  const startMicRecording = async () => {
    setVoiceError(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      playSFX('error');
      setVoiceError(
        'Rakaman suara tidak disokong pada pelayar ini. Sila gunakan pelayar moden yang menyokong mikrofon.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      try {
        const ACtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (ACtx) {
          const ctx = new ACtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          src.connect(analyser);
          const dataArr = new Uint8Array(analyser.frequencyBinCount);
          const tickMeter = () => {
            analyser.getByteFrequencyData(dataArr);
            setVoiceMeter(
              [1, 2, 3, 4, 5, 6, 7].map((i) => Math.max(0.18, Math.min(1, (dataArr[i] || 28) / 175)))
            );
            meterRafRef.current = requestAnimationFrame(tickMeter);
          };
          tickMeter();
        }
      } catch {
        // Fallback visual wave continues cleanly
      }

      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      const startedAt = Date.now();

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      rec.onstop = () => {
        cancelAnimationFrame(meterRafRef.current);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });

        if (durationSec < 2 || blob.size < 800) {
          playSFX('error');
          setVoiceError(
            'Rakaman terlalu ringkas atau kosong! Sila nyatakan cadangan pilihan kamu berserta kelebihan, cabaran dan alasannya dengan jelas.'
          );
          return;
        }

        if (recordedUrlRef.current) {
          URL.revokeObjectURL(recordedUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        setRecordedAudio({ url, duration: durationSec, size: blob.size });
        playSFX('xp');
      };

      setRecSeconds(0);
      rec.start();
      setIsRecording(true);
      setMusicState({ suppressedForAudio: true });
      playSFX('click');
    } catch {
      playSFX('error');
      setVoiceError(
        'Kebenaran mikrofon ditolak atau tiada mikrofon dikesan. Sila benarkan akses mikrofon pada pelayar untuk merakam suara kamu.'
      );
      setMusicState({ suppressedForAudio: false });
    }
  };

  const handlePlayRecordedVoice = () => {
    if (!recordedAudio) return;
    if (voicePlaybackElRef.current) {
      voicePlaybackElRef.current.pause();
      voicePlaybackElRef.current = null;
      setIsPlayingBackVoice(false);
      setMusicState({ suppressedForAudio: false });
      return;
    }
    const audio = new Audio(recordedAudio.url);
    voicePlaybackElRef.current = audio;
    audio.onplay = () => {
      setIsPlayingBackVoice(true);
      setMusicState({ suppressedForAudio: true });
    };
    audio.onended = () => {
      setIsPlayingBackVoice(false);
      setMusicState({ suppressedForAudio: false });
      voicePlaybackElRef.current = null;
    };
    audio.onerror = () => {
      setIsPlayingBackVoice(false);
      setMusicState({ suppressedForAudio: false });
      voicePlaybackElRef.current = null;
    };
    audio.play().catch(() => {});
  };

  const handleReRecord = () => {
    if (voicePlaybackElRef.current) {
      voicePlaybackElRef.current.pause();
      voicePlaybackElRef.current = null;
      setIsPlayingBackVoice(false);
    }
    if (recordedAudio?.url) {
      URL.revokeObjectURL(recordedAudio.url);
    }
    setRecordedAudio(null);
    setVoiceError(null);
    playSFX('click');
  };

  // =========================================================================
  // STAGE NAVIGATION & COMPLETION
  // =========================================================================
  const handleSelectProposalInExplore = (proposal: ProposalDef) => {
    playSFX('click');
    setActiveProposalId(proposal.id);
    setExploredIds((prev) => (prev.includes(proposal.id) ? prev : [...prev, proposal.id]));
    playContinuousAudio(
      `prop_${proposal.id}`,
      proposal.audioScript,
      'Speak in clear, friendly, enthusiastic standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) suitable for primary school pupils.'
    );
  };

  const handleFinishMission3 = (afterAction: 'map' | 'next_mission') => {
    stopCurrentAudio();
    stopMicRecording();
    if (voicePlaybackElRef.current) {
      voicePlaybackElRef.current.pause();
      voicePlaybackElRef.current = null;
      setIsPlayingBackVoice(false);
    }
    const picked = PROPOSALS.find((p) => p.id === chosenId) || PROPOSALS[0];
    const score = Math.min(100, 90 + (recordedAudio && recordedAudio.duration >= 5 ? 10 : 5));
    onCompleteMission3(
      score,
      `${picked.code}: ${picked.shortTitle}`,
      `Pembentangan lisan spontan dirakam (${recordedAudio?.duration || 0}s): menilai kelebihan dan cabaran ${picked.shortTitle} untuk memulihkan Hutan Harapan.`,
      afterAction
    );
  };

  const activeProposal = PROPOSALS.find((p) => p.id === activeProposalId) || null;
  const chosenProposal = PROPOSALS.find((p) => p.id === chosenId) || null;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-slate-950 select-none">
      {/* Live 3D Hutan Harapan & Command Center Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />

      {/* Top HUD Bar */}
      <header className="relative z-20 px-3 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl portal-glass-card">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-purple-500 text-slate-950 flex items-center justify-center font-game font-black shadow-lg shrink-0">
            M3
          </div>
          <div className="min-w-0">
            <div className="text-[10px] sm:text-xs font-game font-bold text-amber-300 tracking-wider truncate">
              EJEN PENYELAMAT ECOWORLD · {avatarDef.name.toUpperCase()} · +{mission.maxXp} XP
            </div>
            <h1 className="font-game text-xs sm:text-base font-black text-white truncate">
              ECO RESCUE: MISI 3 – HUTAN HARAPAN
            </h1>
          </div>
        </div>

        {/* Clean 4-Step Progress Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl portal-glass-card text-[11px] font-game font-bold">
          {(
            [
              ['emergency_call', '1. Panggilan Kecemasan'],
              ['explore', '2. Terokai 3 Cadangan'],
              ['decision', '3. Keputusan & Suara Ejen'],
              ['victory', '4. Hutan Pulih'],
            ] as [Mission3Stage, string][]
          ).map(([stKey, label]) => (
            <span
              key={stKey}
              className={`px-2.5 py-1 rounded-xl transition-colors ${
                stage === stKey
                  ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-black'
                  : 'text-cyan-200/75'
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 rounded-2xl portal-glass-sub px-2.5 py-1.5">
            <button
              type="button"
              onClick={onToggleMusic}
              className="text-xs font-bold text-cyan-200 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {musicOn ? (
                <Music className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{musicOn ? 'Muzik' : 'Senyap'}</span>
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={musicOn ? Math.round(musicVolume * 100) : 0}
              onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
              aria-label="Laraskan kelantangan muzik"
              className="w-14 accent-cyan-400 cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              stopCurrentAudio();
              stopMicRecording();
              playSFX('click');
              onClose();
            }}
            className="btn-game-gold btn-game-sm px-3.5 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>PETA MISI</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Stage Container */}
      <main className="relative z-20 h-[calc(100vh-76px)] overflow-y-auto eco-scroll p-3 sm:p-5 pb-24 flex items-center justify-center">
        {/* =================================================================
            AKTIVITI 1 – PANGGILAN KECEMASAN (CONTINUOUS AUDIO + FULL SCRIPT)
           ================================================================= */}
        {stage === 'emergency_call' && (
          <div className="portal-glass-card modal-pop-in w-full max-w-4xl rounded-3xl p-5 sm:p-7 text-white space-y-5 border-2 border-cyan-400/80 my-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-cyan-400/25">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-purple-500 text-slate-950 flex items-center justify-center shadow-[0_0_24px_rgba(34,211,238,0.6)] shrink-0">
                  <Radio
                    className={`w-7 h-7 ${
                      audioKey === 'emergency' && audioStatus === 'playing' ? 'animate-pulse' : ''
                    }`}
                  />
                </div>
                <div>
                  <div className="text-xs font-game font-bold text-orange-300 tracking-wider">
                    AKTIVITI 1 · PANGGILAN KECEMASAN KETUA PUSAT KAWALAN
                  </div>
                  <h2 className="font-game text-xl sm:text-2xl font-black text-white">
                    Arahan Operasi: Selamatkan Hutan Harapan
                  </h2>
                  <p className="text-xs text-cyan-200 mt-0.5">
                    {audioKey === 'emergency' && audioStatus === 'loading'
                      ? 'Menyambungkan suara Ketua Pusat Kawalan...'
                      : audioKey === 'emergency' && audioStatus === 'playing'
                      ? 'Ketua Pusat Kawalan sedang menyampaikan arahan penuh...'
                      : audioKey === 'emergency' && audioStatus === 'paused'
                      ? 'Audio arahan dijeda. Tekan Sambung untuk mendengar semula.'
                      : audioKey === 'emergency' && audioStatus === 'blocked'
                      ? 'Tekan butang Main Audio di bawah untuk mendengar arahan.'
                      : 'Arahan lengkap Pusat Kawalan EcoWorld.'}
                  </p>
                </div>
              </div>

              {/* Animated Waveform Indicator */}
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl portal-glass-sub border border-cyan-400/40">
                <div className="flex items-end gap-1 h-7">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <span
                      key={bar}
                      style={{ animationDelay: `${bar * 0.1}s` }}
                      className={`w-1.5 rounded-full transition-all ${
                        audioKey === 'emergency' && audioStatus === 'playing'
                          ? 'h-7 bg-emerald-400 wave-bar-active'
                          : 'h-2 bg-cyan-400/45'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-game font-bold text-cyan-100">
                  {audioKey === 'emergency' && audioStatus === 'playing'
                    ? 'SEDANG MAIN'
                    : emergencyFinishedOnce
                    ? 'SELESAI'
                    : 'SIARAN MASUK'}
                </span>
              </div>
            </div>

            {/* Full Script Displayed Cleanly in One Readable Panel (No splitting/highlighting) */}
            <div className="rounded-3xl bg-slate-950/88 border-2 border-purple-400/55 p-5 sm:p-7 space-y-3 shadow-inner">
              <div className="text-xs font-game font-bold text-amber-300 tracking-wider">
                TEKS ARAHAN KETUA PUSAT KAWALAN
              </div>
              <p className="text-base sm:text-xl font-semibold text-white leading-relaxed">
                &ldquo;{EMERGENCY_SCRIPT}&rdquo;
              </p>
              {audioNotice && (
                <p className="text-xs text-amber-200 pt-1">{audioNotice}</p>
              )}
            </div>

            {/* Audio Controls + AYUH, SELAMATKAN HUTAN! CTA */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {audioKey === 'emergency' && audioStatus === 'playing' ? (
                  <button
                    type="button"
                    onClick={handlePauseAudio}
                    className="btn-game-gold btn-game-sm px-4 py-2.5 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Jeda</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      handleResumeAudio(
                        'emergency',
                        EMERGENCY_SCRIPT,
                        'Speak in energetic, friendly, clear standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like the EcoWorld Chief Command Officer calling primary school hero agents.'
                      )
                    }
                    disabled={audioKey === 'emergency' && audioStatus === 'loading'}
                    className="btn-game-cyan btn-game-sm px-4 py-2.5 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {audioKey === 'emergency' && audioStatus === 'paused'
                        ? 'Sambung'
                        : 'Main Audio'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    playSFX('click');
                    playContinuousAudio(
                      'emergency',
                      EMERGENCY_SCRIPT,
                      'Speak in energetic, friendly, clear standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like the EcoWorld Chief Command Officer calling primary school hero agents.'
                    );
                  }}
                  className="btn-game-slate btn-game-sm px-4 py-2.5 text-cyan-100 font-game text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Main Semula</span>
                </button>
              </div>

              {emergencyFinishedOnce ? (
                <button
                  type="button"
                  onClick={() => {
                    stopCurrentAudio();
                    playSFX('portal');
                    setStage('explore');
                  }}
                  className="btn-game-emerald px-7 py-3.5 text-slate-950 font-game text-sm sm:text-base font-black tracking-wide flex items-center gap-2 cursor-pointer hover:scale-[1.03] transition-transform"
                >
                  <TreePine className="w-5 h-5" />
                  <span>AYUH, SELAMATKAN HUTAN!</span>
                </button>
              ) : (
                <span className="text-xs text-cyan-200 font-semibold">
                  Dengar arahan penuh terlebih dahulu untuk membuka butang operasi...
                </span>
              )}
            </div>
          </div>
        )}

        {/* =================================================================
            AKTIVITI 2 – TEROKAI TIGA CADANGAN (LISTENING & UNDERSTANDING)
           ================================================================= */}
        {stage === 'explore' && (
          <div className="portal-glass-card modal-pop-in w-full max-w-6xl rounded-3xl p-5 sm:p-6 text-white space-y-5 border-2 border-emerald-400/75 my-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-cyan-400/25">
              <div>
                <div className="text-xs font-game font-bold text-emerald-300 tracking-wider">
                  AKTIVITI 2 · TEROKAI TIGA CADANGAN HUTAN HARAPAN
                </div>
                <h2 className="font-game text-xl sm:text-2xl font-black text-white">
                  Tekan Setiap Kad untuk Mendengar & Meneliti Cadangan
                </h2>
                <p className="text-xs sm:text-sm text-cyan-100/90 mt-0.5">
                  Dengar penerangan setiap cadangan serta teliti kelebihan dan cabarannya dengan baik.
                </p>
              </div>

              <div className="px-4 py-2 rounded-2xl portal-glass-sub border border-amber-400/60 text-xs font-game font-black text-amber-300">
                CADANGAN DITEROKA: {exploredIds.length} / 3
              </div>
            </div>

            {/* 3 Glowing 3D-Pedestal Strategy Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PROPOSALS.map((prop) => {
                const isSelected = activeProposalId === prop.id;
                const isExplored = exploredIds.includes(prop.id);
                const isSpeakingThis =
                  audioKey === `prop_${prop.id}` && audioStatus === 'playing';

                return (
                  <button
                    key={prop.id}
                    type="button"
                    onClick={() => handleSelectProposalInExplore(prop)}
                    className={`portal-glass-sub rounded-3xl p-4 text-left flex flex-col justify-between gap-3 border-2 transition-all duration-300 cursor-pointer ${
                      isSelected
                        ? `border-amber-300 ring-2 ring-cyan-300 ${prop.glowShadow} -translate-y-1.5 scale-[1.02]`
                        : isExplored
                        ? 'border-emerald-400/80'
                        : `${prop.cardBorder} hover:-translate-y-1`
                    }`}
                  >
                    <div className="space-y-3 w-full">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-3 py-1 rounded-xl bg-gradient-to-r ${prop.headerGrad} text-slate-950 font-game text-[11px] font-black shadow`}
                        >
                          {prop.code}
                        </span>
                        {prop.id === 'A' ? (
                          <TreePine className="w-5 h-5 text-emerald-300" />
                        ) : prop.id === 'B' ? (
                          <Users className="w-5 h-5 text-cyan-300" />
                        ) : (
                          <Megaphone className="w-5 h-5 text-purple-300" />
                        )}
                      </div>

                      <ProposalIllustration id={prop.id} />

                      <h3 className="font-game text-sm sm:text-base font-black text-white leading-snug">
                        {prop.title}
                      </h3>
                    </div>

                    <div className="pt-2 border-t border-cyan-400/20 flex items-center justify-between text-xs font-bold">
                      <span
                        className={
                          isSpeakingThis
                            ? 'text-amber-300 flex items-center gap-1.5'
                            : isExplored
                            ? 'text-emerald-300 flex items-center gap-1'
                            : 'text-cyan-200'
                        }
                      >
                        {isSpeakingThis ? (
                          <>
                            <Volume2 className="w-4 h-4 animate-pulse" /> Sedang Dibaca
                          </>
                        ) : isExplored ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Sudah Diteroka
                          </>
                        ) : (
                          'Tekan untuk dengar'
                        )}
                      </span>
                      <span className="text-cyan-300">▶</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Larger Active Strategy Detail & Audio Replay Panel */}
            {activeProposal && (
              <div className="modal-pop-in rounded-3xl p-5 sm:p-6 bg-slate-950/90 border-2 border-cyan-300/75 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                <div className="lg:col-span-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-game font-black text-amber-300">
                      {activeProposal.code} · PAPARAN BESAR
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playSFX('click');
                        playContinuousAudio(
                          `prop_${activeProposal.id}`,
                          activeProposal.audioScript,
                          'Speak in clear, friendly, enthusiastic standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) suitable for primary school pupils.'
                        );
                      }}
                      className="btn-game-cyan btn-game-sm px-3.5 py-1.5 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Main Semula Audio</span>
                    </button>
                  </div>
                  <ProposalIllustration id={activeProposal.id} large />
                </div>

                <div className="lg:col-span-7 space-y-3.5">
                  <h3 className="font-game text-lg sm:text-xl font-black text-white">
                    {activeProposal.title}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="p-4 rounded-2xl bg-emerald-950/75 border-2 border-emerald-400/70 space-y-1.5">
                      <div className="flex items-center gap-2 font-game text-sm font-black text-emerald-300">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>KELEBIHAN</span>
                      </div>
                      <p className="text-sm sm:text-base text-emerald-50 leading-relaxed font-medium">
                        {activeProposal.kelebihan}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-orange-950/70 border-2 border-orange-400/70 space-y-1.5">
                      <div className="flex items-center gap-2 font-game text-sm font-black text-orange-300">
                        <AlertTriangle className="w-5 h-5" />
                        <span>CABARAN</span>
                      </div>
                      <p className="text-sm sm:text-base text-orange-50 leading-relaxed font-medium">
                        {activeProposal.cabaran}
                      </p>
                    </div>
                  </div>

                  {audioNotice && (
                    <p className="text-xs text-amber-200">{audioNotice}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs sm:text-sm text-cyan-100">
                {exploredIds.length < 3
                  ? `Sila tekan dan teroka kesemua 3 cadangan di atas dahulu (${3 - exploredIds.length} lagi berbaki).`
                  : 'Hebat! Kamu telah meneroka kesemua 3 cadangan. Kini masa untuk membuat pilihan terbaik!'}
              </p>

              <button
                type="button"
                disabled={exploredIds.length < 3}
                onClick={() => {
                  stopCurrentAudio();
                  playSFX('portal');
                  setStage('decision');
                }}
                className="btn-game-gold disabled:opacity-45 px-7 py-3 text-slate-950 font-game text-xs sm:text-sm font-black tracking-wide cursor-pointer"
              >
                PILIH CADANGAN TERBAIK →
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            AKTIVITI 3 – KEPUTUSAN AKHIR EJEN & SUARA EJEN
           ================================================================= */}
        {stage === 'decision' && (
          <div className="portal-glass-card modal-pop-in w-full max-w-6xl rounded-3xl p-5 sm:p-6 text-white space-y-5 border-2 border-purple-400/75 my-auto">
            <div className="space-y-1 pb-3 border-b border-cyan-400/25">
              <div className="text-xs font-game font-bold text-amber-300 tracking-wider">
                AKTIVITI 3 · KEPUTUSAN AKHIR EJEN PENYELAMAT ECOWORLD
              </div>
              <h2 className="font-game text-xl sm:text-2xl font-black text-emerald-300">
                Pilih Satu Cadangan & Bentangkan Alasan Kamu!
              </h2>
              <p className="text-xs sm:text-sm text-cyan-100 leading-relaxed">
                &ldquo;Ejen, kamu sudah mendengar dan meneliti semua cadangan. Sekarang pilih satu cadangan yang paling sesuai untuk menyelamatkan Hutan Harapan!&rdquo;
              </p>
            </div>

            {/* 3 Selectable Proposal Cards (Freedom to pick any!) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {PROPOSALS.map((prop) => {
                const isChosen = chosenId === prop.id;
                return (
                  <button
                    key={prop.id}
                    type="button"
                    disabled={isRecording}
                    onClick={() => {
                      playSFX('click');
                      setChosenId(prop.id);
                    }}
                    className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer disabled:opacity-70 ${
                      isChosen
                        ? 'border-amber-300 bg-gradient-to-br from-emerald-950/90 to-sky-950/90 shadow-[0_0_24px_rgba(52,211,153,0.45)]'
                        : 'border-slate-700 bg-slate-950/80 hover:border-cyan-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-game text-xs font-black text-amber-300">{prop.code}</span>
                      {isChosen && (
                        <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Pilihan Kamu
                        </span>
                      )}
                    </div>
                    <div className="font-game text-sm font-black text-white">{prop.title}</div>
                    <p className="text-xs text-emerald-200 mt-1.5">
                      <strong>Kelebihan:</strong> {prop.kelebihan}
                    </p>
                    <p className="text-xs text-orange-200 mt-1">
                      <strong>Cabaran:</strong> {prop.cabaran}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Voice Presentation Studio: SUARA EJEN – BENTANGKAN PILIHAN KAMU! */}
            {chosenProposal && (
              <div className="modal-pop-in grid grid-cols-1 lg:grid-cols-12 gap-5 items-center portal-glass-sub rounded-3xl p-5 border-2 border-cyan-400/60">
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-game text-lg sm:text-xl font-black text-amber-300">
                      SUARA EJEN – BENTANGKAN PILIHAN KAMU!
                    </h3>
                    <span className="px-3 py-1 rounded-xl bg-emerald-950 border border-emerald-400/60 text-xs font-bold text-emerald-200">
                      {chosenProposal.shortTitle}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-cyan-100">
                    Jawab ketiga-tiga soalan panduan ini secara spontan menggunakan mikrofon:
                  </p>

                  <ul className="space-y-2 text-sm sm:text-base text-white bg-slate-950/88 border border-purple-400/45 rounded-2xl p-4 font-medium">
                    {GUIDING_QUESTIONS.map((q) => (
                      <li key={q} className="leading-relaxed">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Microphone Studio Controls */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center gap-3.5 text-center">
                  {!recordedAudio ? (
                    <>
                      <button
                        type="button"
                        onClick={isRecording ? stopMicRecording : startMicRecording}
                        className={`relative w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center gap-1 font-game text-xs font-black shadow-2xl cursor-pointer transition-transform duration-200 ${
                          isRecording
                            ? 'bg-gradient-to-br from-rose-500 to-rose-700 border-rose-200 text-white scale-105'
                            : 'bg-gradient-to-br from-orange-400 via-amber-400 to-yellow-300 border-amber-100 text-slate-950 hover:scale-105'
                        }`}
                      >
                        {isRecording ? (
                          <>
                            <Square className="w-8 h-8 fill-current" />
                            <span>BERHENTI RAKAM</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-9 h-9 stroke-[2.4]" />
                            <span>MULA RAKAM</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-end gap-1.5 h-8">
                        {voiceMeter.map((v, i) => (
                          <span
                            key={i}
                            style={{ height: isRecording ? `${Math.round(v * 32)}px` : '6px' }}
                            className={`w-2 rounded-full transition-all duration-100 ${
                              isRecording
                                ? 'bg-gradient-to-t from-emerald-400 to-cyan-300'
                                : 'bg-slate-600'
                            }`}
                          />
                        ))}
                      </div>

                      <p className="text-xs font-semibold text-cyan-100 max-w-xs">
                        {isRecording
                          ? `Sedang merakam suara anda (${formatSec(recSeconds)})... Tekan Berhenti Rakam apabila selesai.`
                          : 'Tekan Mula Rakam dan sampaikan jawapan kamu dengan jelas.'}
                      </p>
                    </>
                  ) : (
                    <div className="w-full space-y-3 p-4 rounded-2xl bg-slate-950/90 border-2 border-emerald-400/70">
                      <div className="text-xs font-game font-black text-emerald-300 flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>RAKAMAN SUARA SEDIA ({formatSec(recordedAudio.duration)})</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={handlePlayRecordedVoice}
                          className="btn-game-cyan btn-game-sm py-2.5 px-3 text-slate-950 font-game text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isPlayingBackVoice ? 'Henti Main' : 'Dengar Semula'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleReRecord}
                          className="btn-game-rose btn-game-sm py-2.5 px-3 text-white font-game text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Rakam Semula</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {voiceError && (
              <div className="p-3.5 rounded-2xl bg-rose-950/90 border-2 border-rose-400 text-rose-100 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                <span>{voiceError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                disabled={isRecording}
                onClick={() => {
                  playSFX('click');
                  setStage('explore');
                }}
                className="btn-game-slate btn-game-sm px-4 py-2.5 text-cyan-100 font-game text-xs font-bold cursor-pointer disabled:opacity-45"
              >
                ← Terokai Semula Cadangan
              </button>

              <button
                type="button"
                disabled={!chosenProposal || !recordedAudio || isRecording}
                onClick={() => {
                  playSFX('win');
                  setStage('victory');
                }}
                className="btn-game-emerald disabled:opacity-45 px-7 py-3 text-slate-950 font-game text-xs sm:text-sm font-black tracking-wide flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>SELESAIKAN MISI HUTAN HARAPAN →</span>
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            PAPARAN KEJAYAAN – HUTAN HARAPAN KEMBALI PULIH!
           ================================================================= */}
        {stage === 'victory' && (
          <div className="portal-glass-card modal-pop-in w-full max-w-4xl rounded-3xl p-6 sm:p-8 text-center text-white space-y-5 border-2 border-amber-300 my-auto">
            <div className="flex items-center justify-center gap-3">
              <Star className="w-9 h-9 text-amber-300 fill-amber-300 animate-bounce" />
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-purple-500 text-slate-950 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.75)]">
                <Award className="w-9 h-9 stroke-[2.3]" />
              </div>
              <Star className="w-9 h-9 text-amber-300 fill-amber-300 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="font-game text-3xl sm:text-5xl font-black game-title-gold">
                TAHNIAH, EJEN!
              </h2>
              <p className="text-sm sm:text-lg font-semibold text-emerald-100 max-w-2xl mx-auto leading-relaxed">
                &ldquo;Kamu berjaya menyelesaikan Misi Hutan Harapan! Kamu telah menilai pelbagai cadangan dan memilih strategi berdasarkan kelebihan serta cabarannya. Terima kasih kerana membantu memulihkan EcoWorld!&rdquo;
              </p>
            </div>

            {/* Restored Hutan Harapan Visual Status Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="portal-glass-sub rounded-2xl p-3.5 border border-emerald-400/55">
                <TreePine className="w-5 h-5 text-emerald-300 mb-1" />
                <div className="text-xs font-bold text-white">Hutan kembali menghijau</div>
              </div>
              <div className="portal-glass-sub rounded-2xl p-3.5 border border-green-400/55">
                <Leaf className="w-5 h-5 text-green-300 mb-1" />
                <div className="text-xs font-bold text-white">Pokok tumbuh subur</div>
              </div>
              <div className="portal-glass-sub rounded-2xl p-3.5 border border-cyan-400/55">
                <Droplets className="w-5 h-5 text-cyan-300 mb-1" />
                <div className="text-xs font-bold text-white">Sungai kelihatan bersih</div>
              </div>
              <div className="portal-glass-sub rounded-2xl p-3.5 border border-purple-400/55">
                <Sparkles className="w-5 h-5 text-purple-300 mb-1" />
                <div className="text-xs font-bold text-white">Haiwan kembali ke habitat</div>
              </div>
            </div>

            {/* Badge Awarded Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-sky-950/90 to-purple-950/90 border-2 border-amber-300/75 flex flex-wrap items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-300 text-slate-950 flex items-center justify-center font-game font-black shadow-lg shrink-0">
                  <Award className="w-7 h-7" />
                </div>
                <div>
                  <div className="text-[11px] font-game font-bold text-amber-300 tracking-wider">
                    LENCANA DIANUGERAHKAN
                  </div>
                  <div className="font-game text-base sm:text-lg font-black text-white">
                    EJEN STRATEGI CEMERLANG
                  </div>
                </div>
              </div>
              <div className="font-mono-num text-xl font-black text-amber-300">
                +{mission.maxXp} XP
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  playSFX('click');
                  handleFinishMission3('map');
                }}
                className="btn-game-slate py-3.5 px-5 text-cyan-100 font-game text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>KEMBALI KE HALAMAN UTAMA</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSFX('warp');
                  handleFinishMission3('next_mission');
                }}
                className="btn-game-emerald py-3.5 px-5 text-slate-950 font-game text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.03] transition-transform"
              >
                <Sparkles className="w-4 h-4" />
                <span>TERUSKAN KE MISI 4</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
