import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  FileText,
  Headphones,
  Lightbulb,
  MessageSquareQuote,
  Music,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AVATARS } from '../data/gameData';
import { animateHumanAgent, buildHumanEcoAgent } from '../three/humanAgents';
import { MissionDef, UserAccount } from '../types/game';
import { playSFX, setMusicState } from '../utils/sound';

export interface Mission4VoiceLabAdventureProps {
  mission: MissionDef;
  user: UserAccount;
  musicOn: boolean;
  musicVolume: number;
  onToggleMusic: () => void;
  onChangeMusicVolume: (vol: number) => void;
  onClose: () => void;
  onCompleteMission4: (
    score: number,
    argument: { pendirian: string; bukti: string; huraian: string; kesimpulan: string },
    hasRecording: boolean,
    peerFeedback: string,
    afterAction?: 'map' | 'next_mission'
  ) => void;
}

type Mission4Stage = 'call' | 'report' | 'builder' | 'transfer_success';
type AudioPlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'blocked';

interface ArgumentDraft {
  pendirian: string;
  bukti: string;
  huraian: string;
  kesimpulan: string;
}

const CALL_SCRIPT =
  'Selamat datang, Ejen! Sebelum menghasilkan kempen kesedaran alam sekitar, kamu perlu menyediakan hujah yang bernas. Dengar laporan pencemaran yang diberikan dengan teliti. Kemudian, gunakan maklumat tersebut untuk membina hujah kamu. Hujah ini akan menjadi panduan dalam misi seterusnya. Bersedia, Ejen?';

const REPORT_SCRIPT =
  'Penduduk di kawasan Taman Harmoni semakin bimbang dengan masalah pencemaran udara. Banyak kenderaan mengeluarkan asap hitam, manakala aktiviti pembakaran terbuka masih berlaku. Keadaan ini menyebabkan udara menjadi tidak bersih dan mengganggu keselesaan penduduk. Penduduk berharap agar tindakan segera diambil untuk mengatasi masalah ini.';

const CONGRATS_MESSAGE =
  'TAHNIAH, EJEN! Hujah kamu berjaya disimpan. Kini, gunakan idea tersebut untuk menghasilkan kempen kesedaran alam sekitar dalam misi terakhir!';

const ARGUMENT_FIELDS: {
  key: keyof ArgumentDraft;
  numberLabel: string;
  title: string;
  question: string;
  example: string;
  accentCard: string;
  accentBadge: string;
  accentInput: string;
}[] = [
  {
    key: 'pendirian',
    numberLabel: '1',
    title: 'PENDIRIAN',
    question: 'Apakah pandangan kamu tentang isu pencemaran tersebut?',
    example: 'Contoh: Saya berpendapat pencemaran udara perlu dibendung.',
    accentCard: 'border-emerald-400/60 bg-slate-900/90',
    accentBadge: 'from-emerald-400 to-green-500 text-slate-950',
    accentInput: 'focus:border-emerald-400 focus:ring-emerald-400/30',
  },
  {
    key: 'bukti',
    numberLabel: '2',
    title: 'BUKTI UTAMA',
    question: 'Apakah maklumat daripada laporan yang menyokong pandangan kamu?',
    example:
      'Contoh: Buktinya, terdapat kenderaan yang mengeluarkan asap hitam dan aktiviti pembakaran terbuka.',
    accentCard: 'border-cyan-400/60 bg-slate-900/90',
    accentBadge: 'from-cyan-400 to-sky-500 text-slate-950',
    accentInput: 'focus:border-cyan-400 focus:ring-cyan-400/30',
  },
  {
    key: 'huraian',
    numberLabel: '3',
    title: 'HURAIAN DAN CADANGAN',
    question: 'Apakah tindakan yang boleh dilakukan untuk mengatasi masalah tersebut?',
    example:
      'Contoh: Oleh itu, masyarakat perlu mengurangkan pembakaran terbuka dan menggunakan pengangkutan awam.',
    accentCard: 'border-amber-400/60 bg-slate-900/90',
    accentBadge: 'from-amber-300 to-yellow-500 text-slate-950',
    accentInput: 'focus:border-amber-400 focus:ring-amber-400/30',
  },
  {
    key: 'kesimpulan',
    numberLabel: '4',
    title: 'SERUAN / KESIMPULAN',
    question: 'Apakah seruan kamu kepada masyarakat?',
    example: 'Contoh: Tegasnya, marilah kita bersama-sama menjaga kebersihan udara.',
    accentCard: 'border-violet-400/60 bg-slate-900/90',
    accentBadge: 'from-violet-400 to-purple-500 text-white',
    accentInput: 'focus:border-violet-400 focus:ring-violet-400/30',
  },
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

/* ============================================================================
   CUSTOM ILLUSTRATION: LAPORAN PENCEMARAN TAMAN HARMONI
   ============================================================================ */
function TamanHarmoniPollutionIllustration() {
  return (
    <svg
      viewBox="0 0 420 220"
      className="w-full h-44 sm:h-52 rounded-2xl border border-cyan-400/40 shadow-inner"
      aria-label="Ilustrasi pencemaran udara di Taman Harmoni akibat asap kenderaan dan pembakaran terbuka"
    >
      <defs>
        <linearGradient id="m4PollutedSky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="55%" stopColor="#475569" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="m4SmokeDark" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e293b" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#64748b" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="m4FireGlow" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="60%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
      </defs>

      {/* Hazy Polluted Sky */}
      <rect width="420" height="220" fill="url(#m4PollutedSky)" />
      {/* Dimmed sun behind smog */}
      <circle cx="355" cy="42" r="22" fill="#fde047" opacity="0.45" />

      {/* Taman Harmoni neighborhood houses */}
      <rect x="20" y="96" width="58" height="44" rx="4" fill="#cbd5e1" />
      <polygon points="14,98 49,72 84,98" fill="#0f766e" />
      <rect x="38" y="114" width="16" height="26" rx="2" fill="#334155" />

      <rect x="92" y="102" width="54" height="38" rx="4" fill="#e2e8f0" />
      <polygon points="86,104 119,80 152,104" fill="#0284c7" />
      <rect x="108" y="114" width="14" height="14" rx="2" fill="#38bdf8" opacity="0.7" />

      {/* Ground & Road */}
      <rect x="0" y="140" width="420" height="24" fill="#15803d" />
      <rect x="0" y="164" width="420" height="56" fill="#1e293b" />
      {/* Road dashed lines */}
      <rect x="18" y="190" width="42" height="5" rx="2.5" fill="#fde047" opacity="0.8" />
      <rect x="90" y="190" width="42" height="5" rx="2.5" fill="#fde047" opacity="0.8" />
      <rect x="162" y="190" width="42" height="5" rx="2.5" fill="#fde047" opacity="0.8" />
      <rect x="234" y="190" width="42" height="5" rx="2.5" fill="#fde047" opacity="0.8" />

      {/* Open Burning Scene (Right side) */}
      <ellipse cx="336" cy="152" rx="42" ry="11" fill="#3f3f46" />
      {/* Thick open-burning smoke plumes */}
      <circle cx="322" cy="112" r="18" fill="url(#m4SmokeDark)" />
      <circle cx="342" cy="88" r="24" fill="url(#m4SmokeDark)" />
      <circle cx="326" cy="58" r="28" fill="url(#m4SmokeDark)" />
      <circle cx="358" cy="48" r="22" fill="url(#m4SmokeDark)" />
      {/* Flames */}
      <path
        d="M312 152 Q320 120 332 138 Q340 112 350 138 Q360 122 362 152 Z"
        fill="url(#m4FireGlow)"
      />

      {/* Vehicle 1 emitting heavy black smoke */}
      <circle cx="32" cy="166" r="10" fill="url(#m4SmokeDark)" />
      <circle cx="20" cy="148" r="15" fill="url(#m4SmokeDark)" />
      <circle cx="14" cy="126" r="19" fill="url(#m4SmokeDark)" />
      <rect x="44" y="156" width="84" height="28" rx="8" fill="#ef4444" />
      <rect x="64" y="142" width="44" height="16" rx="5" fill="#f87171" />
      <rect x="70" y="145" width="14" height="10" rx="2" fill="#bae6fd" />
      <rect x="88" y="145" width="14" height="10" rx="2" fill="#bae6fd" />
      <circle cx="62" cy="184" r="9" fill="#0f172a" stroke="#94a3b8" strokeWidth="2.5" />
      <circle cx="110" cy="184" r="9" fill="#0f172a" stroke="#94a3b8" strokeWidth="2.5" />

      {/* Vehicle 2 (Truck/Van) emitting dark exhaust */}
      <circle cx="146" cy="160" r="11" fill="url(#m4SmokeDark)" />
      <circle cx="136" cy="138" r="16" fill="url(#m4SmokeDark)" />
      <circle cx="152" cy="114" r="20" fill="url(#m4SmokeDark)" />
      <rect x="164" y="144" width="96" height="38" rx="7" fill="#0284c7" />
      <rect x="228" y="150" width="24" height="15" rx="3" fill="#bae6fd" />
      <circle cx="186" cy="184" r="10" fill="#0f172a" stroke="#94a3b8" strokeWidth="2.5" />
      <circle cx="240" cy="184" r="10" fill="#0f172a" stroke="#94a3b8" strokeWidth="2.5" />

      {/* Resident covering nose / concerned */}
      <circle cx="282" cy="126" r="8" fill="#fde68a" />
      <rect x="275" y="135" width="14" height="22" rx="4" fill="#14b8a6" />
      <rect x="277" y="128" width="9" height="4" rx="2" fill="#ffffff" />

      {/* Labels inside SVG */}
      <rect x="12" y="12" width="144" height="24" rx="8" fill="#0f172a" fillOpacity="0.82" />
      <text x="84" y="28" textAnchor="middle" fill="#67e8f9" fontSize="10.5" fontWeight="bold">
        ASAP HITAM KENDERAAN
      </text>
      <rect x="262" y="12" width="146" height="24" rx="8" fill="#0f172a" fillOpacity="0.82" />
      <text x="335" y="28" textAnchor="middle" fill="#fcd34d" fontSize="10.5" fontWeight="bold">
        PEMBAKARAN TERBUKA
      </text>
    </svg>
  );
}

/* ============================================================================
   MAIN COMPONENT: MISI 4 – MAKMAL SUARA
   ============================================================================ */
export function Mission4VoiceLabAdventure({
  mission,
  user,
  musicOn,
  musicVolume,
  onToggleMusic,
  onChangeMusicVolume,
  onClose,
  onCompleteMission4,
}: Mission4VoiceLabAdventureProps) {
  const existingArg = user.progress?.m4.argument;

  const [stage, setStage] = useState<Mission4Stage>('call');

  // Continuous Bahasa Melayu Audio Controller
  const [audioKey, setAudioKey] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioPlayStatus>('idle');
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [reportListenCount, setReportListenCount] = useState(0);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const ttsBlobCacheRef = useRef<Record<string, string>>({});
  const audioModeRef = useRef<'none' | 'tts' | 'speech' | 'silent'>('none');
  const silentTimerRef = useRef<number | null>(null);
  const callAutoStartedRef = useRef(false);
  const reportAutoStartedRef = useRef(false);

  // Stage 3: 4-Component Argument Builder State (isolated per logged-in student)
  const [draft, setDraft] = useState<ArgumentDraft>(() => ({
    pendirian: existingArg?.pendirian || '',
    bukti: existingArg?.bukti || '',
    huraian: existingArg?.huraian || '',
    kesimpulan: existingArg?.kesimpulan || '',
  }));
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof ArgumentDraft, string>>>({});
  const [formBannerError, setFormBannerError] = useState<string | null>(null);
  const [showReportDrawerInBuilder, setShowReportDrawerInBuilder] = useState(false);

  // Stage 4: Holographic Transfer Animation State
  const [transferPhase, setTransferPhase] = useState<'sending' | 'done'>('sending');
  const transferTimerRef = useRef<number | null>(null);

  // Three.js Makmal Suara Holographic Backdrop
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Mission4Stage>(stage);
  stageRef.current = stage;

  const avatarDef = AVATARS.find((a) => a.id === user.avatar) || AVATARS[0];

  // =========================================================================
  // LIVE 3D FUTURISTIC MAKMAL SUARA BACKDROP
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
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#041126');
    scene.fog = new THREE.FogExp2('#071d3d', 0.017);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      160
    );
    camera.position.set(0, 4.8, 16.5);

    const hemi = new THREE.HemisphereLight('#67e8f9', '#064e3b', 1.25);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight('#fef08a', 1.35);
    keyLight.position.set(10, 18, 12);
    scene.add(keyLight);
    const cyanLight = new THREE.PointLight('#22d3ee', 2.8, 45);
    cyanLight.position.set(-7, 6, -3);
    scene.add(cyanLight);
    const emeraldLight = new THREE.PointLight('#10b981', 2.4, 45);
    emeraldLight.position.set(7, 5, -4);
    scene.add(emeraldLight);

    // Makmal Suara Circular Stage Platform
    const stageDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(8.8, 9.8, 0.7, 48),
      new THREE.MeshStandardMaterial({ color: '#0a2240', metalness: 0.65, roughness: 0.25 })
    );
    stageDeck.position.y = -0.35;
    scene.add(stageDeck);

    const rimMat = new THREE.MeshBasicMaterial({ color: '#22d3ee' });
    const stageRim = new THREE.Mesh(new THREE.TorusGeometry(8.85, 0.09, 12, 64), rimMat);
    stageRim.rotation.x = Math.PI / 2;
    stageRim.position.y = 0.02;
    scene.add(stageRim);

    // Holographic Soundwave Rings in Makmal Suara
    const holoGroup = new THREE.Group();
    holoGroup.position.set(0, 3.6, -4.2);
    scene.add(holoGroup);

    const coreMat = new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.65,
      wireframe: true,
    });
    const coreSphere = new THREE.Mesh(new THREE.OctahedronGeometry(1.75, 2), coreMat);
    holoGroup.add(coreSphere);

    const outerRingMat = new THREE.MeshBasicMaterial({ color: '#34d399' });
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.08, 12, 64), outerRingMat);
    outerRing.rotation.x = Math.PI / 2.6;
    holoGroup.add(outerRing);

    const goldRingMat = new THREE.MeshBasicMaterial({ color: '#facc15' });
    const goldRing = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.05, 10, 48), goldRingMat);
    goldRing.rotation.y = Math.PI / 3;
    holoGroup.add(goldRing);

    // Animated Acoustic Equalizer Pillars behind Hologram
    const eqBars: THREE.Mesh[] = [];
    const barGeo = new THREE.BoxGeometry(0.45, 1, 0.45);
    for (let i = -5; i <= 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? '#22d3ee' : '#34d399',
        emissive: i % 2 === 0 ? '#0891b2' : '#059669',
        emissiveIntensity: 0.75,
        roughness: 0.25,
      });
      const bar = new THREE.Mesh(barGeo, mat);
      bar.position.set(i * 1.1, 1.4, -7.8);
      scene.add(bar);
      eqBars.push(bar);
    }

    // Contact shadow + 3D EcoWorld Agent
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
    sGrad.addColorStop(0, 'rgba(2, 6, 23, 0.75)');
    sGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);

    const agentRig = buildHumanEcoAgent(avatarDef.id, shadowTex, { showPedestal: true });
    agentRig.group.position.set(-5.0, 0, 2.0);
    agentRig.group.rotation.y = 0.52;
    agentRig.group.scale.setScalar(1.3);
    scene.add(agentRig.group);

    // Floating Data / Eco Particles
    const partCount = isSoftwareGl ? 60 : 150;
    const partPos = new Float32Array(partCount * 3);
    for (let i = 0; i < partCount; i++) {
      partPos[i * 3] = (Math.random() - 0.5) * 32;
      partPos[i * 3 + 1] = Math.random() * 13 + 0.5;
      partPos[i * 3 + 2] = (Math.random() - 0.5) * 24 - 3;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
    const partMat = new THREE.PointsMaterial({
      color: '#67e8f9',
      size: 0.22,
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
      const isTransfer = st === 'transfer_success';

      const targetBg = new THREE.Color(isTransfer ? '#064e3b' : '#041126');
      (scene.background as THREE.Color).lerp(targetBg, dt * 2.2);

      coreSphere.rotation.y = elapsed * (isTransfer ? 1.1 : 0.42);
      outerRing.rotation.z = elapsed * (isTransfer ? 1.3 : 0.5);
      goldRing.rotation.x = elapsed * 0.6;
      coreMat.emissive.set(isTransfer ? '#34d399' : '#0ea5e9');
      rimMat.color.set(isTransfer ? '#fde047' : '#22d3ee');
      partMat.color.set(isTransfer ? '#fef08a' : '#67e8f9');

      eqBars.forEach((bar, idx) => {
        const amp = isTransfer ? 3.2 : 1.7;
        const hScale = 0.7 + Math.abs(Math.sin(elapsed * 2.8 + idx * 0.6)) * amp;
        bar.scale.y += (hScale - bar.scale.y) * Math.min(1, dt * 10);
        bar.position.y = bar.scale.y * 0.5;
      });

      particles.rotation.y = elapsed * 0.04;
      animateHumanAgent(agentRig, elapsed, dt, {
        isMoving: false,
        hovered: isTransfer || st === 'call',
        selected: true,
      });

      camera.position.x = Math.sin(elapsed * 0.22) * 1.1;
      camera.position.y = 4.7 + Math.cos(elapsed * 0.28) * 0.25;
      camera.lookAt(0, 2.5, -2.5);

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
  // CONTINUOUS BAHASA MELAYU AUDIO ENGINE (NEVER ENGLISH, NEVER SPLIT)
  // =========================================================================
  const stopCurrentAudio = useCallback(() => {
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
    if (key === 'report') {
      setReportListenCount((c) => c + 1);
    }
  }, []);

  const playContinuousMalaySpeechFallback = useCallback(
    (key: string, scriptText: string) => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const malayVoice = pickMalaySpeechVoice(voices);
        if (malayVoice) {
          window.speechSynthesis.cancel();
          audioModeRef.current = 'speech';

          const utter = new SpeechSynthesisUtterance(scriptText);
          utter.voice = malayVoice;
          utter.lang = malayVoice.lang;
          utter.rate = 0.95;
          utter.pitch = 1.03;

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

      // Strict Bahasa Melayu guard: Never fall back to English voice!
      audioModeRef.current = 'silent';
      setAudioStatus('playing');
      setMusicState({ suppressedForAudio: false });
      setAudioNotice(
        'Pelayar ini tidak mempunyai enjin suara Bahasa Melayu tempatan. Sila baca teks lengkap pada skrin (tiada suara Inggeris digunakan).'
      );
      silentTimerRef.current = window.setTimeout(() => {
        markAudioEnded(key);
      }, 6500);
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

    if (audioModeRef.current === 'tts' && audioElRef.current) {
      audioElRef.current.play().catch(() => {
        setAudioStatus('blocked');
      });
      setAudioStatus('playing');
      setMusicState({ suppressedForAudio: true });
    } else if (
      audioModeRef.current === 'speech' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.paused
    ) {
      window.speechSynthesis.resume();
      setAudioStatus('playing');
      setMusicState({ suppressedForAudio: true });
    } else {
      playContinuousAudio(key, scriptText, stylePrompt);
    }
  };

  // Auto-play Langkah 1 audio ONCE on entry
  useEffect(() => {
    if (stage === 'call' && !callAutoStartedRef.current) {
      callAutoStartedRef.current = true;
      playContinuousAudio(
        'call',
        CALL_SCRIPT,
        'Speak in clear, warm, inspiring standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like the Makmal Suara Commander welcoming Year 6 primary school hero agents.'
      );
    }
  }, [stage, playContinuousAudio]);

  // Auto-play Langkah 2 pollution report ONCE on first entry
  useEffect(() => {
    if (stage === 'report' && !reportAutoStartedRef.current) {
      reportAutoStartedRef.current = true;
      playContinuousAudio(
        'report',
        REPORT_SCRIPT,
        'Speak in clear, calm, expressive standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like a news field reporter reporting air pollution in Taman Harmoni for primary school pupils.'
      );
    }
  }, [stage, playContinuousAudio]);

  // Cleanup audio, blob cache & timers on unmount
  useEffect(() => {
    const cacheMap = ttsBlobCacheRef.current;
    return () => {
      stopCurrentAudio();
      Object.values(cacheMap).forEach((u) => URL.revokeObjectURL(u));
      if (transferTimerRef.current) {
        clearTimeout(transferTimerRef.current);
      }
    };
  }, [stopCurrentAudio]);

  // =========================================================================
  // STAGE NAVIGATION & ARGUMENT VALIDATION
  // =========================================================================
  const goToReportStage = () => {
    playSFX('click');
    stopCurrentAudio();
    setStage('report');
  };

  const goToBuilderStage = () => {
    playSFX('click');
    stopCurrentAudio();
    setStage('builder');
  };

  const handleDraftChange = (key: keyof ArgumentDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if (formBannerError) setFormBannerError(null);
  };

  const handleValidateAndTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: ArgumentDraft = {
      pendirian: draft.pendirian.trim(),
      bukti: draft.bukti.trim(),
      huraian: draft.huraian.trim(),
      kesimpulan: draft.kesimpulan.trim(),
    };

    const errs: Partial<Record<keyof ArgumentDraft, string>> = {};
    if (cleaned.pendirian.length < 5) {
      errs.pendirian = 'Sila tulis pendirian kamu dengan ayat yang lengkap.';
    }
    if (cleaned.bukti.length < 5) {
      errs.bukti = 'Sila nyatakan bukti utama daripada laporan Taman Harmoni.';
    }
    if (cleaned.huraian.length < 5) {
      errs.huraian = 'Sila tulis huraian atau cadangan tindakan yang munasabah.';
    }
    if (cleaned.kesimpulan.length < 5) {
      errs.kesimpulan = 'Sila tulis seruan atau kesimpulan untuk masyarakat.';
    }

    if (Object.keys(errs).length > 0) {
      playSFX('error');
      setValidationErrors(errs);
      setFormBannerError(
        'Lengkapkan kesemua 4 komponen hujah terlebih dahulu sebelum menyimpan ke Misi 5!'
      );
      return;
    }

    playSFX('xp');
    stopCurrentAudio();
    setDraft(cleaned);
    setTransferPhase('sending');
    setStage('transfer_success');

    if (transferTimerRef.current) clearTimeout(transferTimerRef.current);
    transferTimerRef.current = window.setTimeout(() => {
      playSFX('win');
      setTransferPhase('done');
    }, 1500);
  };

  const handleCommitMission4 = (afterAction: 'map' | 'next_mission') => {
    stopCurrentAudio();
    const cleaned: ArgumentDraft = {
      pendirian: draft.pendirian.trim(),
      bukti: draft.bukti.trim(),
      huraian: draft.huraian.trim(),
      kesimpulan: draft.kesimpulan.trim(),
    };
    onCompleteMission4(
      95,
      cleaned,
      false,
      'Hujah berstruktur daripada laporan pencemaran udara Taman Harmoni berjaya dihantar ke Misi 5.',
      afterAction
    );
  };

  const completedFieldCount = ARGUMENT_FIELDS.filter(
    (f) => draft[f.key].trim().length >= 5
  ).length;

  const currentStageIndex =
    stage === 'call' ? 1 : stage === 'report' ? 2 : stage === 'builder' ? 3 : 4;

  const isAudioPlaying = audioStatus === 'playing';
  const isAudioLoading = audioStatus === 'loading';
  const isAudioPaused = audioStatus === 'paused';

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-slate-950 select-none">
      {/* Live 3D Makmal Suara Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />

      {/* Top HUD Bar */}
      <header className="relative z-20 px-3 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              playSFX('click');
              stopCurrentAudio();
              onClose();
            }}
            className="btn-game-slate btn-game-sm px-3.5 py-2 text-xs font-game font-black text-white flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-cyan-300" /> Peta Misi
          </button>

          <div className="px-3.5 py-1.5 rounded-2xl bg-slate-950/90 border border-cyan-400/50 backdrop-blur-md flex items-center gap-2 shadow-lg">
            <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
            <span className="font-game text-xs sm:text-sm font-black text-white tracking-wide uppercase">
              MISI 04: {mission.shortTitle || 'MAKMAL SUARA'}
            </span>
          </div>
        </div>

        {/* Stepper & Audio Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-950/90 border border-slate-700/80 backdrop-blur-md text-[11px] font-game font-bold">
            {[
              { n: 1, label: 'Panggilan' },
              { n: 2, label: 'Laporan' },
              { n: 3, label: 'Bina Hujah' },
              { n: 4, label: 'Simpan' },
            ].map((step) => {
              const active = currentStageIndex === step.n;
              const done = currentStageIndex > step.n;
              return (
                <span
                  key={step.n}
                  className={`px-2 py-0.5 rounded-lg transition-colors ${
                    active
                      ? 'bg-cyan-400 text-slate-950 font-black'
                      : done
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                      : 'text-slate-400'
                  }`}
                >
                  {step.n}. {step.label}
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-950/90 border border-slate-700/80 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                onToggleMusic();
              }}
              title={musicOn ? 'Tutup Muzik Latar' : 'Buka Muzik Latar'}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-cyan-300 cursor-pointer"
            >
              {musicOn ? <Music className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              onChange={(e) => onChangeMusicVolume(parseFloat(e.target.value))}
              aria-label="Kelantangan Muzik"
              className="w-14 sm:w-16 accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>
      </header>

      {/* Main Centered Content Area */}
      <main className="relative z-10 h-[calc(100vh-76px)] overflow-y-auto px-3 sm:px-6 py-4 flex items-center justify-center">
        {/* ================================================================
            LANGKAH 1: PANGGILAN MAKMAL SUARA
           ================================================================ */}
        {stage === 'call' && (
          <div className="w-full max-w-4xl rounded-3xl bg-slate-950/88 border-2 border-cyan-400/60 shadow-[0_0_50px_rgba(34,211,238,0.28)] backdrop-blur-xl p-5 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/25 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-lg">
                  <Headphones className="w-6 h-6 text-slate-950" />
                </div>
                <div>
                  <span className="inline-block text-[11px] font-game font-black uppercase tracking-widest text-cyan-300">
                    LANGKAH 1 · PANGGILAN MAKMAL SUARA
                  </span>
                  <h1 className="font-game text-xl sm:text-2xl font-black text-white">
                    PUSAT KAWALAN MAKMAL SUARA
                  </h1>
                </div>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 text-xs font-game font-bold flex items-center gap-1.5">
                <span className="text-base">{avatarDef.emoji}</span>
                <span>EJEN {user.fullName.split(' ')[0].toUpperCase()}</span>
              </div>
            </div>

            {/* Hologram Commander Message Box */}
            <div className="rounded-2xl bg-slate-900/90 border border-cyan-400/40 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-game font-bold text-amber-300 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Arahan Komander Makmal Suara</span>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">
                  {audioKey === 'call' && isAudioLoading
                    ? 'Menjana suara Melayu...'
                    : audioKey === 'call' && isAudioPlaying
                    ? '🔊 Sedang dimainkan'
                    : audioKey === 'call' && isAudioPaused
                    ? '⏸ Dijeda'
                    : 'Sedia dimainkan'}
                </span>
              </div>

              <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                {CALL_SCRIPT}
              </p>

              {audioNotice && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-xs text-amber-200">
                  {audioNotice}
                </div>
              )}

              {/* Audio Controls */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {audioKey === 'call' && isAudioPlaying ? (
                  <button
                    type="button"
                    onClick={handlePauseAudio}
                    className="btn-game-gold btn-game-sm px-4 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-4 h-4" /> Jeda Audio
                  </button>
                ) : audioKey === 'call' && isAudioPaused ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleResumeAudio(
                        'call',
                        CALL_SCRIPT,
                        'Speak in clear, warm, inspiring standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like the Makmal Suara Commander welcoming Year 6 primary school hero agents.'
                      )
                    }
                    className="btn-game-cyan btn-game-sm px-4 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" /> Sambung Audio
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      playSFX('click');
                      playContinuousAudio(
                        'call',
                        CALL_SCRIPT,
                        'Speak in clear, warm, inspiring standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like the Makmal Suara Commander welcoming Year 6 primary school hero agents.'
                      );
                    }}
                    disabled={isAudioLoading}
                    className="btn-game-cyan btn-game-sm px-4 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Volume2 className="w-4 h-4" />
                    {audioStatus === 'blocked'
                      ? 'Mainkan Audio Arahan'
                      : 'Dengar Semula Arahan'}
                  </button>
                )}

                <span className="text-xs text-slate-400">
                  Konsep Misi 4: <strong className="text-emerald-300">Dengar Laporan → Bina Hujah → Simpan Hujah</strong>
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={goToReportStage}
                className="btn-game-emerald px-6 py-3.5 rounded-2xl text-slate-950 font-game text-sm sm:text-base font-black tracking-wide flex items-center gap-2 shadow-[0_0_25px_rgba(52,211,153,0.45)] cursor-pointer"
              >
                <span>DENGAR LAPORAN</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            LANGKAH 2: DENGAR LAPORAN PENCEMARAN (TAMAN HARMONI)
           ================================================================ */}
        {stage === 'report' && (
          <div className="w-full max-w-4xl rounded-3xl bg-slate-950/90 border-2 border-cyan-400/60 shadow-[0_0_50px_rgba(34,211,238,0.28)] backdrop-blur-xl p-5 sm:p-7 space-y-5 my-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/25 pb-3.5">
              <div>
                <span className="text-[11px] font-game font-black uppercase tracking-widest text-amber-300">
                  LANGKAH 2 · DENGAR LAPORAN PENCEMARAN
                </span>
                <h2 className="font-game text-xl sm:text-2xl font-black text-white">
                  LAPORAN SITUASI: PENCEMARAN UDARA TAMAN HARMONI
                </h2>
              </div>
              <span className="px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-xs font-game font-bold text-cyan-200">
                Didengar: {reportListenCount}x
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-6 space-y-2">
                <TamanHarmoniPollutionIllustration />
                <p className="text-[11px] text-slate-400 text-center">
                  Paparan situasi pencemaran udara di kawasan Taman Harmoni
                </p>
              </div>

              <div className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-700/80 p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-game font-bold text-cyan-300 uppercase flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> Transkrip Laporan Audio
                  </span>
                  {audioKey === 'report' && isAudioPlaying && (
                    <span className="text-[11px] font-bold text-emerald-300 animate-pulse">
                      ● Audio Sedang Berjalan
                    </span>
                  )}
                </div>

                <p className="text-sm sm:text-[15px] text-slate-100 leading-relaxed font-medium">
                  “{REPORT_SCRIPT}”
                </p>

                {audioNotice && (
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-xs text-amber-200">
                    {audioNotice}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {audioKey === 'report' && isAudioPlaying ? (
                    <button
                      type="button"
                      onClick={handlePauseAudio}
                      className="btn-game-gold btn-game-sm px-4 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pause className="w-4 h-4" /> Jeda
                    </button>
                  ) : audioKey === 'report' && isAudioPaused ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleResumeAudio(
                          'report',
                          REPORT_SCRIPT,
                          'Speak in clear, calm, expressive standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like a news field reporter reporting air pollution in Taman Harmoni for primary school pupils.'
                        )
                      }
                      className="btn-game-cyan btn-game-sm px-4 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" /> Sambung
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        playSFX('click');
                        playContinuousAudio(
                          'report',
                          REPORT_SCRIPT,
                          'Speak in clear, calm, expressive standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like a news field reporter reporting air pollution in Taman Harmoni for primary school pupils.'
                        );
                      }}
                      disabled={isAudioLoading}
                      className="btn-game-cyan btn-game-sm px-4 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Volume2 className="w-4 h-4" />
                      {isAudioLoading ? 'Memuatkan...' : 'Mainkan Laporan'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      playSFX('click');
                      playContinuousAudio(
                        'report',
                        REPORT_SCRIPT,
                        'Speak in clear, calm, expressive standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like a news field reporter reporting air pollution in Taman Harmoni for primary school pupils.'
                      );
                    }}
                    disabled={isAudioLoading}
                    className="btn-game-slate btn-game-sm px-3.5 py-2 text-slate-100 font-game text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-cyan-300" /> Ulang Semula
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/35 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-emerald-100 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  Dengar maklumat tentang <strong>asap kenderaan</strong> dan{' '}
                  <strong>pembakaran terbuka</strong> sebelum membina hujah kamu.
                </span>
              </div>

              <button
                type="button"
                onClick={goToBuilderStage}
                className="btn-game-emerald px-6 py-3 rounded-2xl text-slate-950 font-game text-sm sm:text-base font-black tracking-wide flex items-center gap-2 shadow-[0_0_25px_rgba(52,211,153,0.45)] cursor-pointer ml-auto"
              >
                <span>BINA HUJAH SAYA</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            LANGKAH 3: MAKMAL PEMBINAAN HUJAH (4 KOMPONEN, TIADA RAKAMAN SUARA)
           ================================================================ */}
        {stage === 'builder' && (
          <form
            onSubmit={handleValidateAndTransfer}
            className="w-full max-w-5xl rounded-3xl bg-slate-950/92 border-2 border-emerald-400/60 shadow-[0_0_50px_rgba(16,185,129,0.25)] backdrop-blur-xl p-4 sm:p-6 space-y-4 my-auto"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div>
                <span className="text-[11px] font-game font-black uppercase tracking-widest text-emerald-300">
                  LANGKAH 3 · MAKMAL PEMBINAAN HUJAH
                </span>
                <h2 className="font-game text-lg sm:text-2xl font-black text-white">
                  SUSUN 4 KOMPONEN HUJAH KRITIS KAMU
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    playSFX('click');
                    setShowReportDrawerInBuilder((v) => !v);
                  }}
                  className="btn-game-cyan btn-game-sm px-3.5 py-2 text-slate-950 font-game text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {showReportDrawerInBuilder ? 'Tutup Rujukan Laporan' : 'Rujuk Laporan Semula'}
                </button>
                <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-emerald-400/50 text-xs font-game font-black text-emerald-300">
                  Siap: {completedFieldCount}/4
                </span>
              </div>
            </div>

            {/* Optional quick reference strip to re-read / re-listen to the report */}
            {showReportDrawerInBuilder && (
              <div className="rounded-2xl bg-slate-900/95 border border-cyan-400/45 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs sm:text-sm text-cyan-100 leading-relaxed flex-1 min-w-[240px]">
                  <strong className="text-cyan-300 block mb-0.5">Laporan Taman Harmoni:</strong>
                  “{REPORT_SCRIPT}”
                </p>
                <button
                  type="button"
                  onClick={() => {
                    playSFX('click');
                    if (audioKey === 'report' && isAudioPlaying) {
                      stopCurrentAudio();
                    } else {
                      playContinuousAudio(
                        'report',
                        REPORT_SCRIPT,
                        'Speak in clear, calm, expressive standard Malaysian Bahasa Melayu (Bahasa Melayu baku Malaysia) like a news field reporter reporting air pollution in Taman Harmoni for primary school pupils.'
                      );
                    }
                  }}
                  className="btn-game-slate btn-game-sm px-3.5 py-2 text-white font-game text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Volume2 className="w-4 h-4 text-cyan-300" />
                  {audioKey === 'report' && isAudioPlaying ? 'Henti Audio' : 'Dengar Laporan'}
                </button>
              </div>
            )}

            {formBannerError && (
              <div className="rounded-2xl bg-rose-500/15 border border-rose-400/60 px-4 py-2.5 text-xs sm:text-sm text-rose-200 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{formBannerError}</span>
              </div>
            )}

            {/* 4 Interactive Argument Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ARGUMENT_FIELDS.map((field) => {
                const value = draft[field.key];
                const err = validationErrors[field.key];
                const isReady = value.trim().length >= 5;

                return (
                  <div
                    key={field.key}
                    className={`rounded-2xl border p-4 space-y-2.5 transition-all ${
                      err
                        ? 'border-rose-400/80 bg-rose-950/20'
                        : isReady
                        ? 'border-emerald-400/75 bg-slate-900/95 shadow-[0_0_20px_rgba(16,185,129,0.14)]'
                        : field.accentCard
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-xl bg-gradient-to-br ${field.accentBadge} font-game text-xs font-black flex items-center justify-center shadow`}
                        >
                          {field.numberLabel}
                        </span>
                        <h3 className="font-game text-sm font-black text-white tracking-wide">
                          {field.title}
                        </h3>
                      </div>

                      {isReady ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <MessageSquareQuote className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                    </div>

                    <p className="text-xs font-semibold text-cyan-200">{field.question}</p>

                    <textarea
                      rows={3}
                      value={value}
                      onChange={(e) => handleDraftChange(field.key, e.target.value)}
                      placeholder={field.example}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950/95 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all resize-none ${field.accentInput}`}
                    />

                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-400 italic">{field.example}</span>
                    </div>

                    {err && (
                      <p className="text-xs font-bold text-rose-300 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{err}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  playSFX('click');
                  stopCurrentAudio();
                  setStage('report');
                }}
                className="btn-game-slate btn-game-sm px-4 py-2.5 text-slate-200 font-game text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Kembali ke Laporan
              </button>

              <button
                type="submit"
                className="btn-game-gold px-6 py-3.5 rounded-2xl text-slate-950 font-game text-sm sm:text-base font-black tracking-wide flex items-center gap-2 shadow-[0_0_30px_rgba(250,204,21,0.45)] cursor-pointer ml-auto"
              >
                <Save className="w-5 h-5" />
                <span>SIMPAN HUJAH &amp; TERUSKAN KE MISI 5</span>
              </button>
            </div>
          </form>
        )}

        {/* ================================================================
            LANGKAH 4: ANIMASI PEMINDAHAN HOLOGRAM & TAHNIAH KE MISI 5
           ================================================================ */}
        {stage === 'transfer_success' && (
          <div className="w-full max-w-4xl rounded-3xl bg-slate-950/92 border-2 border-emerald-400/70 shadow-[0_0_60px_rgba(16,185,129,0.35)] backdrop-blur-xl p-6 sm:p-8 space-y-6 text-center my-auto">
            {transferPhase === 'sending' ? (
              <div className="py-10 space-y-6">
                <div className="flex items-center justify-center gap-4 sm:gap-8">
                  <div className="px-4 py-3 rounded-2xl bg-cyan-500/20 border border-cyan-400/70 text-cyan-200 font-game text-xs sm:text-sm font-black">
                    🎙️ MAKMAL SUARA
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                    <span className="w-12 sm:w-24 h-1.5 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 animate-pulse" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/70 text-emerald-200 font-game text-xs sm:text-sm font-black">
                    🚀 PUSAT OPERASI MISI 5
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="font-game text-xl sm:text-2xl font-black text-white">
                    MEMINDAHKAN DATA HUJAH HOLOGRAM...
                  </h2>
                  <p className="text-sm text-cyan-200">
                    Menyimpan Pendirian, Bukti Utama, Huraian &amp; Seruan ke Misi 5 secara automatik.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/70 text-amber-200 font-game text-xs sm:text-sm font-black shadow-lg">
                    <Award className="w-4 h-4 text-amber-300" />
                    <span>LENCANA BAHARU: EJEN PEMBINA HUJAH</span>
                  </div>

                  <h2 className="font-game text-2xl sm:text-3xl font-black text-emerald-300 tracking-wide">
                    MISI 4 SELESAI!
                  </h2>

                  <p className="text-sm sm:text-base text-slate-100 max-w-2xl mx-auto leading-relaxed font-medium">
                    {CONGRATS_MESSAGE}
                  </p>
                </div>

                {/* Summary Preview of Saved Arguments */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {ARGUMENT_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="rounded-2xl bg-slate-900/90 border border-emerald-400/40 p-3.5 space-y-1"
                    >
                      <div className="text-[11px] font-game font-black text-amber-300 uppercase flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          {field.numberLabel}. {field.title}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                        {draft[field.key]}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      playSFX('click');
                      handleCommitMission4('map');
                    }}
                    className="btn-game-slate px-5 py-3 rounded-2xl text-white font-game text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-cyan-300" />
                    <span>KEMBALI KE PETA MISI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playSFX('warp');
                      handleCommitMission4('next_mission');
                    }}
                    className="btn-game-emerald px-6 py-3.5 rounded-2xl text-slate-950 font-game text-sm sm:text-base font-black flex items-center gap-2 shadow-[0_0_30px_rgba(52,211,153,0.5)] cursor-pointer"
                  >
                    <span>TERUSKAN KE MISI 5</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
