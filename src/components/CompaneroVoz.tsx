import { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Square, Phone, Heart, BookOpen, Pill, Play } from 'lucide-react';

type ReminderType = 'medicine' | 'story' | 'motivation';

interface FakeReminder {
  type: ReminderType;
  icon: typeof Heart;
  label: string;
  message: string;
  delaySec: number;
}

const FAKE_SCHEDULE: FakeReminder[] = [
  {
    type: 'medicine',
    icon: Pill,
    label: 'Recordatorio de medicina',
    message: 'Doña María, es la hora de su medicina para la presión. Por favor, tome una tableta de losartán con un vaso de agua. Recuerde que es importante tomarla a la misma hora todos los días.',
    delaySec: 3,
  },
  {
    type: 'story',
    icon: BookOpen,
    label: 'Cuento corto',
    message: 'Voy a contarle un cuento breve, doña María. Había una vez una tortuga que vivía junto a un río cristalino. Todos los días caminaba despacio, pero nunca se rendía. Un día, una liebre se burló de ella por ser tan lenta. La tortuga le dijo: ¿Queremos apostar una carrera? La liebre, riendo, aceptó. Cuando empezó la carrera, la liebre corría tan rápido que decidió dormir un rato bajo un árbol. Pero la tortuga, paso a paso, sin detenerse, llegó primero a la meta. Moraleja: el que persevera, alcanza.',
    delaySec: 15,
  },
  {
    type: 'motivation',
    icon: Heart,
    label: 'Mensaje de su familia',
    message: 'Su hija Rosita le envía un mensaje: Mamá, te amo mucho. Gracias por todo lo que has hecho por nosotros. Eres la mejor mamá del mundo. Pronto voy a visitarte. Un beso enorme.',
    delaySec: 15,
  },
];

export default function CompaneroVoz() {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [nextIn, setNextIn] = useState(0);
  const [history, setHistory] = useState<{ label: string; time: string }[]>([]);
  const [pushMessage, setPushMessage] = useState<{ label: string; message: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      const spanishVoice = available.find(v => v.lang.startsWith('es'));
      if (spanishVoice && !selectedVoiceURI) {
        setSelectedVoiceURI(spanishVoice.voiceURI);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Listen for SPEAK messages from Service Worker (push notifications)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SPEAK' && event.data.text) {
        const text = event.data.text;
        setPushMessage({ label: 'Recordatorio', message: text });
        setIsSpeaking(true);
        // Small delay to ensure voices are loaded and UI updates
        setTimeout(() => speak(text, () => {
          const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
          setHistory(prev => [{ label: 'Recordatorio', time: now }, ...prev].slice(0, 10));
        }), 100);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      // Tell SW we're ready to receive pending speak text
      navigator.serviceWorker.ready.then(reg => {
        navigator.serviceWorker.controller?.postMessage({ type: 'READY' });
      });
    }

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [selectedVoiceURI, voices]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window) || !text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }, [voices, selectedVoiceURI]);

  const runSchedule = useCallback((startIdx: number) => {
    if (startIdx >= FAKE_SCHEDULE.length) {
      setIsActive(false);
      setCurrentIdx(-1);
      return;
    }

    const reminder = FAKE_SCHEDULE[startIdx];
    setCurrentIdx(startIdx);
    setNextIn(reminder.delaySec);

    let remaining = reminder.delaySec;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setNextIn(remaining);
      if (remaining <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    }, 1000);

    timeoutRef.current = setTimeout(() => {
      speak(reminder.message, () => {
        const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
        setHistory(prev => [{ label: reminder.label, time: now }, ...prev].slice(0, 10));
        runSchedule(startIdx + 1);
      });
    }, reminder.delaySec * 1000);
  }, [speak]);

  const handleStart = () => {
    setIsActive(true);
    setHistory([]);
    runSchedule(0);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsActive(false);
    setCurrentIdx(-1);
    setNextIn(0);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  if (!isSupported) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-rose-600 rounded-full flex items-center justify-center mx-auto">
            <Volume2 className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">No compatible</h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Tu navegador no soporta síntesis de voz. Intenta con Chrome o Edge actualizado.
          </p>
        </div>
      </div>
    );
  }

  // Push mode — received a message from SW, speaking it
  if (pushMessage && !isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex flex-col items-center justify-between p-6 safe-area-pb">
        <div className="text-center pt-4 w-full max-w-md">
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 px-4 py-2 rounded-full">
            <Phone className="h-5 w-5 text-indigo-300" />
            <span className="text-indigo-200 font-bold text-sm">BienCuidar · Compañero activo</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 w-full max-w-md">
          {isSpeaking ? (
            <>
              <div className="w-40 h-40 rounded-full bg-indigo-600 scale-110 animate-pulse flex items-center justify-center shadow-2xl">
                <Volume2 className="h-20 w-20 text-white" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-white text-lg font-bold">{pushMessage.label}</p>
                <p className="text-indigo-300 text-sm">Hablando...</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-32 h-32 rounded-full bg-emerald-600/30 border-2 border-emerald-500/40 flex items-center justify-center shadow-lg">
                <Volume2 className="h-16 w-16 text-emerald-300" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-white text-base font-bold">Mensaje completado</p>
                <p className="text-slate-400 text-sm">Esperando el siguiente recordatorio...</p>
              </div>
            </>
          )}

          {isSpeaking && (
            <button
              onClick={() => {
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
              }}
              className="bg-rose-600/80 hover:bg-rose-600 text-white font-bold px-8 py-3 rounded-full transition flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Square className="h-5 w-5 fill-white" />
              Detener
            </button>
          )}
        </div>

        <div className="w-full max-w-md space-y-2 pb-4">
          {pushMessage && (
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-4 mb-2">
              <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-wider mb-1">Mensaje recibido</p>
              <p className="text-slate-300 text-sm leading-relaxed">{pushMessage.message}</p>
            </div>
          )}
          {history.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Historial</p>
              {history.map((h, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5">
                  <Volume2 className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span className="text-slate-300 text-xs font-medium flex-1">{h.label}</span>
                  <span className="text-slate-500 text-[10px]">{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6 safe-area-pb">
        <div className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 px-4 py-2 rounded-full">
            <Phone className="h-5 w-5 text-indigo-300" />
            <span className="text-indigo-200 font-bold text-sm">BienCuidar</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white font-serif italic">Compañero de Voz</h1>
            <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
              Toca el botón para iniciar. Tu teléfono te acompañará durante el día.
            </p>
          </div>

          <button
            onClick={handleStart}
            className="w-48 h-48 rounded-full bg-indigo-600 hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all duration-300 shadow-2xl flex flex-col items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="h-20 w-20 text-white fill-white" />
            <span className="text-white font-bold text-lg">Iniciar</span>
          </button>

          {history.length > 0 && (
            <div className="w-full max-w-sm space-y-2 pt-4">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Última sesión</p>
              {history.slice(0, 4).map((h, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2">
                  <span className="text-slate-300 text-xs font-medium">{h.label}</span>
                  <span className="text-slate-500 text-[10px]">{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentReminder = currentIdx >= 0 ? FAKE_SCHEDULE[currentIdx] : null;
  const CurrentIcon = currentReminder?.icon || Volume2;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex flex-col items-center justify-between p-6 safe-area-pb">

      <div className="text-center pt-4 w-full max-w-md">
        <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 px-4 py-2 rounded-full">
          <Phone className="h-5 w-5 text-indigo-300" />
          <span className="text-indigo-200 font-bold text-sm">BienCuidar · Compañero activo</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {isSpeaking ? (
          <>
            <div className="w-40 h-40 rounded-full bg-indigo-600 scale-110 animate-pulse flex items-center justify-center shadow-2xl">
              <CurrentIcon className="h-20 w-20 text-white" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-white text-lg font-bold">{currentReminder?.label}</p>
              <p className="text-indigo-300 text-sm">Hablando...</p>
            </div>
          </>
        ) : currentReminder ? (
          <>
            <div className="w-32 h-32 rounded-full bg-slate-700/50 border-2 border-indigo-500/30 flex items-center justify-center shadow-lg">
              <CurrentIcon className="h-16 w-16 text-indigo-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-white text-base font-bold">{currentReminder.label}</p>
              <p className="text-slate-400 text-sm">
                {nextIn > 0 ? `En ${nextIn} segundos...` : 'Preparando...'}
              </p>
            </div>
          </>
        ) : (
          <div className="w-32 h-32 rounded-full bg-slate-700/50 flex items-center justify-center">
            <Volume2 className="h-16 w-16 text-slate-500" />
          </div>
        )}

        <button
          onClick={handleStop}
          className="bg-rose-600/80 hover:bg-rose-600 text-white font-bold px-8 py-3 rounded-full transition flex items-center gap-2 cursor-pointer shadow-lg"
        >
          <Square className="h-5 w-5 fill-white" />
          Detener
        </button>
      </div>

      <div className="w-full max-w-md space-y-2 pb-4">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider text-center mb-2">
          Mensajes de hoy ({history.length})
        </p>
        {history.length === 0 ? (
          <p className="text-slate-600 text-xs text-center">Aún no se han reproducido mensajes</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {history.map((h, idx) => {
              const reminder = FAKE_SCHEDULE.find(r => r.label === h.label);
              const Icon = reminder?.icon || Volume2;
              return (
                <div key={idx} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5">
                  <Icon className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span className="text-slate-300 text-xs font-medium flex-1">{h.label}</span>
                  <span className="text-slate-500 text-[10px]">{h.time}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {voices.length > 0 && (
        <details className="w-full max-w-md pb-4">
          <summary className="text-slate-500 text-xs font-bold cursor-pointer hover:text-slate-300 transition">
            Configurar voz
          </summary>
          <div className="mt-3">
            <select
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full bg-slate-800 text-white text-sm border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-indigo-500"
            >
              {voices
                .filter(v => v.lang.startsWith('es'))
                .map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              {voices.filter(v => v.lang.startsWith('es')).length === 0 &&
                voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))
              }
            </select>
          </div>
        </details>
      )}
    </div>
  );
}
