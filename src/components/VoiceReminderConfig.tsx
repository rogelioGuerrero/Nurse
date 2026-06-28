import { useState, useEffect, useCallback } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { useToast } from './Toast';
import { Pill, BookOpen, Heart, Plus, Trash2, Send, Bell, Clock, Volume2 } from 'lucide-react';

interface VoiceReminder {
  id: string;
  type: string;
  label: string;
  message: string;
  scheduled_time: string;
  days_of_week: number[];
  active: boolean;
}

const TYPE_ICONS: Record<string, typeof Pill> = {
  medicine: Pill,
  story: BookOpen,
  motivation: Heart,
};

const TYPE_LABELS: Record<string, string> = {
  medicine: 'Salud',
  story: 'Compañía',
  motivation: 'Familia',
};

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function VoiceReminderConfig() {
  const { currentUser } = useApp();
  const { showToast } = useToast();
  const [reminders, setReminders] = useState<VoiceReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);

  const [newReminder, setNewReminder] = useState({
    type: 'medicine' as string,
    label: '',
    message: '',
    scheduled_time: '09:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6] as number[],
  });

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

  const handleCreate = async () => {
    if (!currentUser) return;
    if (!newReminder.label.trim() || !newReminder.message.trim()) {
      showToast('Completa el título y el mensaje', 'error');
      return;
    }

    const { error } = await supabase.from('voice_reminders').insert({
      family_user_id: currentUser.id,
      type: newReminder.type,
      label: newReminder.label.trim(),
      message: newReminder.message.trim(),
      scheduled_time: newReminder.scheduled_time + ':00',
      days_of_week: newReminder.days_of_week,
      active: true,
    });

    if (error) {
      showToast('Error al crear recordatorio', 'error');
      return;
    }

    showToast('Recordatorio creado', 'success');
    setNewReminder({
      type: 'medicine',
      label: '',
      message: '',
      scheduled_time: '09:00',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
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
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Tipo</label>
            <div className="flex gap-2">
              {Object.entries(TYPE_LABELS).map(([value, label]) => {
                const Icon = TYPE_ICONS[value];
                return (
                  <button
                    key={value}
                    onClick={() => setNewReminder(prev => ({ ...prev, type: value }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      newReminder.type === value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Mensaje (se leerá en voz alta)</label>
            <textarea
              rows={3}
              value={newReminder.message}
              onChange={(e) => setNewReminder(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Ej: Doña María, es la hora de su medicina para la presión. Tome una tableta con un vaso de agua."
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 transition outline-none resize-none leading-relaxed"
            />
          </div>

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
            Crear Recordatorio
          </button>
        </div>
      </div>

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
            const Icon = TYPE_ICONS[reminder.type] || Bell;
            return (
              <div
                key={reminder.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm transition ${
                  reminder.active ? 'border-slate-200' : 'border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      reminder.type === 'medicine' ? 'bg-rose-50 text-rose-600' :
                      reminder.type === 'story' ? 'bg-amber-50 text-amber-600' :
                      'bg-emerald-50 text-emerald-600'
                    }`}>
                      <Icon className="h-5 w-5" />
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

      <div className="bg-indigo-50/70 border border-indigo-200/30 rounded-2xl p-4 space-y-2 text-[11px] text-indigo-900 leading-normal font-medium">
        <div className="flex items-center gap-1.5 font-bold text-indigo-950 uppercase tracking-wider text-[10px]">
          <Volume2 className="h-4 w-4 text-indigo-600" />
          <span>Cómo funciona</span>
        </div>
        <p>
          1. Creas el recordatorio con el mensaje que quieres que tu ser querido escuche.<br/>
          2. Toca "Probar" para enviarlo a tu teléfono ahora mismo.<br/>
          3. En producción, el sistema envía el push automáticamente a la hora programada.<br/>
          4. Tu ser querido toca la notificación y el teléfono lee el mensaje en voz alta.
        </p>
      </div>
    </div>
  );
}
