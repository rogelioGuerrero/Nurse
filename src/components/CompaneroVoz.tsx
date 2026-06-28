import { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Square, RefreshCw, Phone } from 'lucide-react';

export default function CompaneroVoz() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [lastMessage, setLastMessage] = useState<string>('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [selectedVoiceURI]);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window) || !text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    setLastMessage(text);
    window.speechSynthesis.speak(utterance);
  }, [voices, selectedVoiceURI]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const testMessages = [
    'Hola, soy tu compañero de BienCuidar. Estoy aquí para ayudarte.',
    'Es la hora de tomar tu medicina. Por favor, toma tu medicamento ahora.',
    'Recuerda tomar agua. Es importante mantenerte hidratado.',
    'Tu enfermera llegará pronto. Por favor, espera en casa.',
  ];

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex flex-col items-center justify-between p-6 safe-area-pb">

      {/* Header minimalista */}
      <div className="text-center pt-4">
        <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 px-4 py-2 rounded-full">
          <Phone className="h-5 w-5 text-indigo-300" />
          <span className="text-indigo-200 font-bold text-sm">BienCuidar</span>
        </div>
        <p className="text-slate-400 text-xs mt-2">Compañero de Voz</p>
      </div>

      {/* Botón principal - grande, claro */}
      <div className="flex flex-col items-center gap-6">
        <button
          onClick={() => isSpeaking ? stopSpeaking() : speak(testMessages[0])}
          className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
            isSpeaking
              ? 'bg-rose-600 scale-110 animate-pulse'
              : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105 active:scale-95'
          }`}
        >
          {isSpeaking ? (
            <Square className="h-16 w-16 text-white fill-white" />
          ) : (
            <Volume2 className="h-16 w-16 text-white" />
          )}
        </button>
        <p className="text-white text-lg font-bold">
          {isSpeaking ? 'Tocar para detener' : 'Tocar para escuchar'}
        </p>
      </div>

      {/* Mensajes rápidos - botones grandes */}
      <div className="w-full max-w-md space-y-3 pb-4">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider text-center mb-3">
          Mensajes de prueba
        </p>
        {testMessages.map((msg, idx) => (
          <button
            key={idx}
            onClick={() => speak(msg)}
            disabled={isSpeaking}
            className="w-full bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/10 rounded-2xl p-4 text-left transition cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <Volume2 className="h-6 w-6 text-indigo-300 shrink-0" />
              <span className="text-white text-sm font-medium leading-snug">{msg}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Selector de voz - colapsable, para configuración */}
      {voices.length > 0 && (
        <details className="w-full max-w-md pb-4">
          <summary className="text-slate-500 text-xs font-bold cursor-pointer hover:text-slate-300 transition flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            Configurar voz
          </summary>
          <div className="mt-3 space-y-2">
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
            <p className="text-slate-500 text-[10px]">
              Si no hay voces en español, tu teléfono usará la voz por defecto.
            </p>
          </div>
        </details>
      )}

      {/* Último mensaje reproducido */}
      {lastMessage && !isSpeaking && (
        <div className="w-full max-w-md bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-4 mb-4">
          <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-wider mb-1">Último mensaje</p>
          <p className="text-slate-300 text-sm leading-relaxed">{lastMessage}</p>
        </div>
      )}
    </div>
  );
}
