import { useState, useRef, useEffect, type FC } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { openSupport } from '../lib/support';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Eres el asistente de soporte de BienCuidar, plataforma de intermediación tecnológica que conecta familias con enfermeras independientes en El Salvador.

INFORMACIÓN QUE PUEDES USAR (solo esta, no inventes nada más):

SOBRE BIENCUIDAR:
- BienCuidar es una plataforma tecnológica de intermediación. No es empleador, ni empresa de servicios de salud, ni agencia de enfermería.
- La relación contractual es directamente entre la familia y la enfermera.
- BienCuidar no se responsabiliza por diagnósticos, tratamientos o eventualidades médicas.
- URL oficial: https://biencuidar.agtisa.com

REGISTRO DE ENFERMERAS:
- Requisitos: número de registro CSSP vigente, DUI, antecedentes penales, tarjeta de vacunación.
- El número CSSP se verifica automáticamente en el portal cssp.gob.sv.
- Si tu CSSP tiene problemas, recibirás un correo con instrucciones para corregirlo.
- Puedes corregir tu número CSSP en "Mi Perfil" dentro de la plataforma.

PAGO (POR TURNO, no por hora):
- Las tarifas las define la enfermera según su especialidad.
- Tarifas de referencia por turno: Cuidado general US$ 20, Geriatría US$ 25, Postoperatorio US$ 30, Cuidados Paliativos US$ 35.
- Dos modalidades de pago:
  1. Pago directo: la familia paga directamente a la enfermera (efectivo o transferencia). BienCuidar no interviene.
  2. Pago con factura: BienCuidar actúa como agente de retención. Comisión de US$ 5 por turno + IVA 13% (solo sobre la comisión). Retención de ISR 10% (Art. 156 Código Tributario).
- El servicio de salud está exento de IVA (Art. 46 LIVA).

CANCELACIÓN:
- Sin costo hasta 24 horas antes del turno.
- Menos de 24 horas: cargo del 50% del turno (solo aplica con modalidad de factura).

VERIFICACIÓN CSSP:
- BienCuidar verifica el número CSSP en el portal oficial cssp.gob.sv.
- Si el número no se encuentra, pertenece a otra persona, o la profesión no coincide, se notifica por correo.
- Tres recordatorios antes de desactivar la cuenta: a las 72 horas, a los 7 días, y último aviso con 48 horas antes de desactivar.

REGLAS DE RESPUESTA:
1. Responde SOLO con la información anterior. No inventes datos.
2. Sé breve, clara y directa. Máximo 3-4 oraciones.
3. Usa "tú", no "usted".
4. Si te preguntan algo que no está en esta información, di: "Esa información no la tengo disponible. Te recomiendo contactarnos por WhatsApp" y sugiere usar el botón de WhatsApp.
5. No menciones tecnología, IA, modelos de lenguaje, ni procesos internos de la plataforma.
6. No des consejos médicos ni clínicos.
7. Toda oración debe empezar con mayúscula.

PREGUNTAS FRECUENTES (usa estas respuestas como base):
- ¿BienCuidar es una agencia de enfermería? No. Somos una plataforma que conecta enfermeras con familias. Tú eres independiente, decides tus turnos y tu tarifa.
- ¿Necesito tener CSSP? Sí. El registro CSSP es obligatorio por ley. Nosotros lo verificamos para que las familias confíen en ti.
- ¿Cuánto cobro por mi servicio? Tú defines tu tarifa por turno. Nosotros no te decimos cuánto cobrar.
- ¿Tengo que pagar para registrarme? No. El registro es gratis. BienCuidar cobra una pequeña comisión por gestión solo cuando hay factura.
- ¿Estoy obligada a aceptar solicitudes? No. Ves las solicitudes en la app y decides cuáles aceptar. Puedes rechazar todas si no te convienen.
- ¿Puedo cobrar directo sin factura? Sí. Si prefieres cobrar directo a la familia, también se puede. La factura y FSEE son opcionales.
- ¿Qué pasa si ya tengo trabajo? Perfecto. BienCuidar es para complementar tus ingresos. Aceptas turnos solo cuando tengas tiempo libre.
- ¿En qué parte de El Salvador funciona? En todo el país. Las familias publican solicitudes con su ubicación y tú decides si te queda cerca.
- ¿Cómo me contactan las familias? Todo se hace dentro de la plataforma de BienCuidar. Las familias publican solicitudes de cuidado y a ti te llegan en la bandeja de la app. Ves los detalles del paciente, horarios y ubicación, y decides si aceptas o rechazas. No necesitas dar tu número a nadie directamente — solo después de aceptar una solicitud se comparte la información de contacto para la visita.
- ¿Tengo que dar mi número de teléfono? No directamente. Toda la coordinación inicial se hace dentro de la plataforma de BienCuidar. Solo después de que aceptes una solicitud de cuidado se comparten los datos de contacto entre la familia y tú para coordinar la visita.
- ¿Hay plazas disponibles? No manejamos "plazas" como un empleo tradicional. Las familias publican solicitudes de cuidado cuando las necesitan, y tú decides cuáles aceptar. No hay límite de cupo para registrarte.
- ¿Los hombres pueden registrarse? Sí. BienCuidar está abierto a todos los profesionales de enfermería registrados ante el CSSP, sin importar género.`;

export const SupportChat: FC<{ userRole?: string }> = ({ userRole = 'nurse' }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: userRole === 'nurse'
        ? 'Hola. Soy el asistente de BienCuidar. Puedo ayudarte con dudas sobre tu registro, CSSP, pagos y turnos. ¿Qué necesitas?'
        : userRole === 'visitor'
        ? 'Hola. Soy el asistente de BienCuidar. Puedo ayudarte con dudas sobre cómo funciona la plataforma, requisitos para enfermeras, pagos y más. ¿Qué necesitas?'
        : 'Hola. Soy el asistente de BienCuidar. Puedo ayudarte con dudas sobre cómo funciona la plataforma, pagos y contratos. ¿Qué necesitas?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setShowWhatsApp(false);

    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...newMessages.filter(m => m.role === 'user').map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.3,
          maxTokens: 300,
        }),
      });

      if (!response.ok) throw new Error('Error en el servicio');

      const data = await response.json();
      const assistantReply = data.content || 'Lo siento, no pude procesar tu consulta. Escríbenos por WhatsApp.';

      // Check if the bot suggests WhatsApp
      if (assistantReply.toLowerCase().includes('whatsapp') || assistantReply.toLowerCase().includes('no la tengo')) {
        setShowWhatsApp(true);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: assistantReply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Tuvimos un problema técnico. Por favor escríbenos por WhatsApp y te ayudaremos directamente.',
      }]);
      setShowWhatsApp(true);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`fixed ${userRole === 'visitor' ? 'bottom-5 right-5 w-14 h-14' : 'bottom-20 right-4 w-12 h-12'} bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition z-40 cursor-pointer`}
        aria-label="Soporte BienCuidar"
      >
        <MessageCircle className={`${userRole === 'visitor' ? 'h-7 w-7' : 'h-6 w-6'} text-white`} />
      </button>
    );
  }

  return (
    <div className={`fixed ${userRole === 'visitor' ? 'bottom-5 right-5' : 'bottom-20 right-4'} z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 w-[calc(100vw-2rem)] max-w-sm h-[60vh] max-h-[500px]`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 rounded-t-2xl shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Soporte BienCuidar</p>
            <p className="text-[10px] text-indigo-200">En línea</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-slate-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3 py-2.5">
              <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
            </div>
          </div>
        )}

        {showWhatsApp && (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => openSupport(userRole === 'nurse' ? 'Hola, soy enfermera en BienCuidar y necesito ayuda' : 'Hola, necesito ayuda con BienCuidar')}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-500 hover:bg-green-600 px-4 py-2 rounded-xl transition cursor-pointer"
            >
              <MessageCircle className="h-4 w-4" />
              Hablar por WhatsApp
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-100 bg-white rounded-b-2xl shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu duda..."
            rows={1}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs resize-none focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 max-h-20"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-9 h-9 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white rounded-xl flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
