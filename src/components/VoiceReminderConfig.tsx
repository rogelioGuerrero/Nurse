import { useState, useEffect, useCallback } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { useToast } from './Toast';
import { Plus, Trash2, Send, Bell, Clock, Volume2, MessageCircle, AlertCircle, Check, X, Smartphone, Copy } from 'lucide-react';

interface VoiceReminder {
  id: string;
  type: string;
  label: string;
  message: string;
  scheduled_time: string;
  days_of_week: number[];
  active: boolean;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function VoiceReminderConfig() {
  const { currentUser } = useApp();
  const { showToast } = useToast();
  const [reminders, setReminders] = useState<VoiceReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<any[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const [newReminder, setNewReminder] = useState({
    label: '',
    message: '',
    scheduled_time: '08:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6] as number[],
    is_morning_briefing: false as boolean,
  });

  const patientLink = currentUser
    ? `${window.location.origin}/?patient=${btoa(currentUser.id)}`
    : '';

  const loadReminders = useCallback(async () => {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from('voice_reminders')
      .select('*')
      .eq('family_user_id', currentUser.id)
      .order('scheduled_time', { ascending: true });
    if (error) {
      console.error('Error loading reminders:', error);
      return;
    }
    setReminders(data || []);
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  // Load pending questions from the patient
  const loadPendingQuestions = useCallback(async () => {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from('companero_messages')
      .select('*')
      .eq('family_user_id', currentUser.id)
      .eq('direction', 'patient_to_family')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setPendingQuestions(data);
    }
  }, [currentUser]);

  useEffect(() => {
    loadPendingQuestions();
    const interval = setInterval(() => loadPendingQuestions(), 5000);
    return () => clearInterval(interval);
  }, [loadPendingQuestions]);

  const handleReply = async (questionId: string) => {
    const text = replyText[questionId]?.trim();
    if (!text || !currentUser) return;
    setSendingReply(questionId);
    try {
      // Insert family response
      const { error: insertError } = await supabase.from('companero_messages').insert({
        family_user_id: currentUser.id,
        direction: 'family_to_patient',
        message: text,
        context: 'Respuesta a pregunta del adulto mayor',
        status: 'answered',
      });
      if (insertError) throw insertError;

      // Mark original question as answered
      await supabase.from('companero_messages').update({ status: 'answered', responded_at: new Date().toISOString() }).eq('id', questionId);

      showToast('Respuesta enviada. Se leerá en voz alta.', 'success');
      setReplyText(prev => ({ ...prev, [questionId]: '' }));
      loadPendingQuestions();
    } catch (err) {
      console.error('Reply error:', err);
      showToast('Error al enviar respuesta', 'error');
    } finally {
      setSendingReply(null);
    }
  };

  const handleSuggest = async () => {
    if (!newReminder.message.trim()) {
      showToast('Escribe un mensaje primero', 'error');
      return;
    }
    setSuggesting(true);
    setSuggestion(null);
    setShowSuggestion(true);
    try {
      const { data, error } = await supabase.functions.invoke('companero-chat', {
        body: {
          message: `SUGERENCIA: El familiar escribió este recordatorio para un adulto mayor: "${newReminder.message}". Analiza si es claro o ambiguo. Si falta detalle (color de pastilla, dosis, tamaño, nombre del medicamento, instrucciones específicas), sugiere una versión mejorada más clara y específica. Si ya está bien, di "El mensaje está claro". Responde solo en español, máximo 2 frases de análisis + la versión sugerida si aplica.`,
          reminderContext: 'Modo sugerencia de mejora de recordatorio',
        },
      });
      if (error || (!data?.spoken && !data?.content)) {
        throw new Error(error?.message || 'Sin respuesta');
      }
      const text = data.spoken || data.content || '';
      const isClear = text.toLowerCase().includes('está claro') || text.toLowerCase().includes('esta claro');
      setSuggestion(isClear ? null : text);
    } catch (err) {
      console.error('Suggestion error:', err);
      showToast('No pude analizar el mensaje', 'error');
      setShowSuggestion(false);
    } finally {
      setSuggesting(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (suggestion) {
      const suggestionMatch = suggestion.match(/versión[:\s]*["«"]?(.+?)["»"]?$/i);
      const improvedText = suggestionMatch ? suggestionMatch[1].trim() : suggestion.split('\n').pop()?.trim() || suggestion;
      setNewReminder(prev => ({ ...prev, message: improvedText }));
      showToast('Mensaje actualizado', 'success');
    }
    setSuggestion(null);
    setShowSuggestion(false);
  };

  const handleCreate = async () => {
    if (!currentUser) return;
    if (!newReminder.is_morning_briefing && (!newReminder.label.trim() || !newReminder.message.trim())) {
      showToast('Completa el título y el mensaje', 'error');
      return;
    }
    if (newReminder.is_morning_briefing && !newReminder.scheduled_time) {
      showToast('Selecciona la hora del briefing', 'error');
      return;
    }

    const { error } = await supabase.from('voice_reminders').insert({
      family_user_id: currentUser.id,
      type: 'general',
      label: newReminder.is_morning_briefing ? 'Resumen del día' : newReminder.label.trim(),
      message: newReminder.is_morning_briefing ? 'Briefing matutino' : newReminder.message.trim(),
      scheduled_time: newReminder.scheduled_time + ':00',
      days_of_week: newReminder.days_of_week,
      is_morning_briefing: newReminder.is_morning_briefing,
      active: true,
    });

    if (error) {
      showToast('Error al crear recordatorio', 'error');
      return;
    }

    showToast('Recordatorio creado', 'success');
    setNewReminder({
      label: '',
      message: '',
      scheduled_time: '08:00',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      is_morning_briefing: false,
    });
    loadReminders();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('voice_reminders').delete().eq('id', id);
    if (error) {
      showToast('Error al eliminar', 'error');
      return;
    }
    setReminders(prev => prev.filter(r => r.id !== id));
    showToast('Recordatorio eliminado', 'success');
  };

  const handleToggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from('voice_reminders').update({ active: !active }).eq('id', id);
    if (error) {
      showToast('Error al actualizar', 'error');
      return;
    }
    setReminders(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r));
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/check-voice-reminders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'test', reminder_id: id }),
      });
      const data = await res.json();
      if (data.sent > 0) {
        showToast('Push enviado. Revisa tu teléfono.', 'success');
      } else {
        showToast('No hay suscripción push activa para este usuario', 'error');
      }
    } catch {
      showToast('Error al enviar push de prueba', 'error');
    } finally {
      setTesting(null);
    }
  };

  const toggleDay = (day: number) => {
    setNewReminder(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    return `${h}:${m}`;
  };

  return (
    <div className="space-y-6 animate-fade-in" id="voice-reminder-config">

      <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-md">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-indigo-600/35 border border-indigo-500/30 px-3.5 py-1.5 rounded-full text-indigo-200 font-bold tracking-wider text-[10px] uppercase">
            <Bell className="h-3.5 w-3.5" />
            Compañero de Voz
          </div>
          <h2 className="text-3xl font-bold font-serif italic">Recordatorios Auditivos</h2>
          <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">
            Configura mensajes que el teléfono de tu ser querido leerá en voz alta. Toca "Probar" para enviar un push a tu dispositivo y escuchar cómo sonará.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Plus className="h-5 w-5 text-indigo-500" />
          <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Nuevo Recordatorio</h4>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Morning Briefing Toggle */}
          <label className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newReminder.is_morning_briefing}
              onChange={(e) => setNewReminder(prev => ({ ...prev, is_morning_briefing: e.target.checked, label: e.target.checked ? 'Resumen del día' : '', message: e.target.checked ? '' : prev.message }))}
              className="w-4 h-4 rounded accent-amber-600"
            />
            <div>
              <p className="text-xs font-bold text-amber-800">Resumen matutino</p>
              <p className="text-[10px] text-amber-600">Al tocar la notificación, se leerá la hora, el clima y los recordatorios pendientes del día.</p>
            </div>
          </label>

          {!newReminder.is_morning_briefing && (
          <>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Título</label>
            <input
              type="text"
              value={newReminder.label}
              onChange={(e) => setNewReminder(prev => ({ ...prev, label: e.target.value }))}
              placeholder="Ej: Medicina para la presión"
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 transition outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Mensaje (se leerá en voz alta)</label>
              <button
                onClick={handleSuggest}
                disabled={suggesting || !newReminder.message.trim()}
                className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer disabled:opacity-40"
              >
                {suggesting ? (
                  <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                Verificar claridad
              </button>
            </div>
            <textarea
              rows={3}
              value={newReminder.message}
              onChange={(e) => setNewReminder(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Ej: Doña María, es la hora de su medicina para la presión. Tome una tableta con un vaso de agua."
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 transition outline-none resize-none leading-relaxed"
            />
            {showSuggestion && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                {suggesting ? (
                  <p className="text-xs text-indigo-600 font-medium">Verificando mensaje...</p>
                ) : suggestion ? (
                  <>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-700 leading-relaxed">{suggestion}</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleAcceptSuggestion}
                        className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <Check className="h-3 w-3" />
                        Usar versión mejorada
                      </button>
                      <button
                        onClick={() => { setShowSuggestion(false); setSuggestion(null); }}
                        className="flex items-center gap-1 bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                        Ignorar
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    <p className="text-xs text-emerald-700 font-medium">El mensaje está claro. No necesita mejoras.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" /> Hora
              </label>
              <input
                type="time"
                value={newReminder.scheduled_time}
                onChange={(e) => setNewReminder(prev => ({ ...prev, scheduled_time: e.target.value }))}
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 transition outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Días</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={`w-9 h-9 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      newReminder.days_of_week.includes(idx)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleCreate}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus className="h-4 w-4" />
            {newReminder.is_morning_briefing ? 'Activar Resumen Matutino' : 'Crear Recordatorio'}
          </button>
        </div>
      </div>

      {/* Pending questions from the patient */}
      {pendingQuestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <MessageCircle className="h-4 w-4 text-rose-500" />
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-rose-600">
              Preguntas de tu ser querido ({pendingQuestions.length})
            </h4>
          </div>
          {pendingQuestions.map((q) => (
            <div key={q.id} className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-4 w-4 text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 font-medium leading-relaxed">{q.message}</p>
                  {q.context && (
                    <p className="text-[10px] text-slate-400 mt-1 italic">Contexto: {q.context}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(q.created_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyText[q.id] || ''}
                  onChange={(e) => setReplyText(prev => ({ ...prev, [q.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !sendingReply) handleReply(q.id); }}
                  placeholder="Escribe tu respuesta..."
                  className="flex-1 text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 focus:border-rose-500 transition outline-none"
                />
                <button
                  onClick={() => handleReply(q.id)}
                  disabled={sendingReply === q.id || !replyText[q.id]?.trim()}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {sendingReply === q.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Responder
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Tu respuesta se leerá en voz alta en el teléfono de tu ser querido.
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 px-1">
          Recordatorios configurados ({reminders.length})
        </h4>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reminders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-medium">No hay recordatorios configurados aún.</p>
          </div>
        ) : (
          reminders.map((reminder) => {
            return (
              <div
                key={reminder.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm transition ${
                  reminder.active ? 'border-slate-200' : 'border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-indigo-50 text-indigo-600">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h5 className="font-bold text-slate-800 text-sm truncate">{reminder.label}</h5>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                          {formatTime(reminder.scheduled_time)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{reminder.message}</p>
                      <div className="flex items-center gap-1 pt-0.5">
                        {reminder.days_of_week.map(d => (
                          <span key={d} className="text-[9px] font-bold text-slate-400">{DAYS[d][0]}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleTest(reminder.id)}
                    disabled={testing === reminder.id}
                    className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {testing === reminder.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Probar
                  </button>
                  <button
                    onClick={() => handleToggle(reminder.id, reminder.active)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                    style={{
                      backgroundColor: reminder.active ? '#fef3c7' : '#f1f5f9',
                      color: reminder.active ? '#92400e' : '#64748b',
                    }}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    {reminder.active ? 'Activo' : 'Pausado'}
                  </button>
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Patient Mode */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200/40 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
          <Smartphone className="h-5 w-5 text-indigo-600" />
          <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Modo Paciente</h4>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Abre este link en el teléfono de tu ser querido y déjalo ahí. Verá una pantalla simple con un solo botón para hablar. Los recordatorios se reproducirán automáticamente al llegar, sin necesidad de tocar notificaciones.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border border-indigo-200 rounded-xl px-3 py-2.5 text-xs text-slate-600 font-mono truncate">
            {patientLink}
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(patientLink); showToast('Link copiado', 'success'); }}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition cursor-pointer shrink-0"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </button>
        </div>
        <div className="flex items-center gap-3 bg-white/60 border border-indigo-100 rounded-xl p-3">
          <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center border border-slate-200 shrink-0 overflow-hidden">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(patientLink)}`}
              alt="QR Modo Paciente"
              className="w-full h-full"
            />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-700">Escanea este código</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Abre la cámara del teléfono de tu ser querido y apunta al código QR para abrir el Modo Paciente directamente.</p>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50/70 border border-indigo-200/30 rounded-2xl p-4 space-y-2 text-[11px] text-indigo-900 leading-normal font-medium">
        <div className="flex items-center gap-1.5 font-bold text-indigo-950 uppercase tracking-wider text-[10px]">
          <Volume2 className="h-4 w-4 text-indigo-600" />
          <span>Cómo funciona</span>
        </div>
        <p>
          1. Creas el recordatorio con el mensaje que quieres que tu ser querido escuche.<br/>
          2. Toca "Probar" para enviarlo a tu teléfono ahora mismo.<br/>
          3. El sistema envía el recordatorio automáticamente a la hora programada.<br/>
          4. Tu ser querido recibe la notificación y el teléfono lee el mensaje en voz alta.
        </p>
      </div>
    </div>
  );
}
