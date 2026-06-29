import { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Square, Phone, Heart, BookOpen, Pill, Play, Mic, Loader2, MessageCircle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
  time: string;
};

type AppMode = 'idle' | 'scheduled' | 'push';

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export default function CompaneroVoz({ isBriefing = false }: { isBriefing?: boolean }) {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [hasSTT, setHasSTT] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [nextIn, setNextIn] = useState(0);
  const [history, setHistory] = useState<{ label: string; time: string }[]>([]);
  const [pushMessage, setPushMessage] = useState<{ label: string; message: string } | null>(null);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [mode, setMode] = useState<AppMode>('idle');
  const [transcript, setTranscript] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);
  const conversationRef = useRef<ConversationTurn[]>([]);
  const reminderContextRef = useRef<string>('');
  const modeRef = useRef<AppMode>('idle');
  const familyUserIdRef = useRef<string>('');
  const patientUserIdRef = useRef<string>('');
  const escalationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceCountRef = useRef(0);
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      setHasSTT(true);
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

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SPEAK' && event.data.text) {
        const text = event.data.text;
        setPushMessage({ label: 'Recordatorio', message: text });
        setMode('push');
        modeRef.current = 'push';
        setIsSpeaking(true);
        reminderContextRef.current = text;
        setTimeout(() => speak(text, () => {
          const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
          setHistory(prev => [{ label: 'Recordatorio', time: now }, ...prev].slice(0, 10));
          setIsSpeaking(false);
          if (hasSTT) {
            setTimeout(() => startListening(), 800);
          }
        }), 100);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      navigator.serviceWorker.ready.then(() => {
        navigator.serviceWorker.controller?.postMessage({ type: 'READY' });
      });
    }

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      stopListening();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [selectedVoiceURI, voices, hasSTT]);

  // === Morning Briefing ===
  const fetchMorningBriefing = useCallback(async () => {
    const now = new Date();
    const dayName = now.toLocaleDateString('es-SV', { weekday: 'long' });
    const dateStr = now.toLocaleDateString('es-SV', { day: 'numeric', month: 'long' });
    const timeStr = now.toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit' });

    // Fetch weather (Open-Meteo, no API key needed)
    let weatherText = '';
    try {
      const wRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.69&longitude=-89.19&current=temperature_2m,weather_code&timezone=America/El_Salvador');
      const wData = await wRes.json();
      const temp = Math.round(wData.current?.temperature_2m ?? 0);
      const code = wData.current?.weather_code ?? 0;
      const weatherMap: Record<number, string> = {
        0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
        45: 'con niebla', 48: 'con niebla', 51: 'con llovizna', 53: 'con llovizna', 55: 'con llovizna',
        61: 'con lluvia', 63: 'con lluvia', 65: 'con lluvia fuerte', 71: 'con nieve', 73: 'con nieve',
        75: 'con nieve', 80: 'con chubascos', 81: 'con chubascos', 82: 'con chubascos fuertes',
        95: 'con tormenta', 96: 'con tormenta', 99: 'con tormenta',
      };
      const desc = weatherMap[code] || 'con clima variable';
      weatherText = ` El clima está ${desc}, ${temp} grados.`;
      if (code >= 51 && code <= 65 || code >= 80 && code <= 82 || code >= 95) {
        weatherText += ' Mejor no salga sin paraguas.';
      }
    } catch { /* weather is optional */ }

    // Fetch today's reminders
    let agendaText = '';
    try {
      const { data: reminders } = await supabase
        .from('voice_reminders')
        .select('label, scheduled_time, is_morning_briefing')
        .eq('active', true);
      if (reminders && reminders.length > 0) {
        const todayDay = now.getDay();
        const todays = reminders.filter(r => {
          if (r.is_morning_briefing) return false;
          const time = r.scheduled_time?.slice(0, 5);
          const [h, m] = time.split(':').map(Number);
          const reminderMinutes = h * 60 + m;
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          return reminderMinutes >= nowMinutes;
        });
        if (todays.length > 0) {
          const items = todays.map(r => {
            const time = r.scheduled_time?.slice(0, 5);
            return `a las ${time}, ${r.label.toLowerCase()}`;
          }).join('; ');
          agendaText = ` Hoy le quedan ${todays.length} ${todays.length === 1 ? 'recordatorio' : 'recordatorios'}: ${items}.`;
        } else {
          agendaText = ' Ya no le quedan más recordatorios hoy.';
        }
      }
    } catch { /* agenda is optional */ }

    const greeting = `Buenos días. Hoy es ${dayName} ${dateStr}, son las ${timeStr}.${weatherText}${agendaText} Que tenga un bonito día.`;
    return greeting;
  }, [voices, selectedVoiceURI]);

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

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    stopListening();

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      if (interimTranscript) setTranscript(interimTranscript);
      if (finalTranscript) {
        silenceCountRef.current = 0;
        setTranscript(finalTranscript);
        handleUserMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.error('SpeechRecognition error:', event.error);
      setIsListening(false);
      if (event.error === 'no-speech') {
        silenceCountRef.current++;
        if (silenceCountRef.current >= 3) {
          // 3 silences in a row (~15s) — say goodbye and close
          silenceCountRef.current = 0;
          speak('Bueno, me despido. Aquí estaré cuando me necesites. ¡Hasta pronto!', () => {
            setConversation([]);
            conversationRef.current = [];
            setTranscript('');
            setMode('idle');
            modeRef.current = 'idle';
          });
          return;
        }
        setTimeout(() => {
          if ((modeRef.current === 'push' || modeRef.current === 'scheduled') && !isEscalatingRef.current) {
            startListening();
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isEscalating]);

  // Trigger morning briefing when opened via briefing push notification
  useEffect(() => {
    if (!isBriefing || !('speechSynthesis' in window)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = await fetchMorningBriefing();
      if (cancelled) return;
      setPushMessage({ label: 'Resumen del día', message: text });
      setMode('push');
      modeRef.current = 'push';
      setIsSpeaking(true);
      reminderContextRef.current = text;
      speak(text, () => {
        const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
        setHistory(prev => [{ label: 'Resumen del día', time: now }, ...prev].slice(0, 10));
        setIsSpeaking(false);
        if (hasSTT) {
          setTimeout(() => startListening(), 800);
        }
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isBriefing, fetchMorningBriefing, hasSTT, speak, startListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const isEscalatingRef = useRef(false);

  const checkEscalationResponse = useCallback(async () => {
    if (!familyUserIdRef.current) return;
    const { data } = await supabase
      .from('companero_messages')
      .select('id, message, context, status, created_at')
      .eq('family_user_id', familyUserIdRef.current)
      .eq('direction', 'family_to_patient')
      .eq('status', 'answered')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const response = data[0];
      // Mark as expired so we don't pick it up again
      await supabase.from('companero_messages').update({ status: 'expired' }).eq('id', response.id);
      if (escalationPollRef.current) {
        clearInterval(escalationPollRef.current);
        escalationPollRef.current = null;
      }
      setIsEscalating(false);
      isEscalatingRef.current = false;
      const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
      const familyTurn: ConversationTurn = { role: 'assistant', content: `Tu familia responde: ${response.message}`, time: now };
      const updatedConv = [...conversationRef.current, familyTurn];
      conversationRef.current = updatedConv;
      setConversation(updatedConv);
      speak(`Tu familia responde: ${response.message}`, () => {
        setTimeout(() => startListening(), 600);
      });
    }
  }, [speak, startListening]);

  const handleUserMessage = useCallback(async (userText: string) => {
    if (!userText) return;

    stopListening();
    setIsListening(false);
    setIsThinking(true);

    const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    const userTurn: ConversationTurn = { role: 'user', content: userText, time: now };
    const newConv = [...conversationRef.current, userTurn];
    conversationRef.current = newConv;
    setConversation(newConv);

    const lowerText = userText.toLowerCase();
    const farewellWords = ['gracias', 'ya está bien', 'ya estoy bien', 'adiós', 'adios', 'hasta luego', 'no más', 'ya'];
    const isFarewell = farewellWords.some(w => lowerText.includes(w)) && lowerText.length < 25;

    // Check if patient wants to repeat the last reminder
    const repeatWords = ['qué', 'que', 'repite', 'repetí', 'no entendí', 'no entendi', 'otra vez', 'cómo dijiste', 'como dijiste', 'qué dijiste', 'que dijiste', 'no escuché', 'no escuche', 'no oi', 'no oí'];
    const wantsRepeat = repeatWords.some(w => lowerText === w || lowerText === w + '?' || lowerText.startsWith(w + ' ')) && lowerText.length < 30;

    if (wantsRepeat && reminderContextRef.current) {
      const lastMsg = reminderContextRef.current;
      const repeatTurn: ConversationTurn = { role: 'assistant', content: lastMsg, time: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) };
      const updatedConv = [...conversationRef.current, repeatTurn];
      conversationRef.current = updatedConv;
      setConversation(updatedConv);
      setIsThinking(false);
      speak(lastMsg, () => { setTimeout(() => startListening(), 600); });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('companero-chat', {
        body: {
          message: userText,
          reminderContext: reminderContextRef.current,
          conversationHistory: conversationRef.current.slice(-8).map(t => ({ role: t.role, content: t.content })),
        },
      });

      if (error || (!data?.spoken && !data?.content)) {
        throw new Error(error?.message || 'Sin respuesta');
      }

      const responseType = data.type || 'chat';
      const spokenText = data.spoken || data.content || '';
      const aiTurn: ConversationTurn = { role: 'assistant', content: spokenText, time: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) };
      const updatedConv = [...conversationRef.current, aiTurn];
      conversationRef.current = updatedConv;
      setConversation(updatedConv);

      setIsThinking(false);

      if (responseType === 'escalate' && data.question) {
        // Send question to family via escalation edge function
        setIsEscalating(true);
        isEscalatingRef.current = true;
        speak(spokenText, async () => {
          try {
            // Get current user info
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              familyUserIdRef.current = user.id;
            }
            await supabase.functions.invoke('companero-escalate', {
              body: {
                family_user_id: familyUserIdRef.current,
                patient_user_id: patientUserIdRef.current,
                question: data.question,
                context: reminderContextRef.current,
              },
            });
            // Start polling for family response
            escalationPollRef.current = setInterval(() => {
              checkEscalationResponse();
            }, 5000);
          } catch (err) {
            console.error('escalation error:', err);
            setIsEscalating(false);
            isEscalatingRef.current = false;
            speak('No pude enviarle el mensaje a tu familia. Por favor, llámalos por teléfono.', () => {
              setTimeout(() => startListening(), 600);
            });
          }
        });
      } else if (responseType === 'family_request' && data.request) {
        // Send family request (non-medical) to family
        setIsEscalating(true);
        isEscalatingRef.current = true;
        speak(spokenText, async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              familyUserIdRef.current = user.id;
            }
            await supabase.functions.invoke('companero-escalate', {
              body: {
                family_user_id: familyUserIdRef.current,
                patient_user_id: patientUserIdRef.current,
                question: data.request,
                context: reminderContextRef.current,
              },
            });
            escalationPollRef.current = setInterval(() => {
              checkEscalationResponse();
            }, 5000);
          } catch (err) {
            console.error('family_request error:', err);
            setIsEscalating(false);
            isEscalatingRef.current = false;
          }
        });
      } else {
        // Normal chat response
        speak(spokenText, () => {
          if (isFarewell) {
            setConversation([]);
            conversationRef.current = [];
            setTranscript('');
            return;
          }
          setTimeout(() => startListening(), 600);
        });
      }
    } catch (err) {
      console.error('companero-chat error:', err);
      setIsThinking(false);
      const fallback = 'No te escuché bien, ¿puedes repetirlo?';
      const aiTurn: ConversationTurn = { role: 'assistant', content: fallback, time: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) };
      const updatedConv = [...conversationRef.current, aiTurn];
      conversationRef.current = updatedConv;
      setConversation(updatedConv);
      speak(fallback, () => {
        setTimeout(() => startListening(), 600);
      });
    }
  }, [speak, startListening, stopListening, checkEscalationResponse]);

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
      reminderContextRef.current = reminder.message;
      speak(reminder.message, () => {
        const now = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
        setHistory(prev => [{ label: reminder.label, time: now }, ...prev].slice(0, 10));
        if (hasSTT && startIdx < FAKE_SCHEDULE.length - 1) {
          setTimeout(() => startListening(), 800);
        } else {
          runSchedule(startIdx + 1);
        }
      });
    }, reminder.delaySec * 1000);
  }, [speak, startListening, hasSTT]);

  const handleStart = () => {
    setIsActive(true);
    setMode('scheduled');
    modeRef.current = 'scheduled';
    setHistory([]);
    setConversation([]);
    conversationRef.current = [];
    runSchedule(0);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    stopListening();
    setIsSpeaking(false);
    setIsListening(false);
    setIsThinking(false);
    setIsEscalating(false);
    isEscalatingRef.current = false;
    if (escalationPollRef.current) {
      clearInterval(escalationPollRef.current);
      escalationPollRef.current = null;
    }
    setIsActive(false);
    setMode('idle');
    modeRef.current = 'idle';
    setCurrentIdx(-1);
    setNextIn(0);
    setConversation([]);
    conversationRef.current = [];
    setTranscript('');
    setPushMessage(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    silenceCountRef.current = 0;
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
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

  // Push mode — received a message from SW, speaking it + conversation
  if (pushMessage && mode === 'push') {
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
          ) : isEscalating ? (
            <>
              <div className="w-40 h-40 rounded-full bg-rose-600/80 flex items-center justify-center shadow-2xl">
                <Send className="h-20 w-20 text-white animate-pulse" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-white text-lg font-bold">Preguntando a tu familia</p>
                <p className="text-rose-300 text-sm">Esperando su respuesta...</p>
              </div>
            </>
          ) : isThinking ? (
            <>
              <div className="w-40 h-40 rounded-full bg-amber-600/80 flex items-center justify-center shadow-2xl">
                <Loader2 className="h-20 w-20 text-white animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-white text-lg font-bold">Pensando...</p>
                <p className="text-amber-300 text-sm">Un momento</p>
              </div>
            </>
          ) : isListening ? (
            <>
              <div className="w-40 h-40 rounded-full bg-emerald-600 scale-110 animate-pulse flex items-center justify-center shadow-2xl">
                <Mic className="h-20 w-20 text-white" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-white text-lg font-bold">Te escucho</p>
                <p className="text-emerald-300 text-sm">Habla ahora...</p>
              </div>
              {transcript && (
                <div className="bg-white/10 rounded-2xl px-4 py-3 max-w-sm">
                  <p className="text-slate-200 text-sm italic">"{transcript}"</p>
                </div>
              )}
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

          {(isSpeaking || isListening || isThinking || isEscalating) && (
            <button
              onClick={handleStop}
              className="bg-rose-600/80 hover:bg-rose-600 text-white font-bold px-8 py-3 rounded-full transition flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Square className="h-5 w-5 fill-white" />
              Detener
            </button>
          )}
        </div>

        <div className="w-full max-w-md space-y-2 pb-4">
          {conversation.length > 0 && (
            <div className="space-y-2 mb-3">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                Conversación
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {conversation.map((turn, idx) => (
                  <div
                    key={idx}
                    className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                        turn.role === 'user'
                          ? 'bg-emerald-600/30 border border-emerald-500/30'
                          : 'bg-indigo-600/30 border border-indigo-500/30'
                      }`}
                    >
                      <p className={`text-xs leading-relaxed ${
                        turn.role === 'user' ? 'text-emerald-100' : 'text-indigo-100'
                      }`}>
                        {turn.content}
                      </p>
                      <p className="text-slate-500 text-[9px] mt-0.5">{turn.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            {hasSTT && (
              <p className="text-emerald-400/70 text-xs max-w-xs mx-auto leading-relaxed pt-1">
                Puedes responder con tu voz después de cada mensaje.
              </p>
            )}
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
        ) : isEscalating ? (
          <>
            <div className="w-40 h-40 rounded-full bg-rose-600/80 flex items-center justify-center shadow-2xl">
              <Send className="h-20 w-20 text-white animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-white text-lg font-bold">Preguntando a tu familia</p>
              <p className="text-rose-300 text-sm">Esperando su respuesta...</p>
            </div>
          </>
        ) : isThinking ? (
          <>
            <div className="w-40 h-40 rounded-full bg-amber-600/80 flex items-center justify-center shadow-2xl">
              <Loader2 className="h-20 w-20 text-white animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-white text-lg font-bold">Pensando...</p>
              <p className="text-amber-300 text-sm">Un momento</p>
            </div>
          </>
        ) : isListening ? (
          <>
            <div className="w-40 h-40 rounded-full bg-emerald-600 scale-110 animate-pulse flex items-center justify-center shadow-2xl">
              <Mic className="h-20 w-20 text-white" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-white text-lg font-bold">Te escucho</p>
              <p className="text-emerald-300 text-sm">Habla ahora...</p>
            </div>
            {transcript && (
              <div className="bg-white/10 rounded-2xl px-4 py-3 max-w-sm">
                <p className="text-slate-200 text-sm italic">"{transcript}"</p>
              </div>
            )}
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
        {conversation.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Conversación
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {conversation.map((turn, idx) => (
                <div
                  key={idx}
                  className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                      turn.role === 'user'
                        ? 'bg-emerald-600/30 border border-emerald-500/30'
                        : 'bg-indigo-600/30 border border-indigo-500/30'
                    }`}
                  >
                    <p className={`text-xs leading-relaxed ${
                      turn.role === 'user' ? 'text-emerald-100' : 'text-indigo-100'
                    }`}>
                      {turn.content}
                    </p>
                    <p className="text-slate-500 text-[9px] mt-0.5">{turn.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
