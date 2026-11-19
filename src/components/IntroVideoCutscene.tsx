import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FastForward, ShieldAlert, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { setMusicState } from '../utils/sound';

interface IntroVideoCutsceneProps {
  onComplete: () => void;
}

interface TimedCaption {
  start: number;
  end: number;
  badge: string;
  headline: string;
  subtext: string;
  tone: 'danger' | 'cyan' | 'emerald' | 'gold';
}

const TIMED_CAPTIONS: TimedCaption[] = [
  {
    start: 0,
    end: 4.8,
    badge: 'ISYARAT KECEMASAN · SEKTOR MALAYSIA 01',
    headline: 'AMARAN! BUMI DALAM BAHAYA!',
    subtext: 'Asap kilang beracun dan sisa kimia sungai telah melepasi paras kritikal!',
    tone: 'danger',
  },
  {
    start: 4.8,
    end: 10.0,
    badge: 'PUSAT KAWALAN ECOWORLD · TAKLIMAT EJEN',
    headline: 'SUARA GENERASI PRIHATIN DIPERLUKAN!',
    subtext: 'Radar mengesan krisis alam sekitar. Ejen muda mesti bertindak sekarang!',
    tone: 'cyan',
  },
  {
    start: 10.0,
    end: 19.5,
    badge: 'MISI PEMULIHAN 3D DIAKTIFKAN',
    headline: 'SIASAT BUKTI & PULIHKAN SUNGAI!',
    subtext: 'Kumpul bukti tersembunyi, analisis punca pencemaran dan bina hujah kritis anda.',
    tone: 'emerald',
  },
  {
    start: 19.5,
    end: 35.0,
    badge: 'HARAPAN MASA DEPAN BUMI',
    headline: 'JADILAH WIRA ECOWORLD!',
    subtext: 'Bersama kita selamatkan Malaysia & suarakan perubahan untuk generasi akan datang!',
    tone: 'gold',
  },
];

export function IntroVideoCutscene({ onComplete }: IntroVideoCutsceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [muted, setMuted] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Duck background synth music while intro video plays so video audio & SFX remain clear
  useEffect(() => {
    setMusicState({ ducked: true });
    return () => {
      setMusicState({ ducked: false });
    };
  }, []);

  const activeCaption =
    TIMED_CAPTIONS.find((c) => currentTime >= c.start && currentTime < c.end) ||
    TIMED_CAPTIONS[TIMED_CAPTIONS.length - 1];

  const toneClasses = {
    danger: {
      box: 'bg-rose-950/88 border-rose-500 text-rose-100',
      badge: 'text-rose-300',
      title: 'text-rose-200 drop-shadow-[0_2px_10px_rgba(244,63,94,0.85)]',
      bar: 'bg-rose-500',
    },
    cyan: {
      box: 'bg-slate-950/88 border-sky-400 text-sky-100',
      badge: 'text-sky-300',
      title: 'game-subtitle-neon text-sky-200',
      bar: 'bg-sky-400',
    },
    emerald: {
      box: 'bg-emerald-950/88 border-emerald-400 text-emerald-100',
      badge: 'text-emerald-300',
      title: 'game-title-emerald',
      bar: 'bg-emerald-400',
    },
    gold: {
      box: 'bg-slate-950/90 border-amber-400 text-amber-100',
      badge: 'text-amber-300',
      title: 'game-title-gold',
      bar: 'bg-amber-400',
    },
  }[activeCaption.tone];

  const progressPct = Math.min(100, Math.round((currentTime / Math.max(1, duration)) * 100));

  const finishCutscene = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setMusicState({ ducked: false });
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black flex items-center justify-center overflow-hidden select-none">
      {/* 16:9 Cinema Frame */}
      <div className="relative w-[min(100vw,177.78vh)] h-[min(100vh,56.25vw)] bg-slate-950 overflow-hidden">
        {!videoError ? (
          <video
            ref={videoRef}
            src="/assets/aistudio/eco-world-mission-control-30s_d955c627.webm"
            autoPlay
            playsInline
            muted={muted}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (e.currentTarget.duration) setDuration(e.currentTarget.duration);
            }}
            onEnded={finishCutscene}
            onError={() => setVideoError(true)}
            className="w-full h-full object-contain block"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center bg-gradient-to-br from-rose-950 via-slate-950 to-emerald-950">
            <AlertTriangle className="w-14 h-14 text-rose-400" />
            <h2 className="font-game text-2xl sm:text-4xl font-black text-rose-200">
              AMARAN! BUMI DALAM BAHAYA!
            </h2>
            <p className="text-sm text-slate-300 max-w-md">
              Video taklimat tidak dapat dimuatkan. Klik butang di bawah untuk terus ke Portal Akses EcoWorld.
            </p>
            <button
              type="button"
              onClick={finishCutscene}
              className="btn-game-emerald font-game px-8 py-3 rounded-2xl text-slate-950 font-black flex items-center gap-2.5 cursor-pointer"
            >
              <span className="btn-icon-3d w-7 h-7 text-sm">🚀</span>
              <span>TERUSKAN KE PORTAL AKSES →</span>
            </button>
          </div>
        )}

        {/* Top Bar: Alert Status Badge & Audio/Skip Controls */}
        <div className="absolute top-3 inset-x-4 flex items-center justify-between gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/85 border border-rose-500/60 flex items-center gap-2 text-xs font-game text-rose-300 shadow-lg">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>TAKLIMAT MISI ECOWORLD</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (videoRef.current) videoRef.current.muted = next;
              }}
              className="btn-game-slate btn-game-sm px-3 py-1.5 text-xs font-bold text-slate-100 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="btn-icon-3d w-5 h-5">
                {muted ? <VolumeX className="w-3 h-3 text-slate-300" /> : <Volume2 className="w-3 h-3 text-emerald-300" />}
              </span>
              <span className="hidden sm:inline">{muted ? 'Suara Video: Tutup' : 'Suara Video: Buka'}</span>
            </button>

            <button
              type="button"
              onClick={finishCutscene}
              className="btn-game-gold btn-game-sm px-4 py-1.5 text-slate-950 font-game text-xs font-black flex items-center gap-2 cursor-pointer"
            >
              <span>LANGKAU / MASUK PORTAL</span>
              <span className="btn-icon-3d w-5 h-5">
                <FastForward className="w-3 h-3" />
              </span>
            </button>
          </div>
        </div>

        {/* Synchronized Dramatic Story Caption Overlay */}
        <div className="absolute bottom-6 inset-x-4 sm:inset-x-10 flex flex-col items-center gap-2.5 pointer-events-none">
          <div
            className={`w-full max-w-3xl rounded-2xl border-2 px-5 py-3.5 text-center shadow-2xl transition-all duration-300 ${toneClasses.box}`}
          >
            <div className={`font-game text-[11px] sm:text-xs font-bold tracking-widest uppercase flex items-center justify-center gap-1.5 ${toneClasses.badge}`}>
              {activeCaption.tone === 'danger' ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{activeCaption.badge}</span>
            </div>
            <h2 className={`font-game text-lg sm:text-3xl font-black mt-1 tracking-wide ${toneClasses.title}`}>
              {activeCaption.headline}
            </h2>
            <p className="text-xs sm:text-sm font-medium text-slate-100 mt-1">
              {activeCaption.subtext}
            </p>
          </div>

          {/* Sleek Video Timeline Bar */}
          <div className="w-full max-w-3xl h-1.5 rounded-full bg-slate-900/90 border border-slate-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${toneClasses.bar}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
