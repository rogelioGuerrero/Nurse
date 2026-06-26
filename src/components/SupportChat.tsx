import { useState, useRef, useEffect, type FC } from 'react';
import { MessageCircle, X, Send, Loader2, Mail } from 'lucide-react';
import { supabaseUrl, supabaseAnonKey, supabase } from '../lib/supabase';
import { openSupport } from '../lib/support';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const NURSE_PROMPT = `Sos el asistente de BienCuidar. Plataforma que conecta familias con enfermeras en El Salvador.

Información disponible:

BienCuidar es intermediación tecnológica. No es empleador. La relación es directa entre familia y enfermera.
Sitio: https://biencuidar.agtisa.com

Registro:
- Requisito: CSSP vigente.
- Se verifica automáticamente en cssp.gob.sv.
- Si hay problemas, recibís correo con instrucciones.
- Corregí tu CSSP en "Mi Perfil".

Pago (por turno):
- Tarifa la definís vos.
- Pago directo: la familia te paga. BienCuidar no interviene.
- Pago con factura: comisión US$ 5 + IVA 13% sobre comisión. Retención ISR 10%.

Cancelación:
- Sin costo hasta 24h antes.
- Menos de 24h: 50% del turno (solo con factura).

Reglas:
1. Respondé solo con esta información.
2. Breve y directa. Máximo 3 oraciones.
3. Si no sabés la respuesta, decí: "No tengo esa información. Escribinos a info@agtisa.com".
4. No menciones IA ni tecnología.
5. No des consejos médicos.

FAQ:
- ¿Es agencia? No. Plataforma. Sos independiente.
- ¿Necesito CSSP? Sí, obligatorio. Lo verificamos.
- ¿Cuánto cobro? Vos definís tu tarifa por turno.
- ¿Pago para registrarme? No. Gratis. Comisión solo con factura.
- ¿Obligada a aceptar? No. Decidís cuáles aceptar.
- ¿Cobrar sin factura? Sí, se puede.
- ¿Dónde funciona? Todo El Salvador.
- ¿Cómo me contactan? Todo dentro de la plataforma. Datos de contacto solo después de aceptar.`;

const FAMILY_PROMPT = `Sos el asistente de BienCuidar. Plataforma que conecta familias con enfermeras en El Salvador.

Información disponible:

BienCuidar es intermediación tecnológica. No es empleador. La relación es directa entre familia y enfermera.
Sitio: https://biencuidar.agtisa.com

Verificación:
- Cada enfermera tiene CSSP verificado en cssp.gob.sv.
- Solo enfermeras verificadas aparecen en la plataforma.

Cómo funciona:
- Publicás la necesidad (condición, fechas, ubicación). Gratis.
- Las enfermeras verificadas te envían ofertas con tarifa.
- Ves perfil, especialidad, experiencia, calificaciones.
- Elegís la oferta. Nadie te impone enfermera.
- Si no te gusta, rechazás todo y publicás de nuevo.
- Datos de contacto solo con la enfermera que aceptes.

Pago:
- Tarifa la define cada enfermera.
- Pago directo: pagás a la enfermera. Sin intermediación.
- Pago con factura: BienCuidar retiene. Comisión US$ 5 por turno.
- Publicar es gratis.

Cancelación:
- Sin costo hasta 24h antes.
- Menos de 24h: 50% del turno (solo con factura).

Tipos de cuidado:
- Geriatría, postoperatorio, paliativos, heridas, sondaje, acompañamiento.
- Cualquier cuidado de salud en casa.

Reglas:
1. Respondé solo con esta información.
2. Breve y directa. Máximo 3 oraciones.
3. Si no sabés, decí: "No tengo esa información. Escribinos a info@agtisa.com".
4. No menciones IA ni tecnología.
5. No des consejos médicos.

FAQ:
- ¿Qué es? Plataforma que conecta familias con enfermeras verificadas.
- ¿Verificadas? Sí, CSSP verificado.
- ¿Cuánto cuesta? Tarifa por enfermera. Ves precio antes de aceptar.
- ¿Pagar para publicar? No. Gratis.
- ¿Cómo funciona? Publicás, recibís ofertas, elegís.
- ¿Ver perfil antes? Sí. Especialidad, experiencia, calificaciones.
- ¿Si no me gusta? Rechazás todo, sin compromiso.
- ¿Cómo pago? Directo o con factura.
- ¿Cancelar? Sin costo hasta 24h antes.
- ¿Datos seguros? Solo se comparten con la enfermera que aceptes.
- ¿Responsabilidad? La enfermera. BienCuidar es intermediación.
- ¿Si no llega? Coordinás directo con la enfermera. Escribinos a info@agtisa.com si necesitás mediación.`;

const VISITOR_PROMPT = `Sos el asistente de BienCuidar. Plataforma que conecta familias con enfermeras en El Salvador.

Información disponible:

BienCuidar es intermediación tecnológica. No es empleador. Relación directa entre familia y enfermera.
Sitio: https://biencuidar.agtisa.com

Para familias:
- Publicás necesidad de cuidado. Gratis.
- Enfermeras verificadas envían ofertas. Elegís.
- Tarifa por enfermera. Ves precio antes de aceptar.
- Pago directo o con factura.
- Cancelación sin costo hasta 24h antes.

Para enfermeras:
- Necesitás CSSP vigente. Se verifica en cssp.gob.sv.
- Registro gratis. Definís tu tarifa.
- Aceptás lo que quieras. Sin obligación.
- Cobrás directo o con factura.

Reglas:
1. Respondé solo con esta información.
2. Breve y directa. Máximo 3 oraciones.
3. Si no sabés, decí: "No tengo esa información. Escribinos a info@agtisa.com".
4. No menciones IA ni tecnología.
5. No des consejos médicos.`;

function getSystemPrompt(role: string): string {
  if (role === 'family') return FAMILY_PROMPT;
  if (role === 'visitor') return VISITOR_PROMPT;
  return NURSE_PROMPT;
}

export const SupportChat: FC<{ userRole?: string }> = ({ userRole = 'nurse' }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: userRole === 'nurse'
        ? 'Hola. Soy el asistente de BienCuidar. Puedo ayudarte con dudas sobre tu registro, CSSP, pagos y turnos. ¿Qué necesitas?'
        : userRole === 'visitor'
        ? 'Hola. Soy el asistente de BienCuidar. Puedo ayudarte con dudas sobre cómo funciona la plataforma, requisitos para enfermeras, pagos y más. ¿Qué necesitas?'
        : 'Hola. Soy el asistente de BienCuidar. Puedo ayudarte con dudas sobre cómo buscar enfermeras, verificación, pagos y cancelaciones. ¿Qué necesitas?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const userMessagesRef = useRef<Array<{ role: string; content: string }>>([]);
  const sessionLoggedRef = useRef(false);

  const createSession = async () => {
    if (sessionIdRef.current) return;
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_role: userRole, message_count: 0 })
        .select('id')
        .single();
      if (!error && data) {
        sessionIdRef.current = data.id;
      }
    } catch {
      // Silent fail — tracking is non-critical
    }
  };

  const closeAndSummarize = async () => {
    if (sessionLoggedRef.current || !sessionIdRef.current) return;
    sessionLoggedRef.current = true;

    const allMessages = [
      ...userMessagesRef.current,
      ...messages.filter(m => m.role === 'assistant').map(m => ({ role: m.role, content: m.content })),
    ];

    if (allMessages.length === 0) return;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      let summary = 'Sesión cerrada';
      let topics: string[] = [];
      let resolved = false;

      if (response.ok) {
        const data = await response.json();
        summary = data.summary || summary;
        topics = data.topics || [];
        resolved = data.resolved ?? false;
      }

      await supabase
        .from('chat_sessions')
        .update({
          summary,
          topics,
          resolved,
          message_count: userMessagesRef.current.length,
          closed_at: new Date().toISOString(),
        })
        .eq('id', sessionIdRef.current);
    } catch {
      // Silent fail
    }
  };

  useEffect(() => {
    return () => {
      closeAndSummarize();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    if (!sessionIdRef.current) {
      createSession();
    }

    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setShowEmailFallback(false);

    userMessagesRef.current.push({ role: 'user', content: userMessage });

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
            { role: 'system', content: getSystemPrompt(userRole) },
            ...newMessages.filter(m => m.role === 'user').map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.3,
          maxTokens: 300,
        }),
      });

      if (!response.ok) throw new Error('Error en el servicio');

      const data = await response.json();
      const assistantReply = data.content || 'No pude procesar tu consulta. Escribinos a info@agtisa.com.';

      // Check if the bot suggests email
      if (assistantReply.toLowerCase().includes('info@agtisa.com') || assistantReply.toLowerCase().includes('no tengo esa')) {
        setShowEmailFallback(true);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: assistantReply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Tuvimos un problema técnico. Escribinos a info@agtisa.com y te ayudamos.',
      }]);
      setShowEmailFallback(true);
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
        onClick={() => { setOpen(true); createSession(); }}
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
          onClick={() => { closeAndSummarize(); setOpen(false); }}
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

        {showEmailFallback && (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => openSupport(userRole === 'nurse' ? 'Hola, soy enfermera en BienCuidar y necesito ayuda' : 'Hola, necesito ayuda con BienCuidar')}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition cursor-pointer"
            >
              <Mail className="h-4 w-4" />
              Escribir a info@agtisa.com
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
