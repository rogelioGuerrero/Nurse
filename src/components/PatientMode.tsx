import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type OrbState = 'idle' | 'speaking' | 'listening' | 'thinking';

interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export default function PatientMode({ familyUserId }: { familyUserId: string }) {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [isSupported, setIsSupported] = useState(true);
  const [hasSTT, setHasSTT] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [subtitle, setSubtitle] = useState<string>('');
  const [isEscalating, setIsEscalating] = useState(false);

  const recognitionRef = useRef<any>(null);
  const modeRef = useRef<OrbState>('idle');
  const isEscalatingRef = useRef(false);
  const silenceCountRef = useRef(0);
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderContextRef = useRef<string>('');
  const conversationRef = useRef<ConversationTurn[]>([]);
  const finalTranscriptRef = useRef<string>('');

  // === Voices ===
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionClass) setHasSTT(true);

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      const spanishVoice = available.find(v => v.lang.startsWith('es'));
      if (spanishVoice && !selectedVoiceURI) setSelectedVoiceURI(spanishVoice.voiceURI);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      window.speechSynthesis.cancel();
    };
  }, []);

  // === Push subscription for this device ===
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const vapidRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push/vapid-key`);
          if (vapidRes.ok) {
            const { publicKey } = await vapidRes.json();
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
            });
          }
        }
        if (sub) {
          await supabase.from('push_subscriptions').upsert({
            user_id: familyUserId,
            endpoint: sub.endpoint,
            p256dh_key: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
            auth_key: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
          }, { onConflict: 'endpoint' });
        }
      } catch (e) { console.error('Push subscription failed:', e); }
    })();
  }, [familyUserId]);

  // === Heartbeat to track patient activity ===
  const sendHeartbeat = useCallback((interactionType: string = 'heartbeat') => {
    supabase.from('patient_activity').upsert({
      family_user_id: familyUserId,
      last_seen_at: new Date().toISOString(),
      last_interaction_type: interactionType,
    }, { onConflict: 'family_user_id' }).then(({ error }) => {
      if (error) console.error('Heartbeat error:', error);
    });
  }, [familyUserId]);

  useEffect(() => {
    sendHeartbeat('app_opened');
    const interval = setInterval(() => sendHeartbeat('heartbeat'), 5 * 60 * 1000);
    const handleVisibility = () => { if (!document.hidden) sendHeartbeat('app_visible'); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sendHeartbeat]);

  // === SW message handler (auto-play push) ===
  useEffect(() => {
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SPEAK' && event.data.text) {
        const text = event.data.text;
        setSubtitle(text);
        reminderContextRef.current = text;
        setOrbState('speaking');
        modeRef.current = 'speaking';
        setTimeout(() => speak(text, () => {
          setOrbState('idle');
          modeRef.current = 'idle';
          setSubtitle('');
          if (hasSTT) setTimeout(() => startListening(), 600);
        }), 100);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    }
  }, [hasSTT, voices, selectedVoiceURI]);

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  }

  // === Speak ===
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.onstart = () => { setOrbState('speaking'); modeRef.current = 'speaking'; };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };
    window.speechSynthesis.speak(utterance);
  }, [voices, selectedVoiceURI]);

  // === Chat with Groq ===
  const chatWithGroq = useCallback(async (userText: string): Promise<{ type: string; spoken: string; question?: string }> => {
    const history = conversationRef.current.slice(-6).map(t => ({ role: t.role, content: t.text }));
    const { data, error } = await supabase.functions.invoke('companero-chat', {
      body: {
        message: userText,
        reminderContext: reminderContextRef.current || undefined,
        conversationHistory: history,
      },
    });
    if (error) throw error;
    return data as { type: string; spoken: string; question?: string };
  }, []);

  // === Escalate ===
  const escalate = useCallback(async (question: string) => {
    isEscalatingRef.current = true;
    setIsEscalating(true);
    try {
      await supabase.functions.invoke('companero-escalate', {
        body: { family_user_id: familyUserId, question },
      });
    } catch (e) { console.error('Escalate error:', e); }
    isEscalatingRef.current = false;
    setIsEscalating(false);
  }, [familyUserId]);

  // === Listening ===
  const startListening = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch {}
    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => { setOrbState('listening'); modeRef.current = 'listening'; };
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (interim) setSubtitle(interim);
      if (final) {
        finalTranscriptRef.current = final;
        setSubtitle(final);
        silenceCountRef.current = 0;
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        silenceCountRef.current++;
        if (silenceCountRef.current >= 3) {
          silenceCountRef.current = 0;
          speak('Bueno, me despido. Aquí estaré cuando me necesites. ¡Hasta pronto!', () => {
            setConversation([]);
            conversationRef.current = [];
            setOrbState('idle');
            modeRef.current = 'idle';
            setSubtitle('');
          });
          return;
        }
        setTimeout(() => {
          if ((modeRef.current === 'listening' || modeRef.current === 'speaking') && !isEscalatingRef.current) {
            startListening();
          }
        }, 500);
      }
    };
    recognition.onend = () => {
      const finalText = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = '';
      if (finalText && !isEscalatingRef.current) {
        setOrbState('thinking');
        modeRef.current = 'thinking';
        setConversation(prev => { const next = [...prev, { role: 'user' as const, text: finalText }]; conversationRef.current = next; return next; });
        chatWithGroq(finalText).then(async (result) => {
          setConversation(prev => { const next = [...prev, { role: 'assistant' as const, text: result.spoken }]; conversationRef.current = next; return next; });
          setSubtitle(result.spoken);
          if (result.type === 'escalate' && result.question) {
            await escalate(result.question);
          }
          speak(result.spoken, () => {
            setOrbState('idle');
            modeRef.current = 'idle';
            setSubtitle('');
          });
        }).catch(() => {
          speak('Disculpa, no te entendí bien. ¿Puedes repetirlo?', () => {
            setOrbState('idle');
            modeRef.current = 'idle';
            setSubtitle('');
          });
        });
      } else if (modeRef.current === 'listening') {
        setOrbState('idle');
        modeRef.current = 'idle';
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [chatWithGroq, escalate, speak]);

  // === Tap orb to talk ===
  const handleOrbTap = useCallback(() => {
    sendHeartbeat('tap');
    if (orbState === 'speaking') {
      window.speechSynthesis.cancel();
      setOrbState('idle');
      modeRef.current = 'idle';
      setSubtitle('');
      return;
    }
    if (orbState === 'listening' || orbState === 'thinking') return;
    if (hasSTT) {
      silenceCountRef.current = 0;
      startListening();
    }
  }, [orbState, hasSTT, startListening, sendHeartbeat]);

  // === Emergency button ===
  const handleEmergency = useCallback(() => {
    sendHeartbeat('emergency');
    setSubtitle('Avisando a tu familia...');
    setOrbState('speaking');
    modeRef.current = 'speaking';
    escalate('BOTÓN DE EMERGENCIA: El paciente presionó el botón "No me siento bien". Por favor llamarlo o visitarlo lo antes posible.');
    speak('Avisé a tu familia que no te sientes bien. Ya van a llamarte. Si fue un error, no pasa nada.', () => {
      setOrbState('idle');
      modeRef.current = 'idle';
      setSubtitle('');
    });
  }, [escalate, speak, sendHeartbeat]);

  // === Cleanup ===
  useEffect(() => {
    return () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!isSupported) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-8">
        <p className="text-white text-center text-lg">Tu navegador no soporta voz. Intenta con Chrome.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-between overflow-hidden touch-none">
      {/* Top: subtle label */}
      <div className="pt-12 text-center">
        <p className="text-indigo-300/40 text-xs font-medium tracking-widest uppercase">BienCuidar</p>
      </div>

      {/* Center: Orb */}
      <div className="flex-1 flex items-center justify-center w-full">
        <button
          onClick={handleOrbTap}
          className="relative flex items-center justify-center cursor-pointer focus:outline-none"
          aria-label="Tocar para hablar"
        >
          {/* Outer glow rings */}
          {orbState === 'speaking' && (
            <>
              <span className="absolute w-64 h-64 rounded-full bg-indigo-500/20 animate-ping" />
              <span className="absolute w-48 h-48 rounded-full bg-indigo-400/30 animate-pulse" />
            </>
          )}
          {orbState === 'listening' && (
            <>
              <span className="absolute w-56 h-56 rounded-full bg-amber-400/15 animate-ping" style={{ animationDuration: '1.5s' }} />
              <span className="absolute w-40 h-40 rounded-full bg-amber-300/20 animate-pulse" />
            </>
          )}
          {orbState === 'thinking' && (
            <span className="absolute w-48 h-48 rounded-full bg-violet-400/20 animate-pulse" style={{ animationDuration: '0.8s' }} />
          )}

          {/* Main orb */}
          <div
            className={`relative w-36 h-36 rounded-full transition-all duration-500 ${
              orbState === 'speaking'
                ? 'bg-gradient-to-br from-indigo-400 to-indigo-600 scale-110 shadow-2xl shadow-indigo-500/50'
                : orbState === 'listening'
                ? 'bg-gradient-to-br from-amber-300 to-amber-500 scale-105 shadow-2xl shadow-amber-400/40'
                : orbState === 'thinking'
                ? 'bg-gradient-to-br from-violet-400 to-violet-600 scale-100 shadow-2xl shadow-violet-500/40'
                : 'bg-gradient-to-br from-indigo-300 to-indigo-500 scale-100 shadow-xl shadow-indigo-500/30'
            }`}
            style={{
              animation: orbState === 'idle' ? 'gentle-pulse 3s ease-in-out infinite' : undefined,
            }}
          >
            {/* Inner shimmer */}
            <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-white/10 to-white/30 backdrop-blur-sm" />

            {/* Animated bars when speaking/listening */}
            {(orbState === 'speaking' || orbState === 'listening') && (
              <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <span
                    key={i}
                    className={`w-1.5 rounded-full bg-white/70 ${orbState === 'speaking' ? 'animate-bounce' : 'animate-pulse'}`}
                    style={{
                      height: orbState === 'speaking'
                        ? `${20 + Math.random() * 30}px`
                        : `${15 + Math.random() * 25}px`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: `${300 + Math.random() * 200}ms`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Thinking spinner */}
            {orbState === 'thinking' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
              </div>
            )}

            {/* Idle: heart icon */}
            {orbState === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-10 h-10 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Bottom: emergency button + subtitle + hint */}
      <div className="pb-16 px-8 w-full max-w-md text-center min-h-[120px] flex flex-col justify-end items-center">
        {subtitle ? (
          <p className="text-white/80 text-base font-medium leading-relaxed mb-3">{subtitle}</p>
        ) : (
          <p className="text-white/30 text-sm mb-3">
            {orbState === 'idle' && (hasSTT ? 'Toca para hablar' : 'Esperando mensajes...')}
            {orbState === 'speaking' && 'Toca para silenciar'}
            {orbState === 'listening' && 'Escuchando...'}
            {orbState === 'thinking' && 'Pensando...'}
          </p>
        )}
        {isEscalating && (
          <p className="text-amber-300/60 text-xs mb-3">Enviando pregunta a tu familia...</p>
        )}
        <button
          onClick={handleEmergency}
          className="mt-2 flex items-center gap-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-sm font-bold px-6 py-3 rounded-full transition-all shadow-lg shadow-rose-600/30"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007M5.25 6.75h13.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H5.25a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 012.25-2.25z" />
          </svg>
          No me siento bien
        </button>
      </div>

      <style>{`
        @keyframes gentle-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
