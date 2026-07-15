import { useState, useMemo, useEffect, lazy, Suspense, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { MessageCircle, ShieldCheck, Users, FileText, Clock, MapPin, Phone, DollarSign, CheckCircle2, TrendingUp, RefreshCw, Loader2, Calendar, BarChart3, Mail, LayoutGrid, List, Mic, Wrench, AlertTriangle, Timer } from 'lucide-react';
import { CSSPReviewPanel } from './CSSPReviewPanel';
import { groqChat } from '../lib/groq';
import { supabase } from '../lib/supabase';

const SummarySection = lazy(() => import('./admin/SummarySection').then(m => ({ default: m.SummarySection })));
const NotificationsSection = lazy(() => import('./admin/NotificationsSection').then(m => ({ default: m.NotificationsSection })));
const PackagesSection = lazy(() => import('./admin/PackagesSection').then(m => ({ default: m.PackagesSection })));
const NursesSection = lazy(() => import('./admin/NursesSection').then(m => ({ default: m.NursesSection })));
const ChatSection = lazy(() => import('./admin/ChatSection').then(m => ({ default: m.ChatSection })));
const SupportSection = lazy(() => import('./admin/SupportSection').then(m => ({ default: m.SupportSection })));
const BenniSection = lazy(() => import('./admin/BenniSection').then(m => ({ default: m.BenniSection })));

const SectionSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
  </div>
);

export const AdminPanel: FC = () => {
  const { currentUser, careRequests, careOffers, profiles, nurses, bookings, confirmPayment } = useApp();
  const [section, setSection] = useState<'summary' | 'notifications' | 'cssp' | 'packages' | 'nurses' | 'chat' | 'support' | 'benni'>('summary');
  const [dailySummary, setDailySummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryDate, setSummaryDate] = useState('');
  const [waLoading, setWaLoading] = useState<string | null>(null);
  const [chatStats, setChatStats] = useState<{
    total: number;
    byRole: Record<string, number>;
    resolved: number;
    whatsapp: number;
    avgMessages: number;
    topTopics: Array<{ topic: string; count: number }>;
    last7Days: Array<{ date: string; count: number }>;
  } | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [supportEmails, setSupportEmails] = useState<Array<{
    id: string;
    from_email: string;
    subject: string;
    body: string;
    classification: string;
    auto_replied: boolean;
    auto_reply_body: string | null;
    needs_human: boolean;
    created_at: string;
  }>>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportFilter, setSupportFilter] = useState<'needs_human' | 'all' | 'auto_replied'>('needs_human');
  const [nurseViewMode, setNurseViewMode] = useState<'list' | 'grid'>('list');
  const [nurseGrouping, setNurseGrouping] = useState<'none' | 'specialization' | 'department' | 'district'>('specialization');
  const [benniStats, setBenniStats] = useState<{
    total: number;
    avgDurationSec: number;
    avgTurns: number;
    escalatedCount: number;
    toolsUsed: Array<{ tool: string; count: number }>;
    last7Days: Array<{ date: string; count: number }>;
    recentSessions: Array<{
      id: string;
      patient_user_id: string | null;
      family_user_id: string | null;
      session_started_at: string;
      session_ended_at: string | null;
      session_duration_sec: number | null;
      turns_count: number;
      tools_called: string[] | null;
      escalated: boolean;
    }>;
  } | null>(null);
  const [benniLoading, setBenniLoading] = useState(false);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">Acceso restringido a administradores.</p>
      </div>
    );
  }

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const nurseMap = useMemo(() => new Map(nurses.map(n => [n.id, n])), [nurses]);

  const groupedNurses = useMemo(() => {
    if (nurseGrouping === 'none') return [{ key: 'Todas', nurses }];
    const groups: Record<string, typeof nurses> = {};
    for (const n of nurses) {
      if (nurseGrouping === 'specialization') {
        const specs = n.specialization && n.specialization.length > 0 ? n.specialization : ['Sin especialización'];
        for (const s of specs) {
          if (!groups[s]) groups[s] = [];
          groups[s].push(n);
        }
      } else {
        const profile = profileMap.get(n.user_id);
        const locName = profile?.location_name || '';
        const parts = locName.split(',').map(p => p.trim()).filter(Boolean);
        if (nurseGrouping === 'department') {
          const dept = parts[0] || 'Sin departamento';
          if (!groups[dept]) groups[dept] = [];
          groups[dept].push(n);
        } else if (nurseGrouping === 'district') {
          const districts = parts.length > 1 ? parts.slice(1) : ['Sin distrito'];
          for (const d of districts) {
            if (!groups[d]) groups[d] = [];
            groups[d].push(n);
          }
        }
      }
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ns]) => ({ key, nurses: ns }));
  }, [nurses, nurseGrouping, profileMap]);

  // Daily metrics
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => {
    const bDate = b.start_time ? new Date(b.start_time).toISOString().split('T')[0] : null;
    return bDate === today;
  });
  const completedToday = bookings.filter(b => b.status === 'completed' && b.check_out_at && new Date(b.check_out_at).toISOString().split('T')[0] === today);
  const pendingPayments = bookings.filter(b => b.wants_invoice && (b.status === 'confirmed' || b.status === 'pending_payment') && b.payment_status !== 'paid');
  const pendingCSSP = nurses.filter(n => n.cssp_verification_status === 'pending' || (!n.cssp_verified && n.cssp_registration));
  const newNurses = nurses.filter(n => {
    const createdAt = n.created_at ? new Date(n.created_at).toISOString().split('T')[0] : null;
    return createdAt === today && !n.cssp_verified && n.cssp_registration;
  });
  const newProfiles = profiles.filter(p => {
    const createdAt = p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : null;
    return createdAt === today && p.role === 'user';
  });
  const cancelledToday = bookings.filter(b => b.status === 'cancelled' && b.check_out_at && new Date(b.check_out_at).toISOString().split('T')[0] === today);
  const invoicedRevenue = completedToday.filter(b => b.wants_invoice).reduce((sum, b) => sum + 5.65, 0);

  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryDate(new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' }));

    const metrics = {
      fecha: new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' }),
      servicios_hoy: todayBookings.length,
      completados_hoy: completedToday.length,
      cancelados_hoy: cancelledToday.length,
      pagos_pendientes: pendingPayments.length,
      enfermeras_por_verificar: pendingCSSP.length,
      nuevas_enfermeras: newNurses.length,
      nuevas_familias: newProfiles.length,
      solicitudes_activas: careRequests.filter(r => r.status === 'open').length,
      ofertas_pendientes: careOffers.filter(o => o.status === 'pending').length,
      ingresos_comision: invoicedRevenue.toFixed(2),
      nombres_nuevas_enfermeras: newNurses.map(n => profileMap.get(n.user_id)?.full_name).filter(Boolean),
      nombres_nuevas_familias: newProfiles.map(p => p.full_name).filter(Boolean),
      nombres_por_verificar: pendingCSSP.map(n => ({ nombre: profileMap.get(n.user_id)?.full_name, cssp: n.cssp_registration })).filter(x => x.nombre),
    };

    const systemPrompt = 'Eres un asistente administrativo de BienCuidar, plataforma de cuidado de salud en El Salvador. Redactas un resumen ejecutivo diario para el administrador. REGLAS: (1) Usa SOLO los datos proporcionados, no inventes. (2) Sé breve, claro y profesional. (3) Si un valor es 0, menciónalo brevemente o omítelo. (4) Destaca lo que requiere acción inmediata (pagos pendientes, enfermeras por verificar). (5) Máximo 120 palabras. (6) Tono directo, sin saludos ni despedidas.';

    const userContent = `Genera el resumen ejecutivo diario con estos datos EXACTOS:
- Fecha: ${metrics.fecha}
- Servicios programados hoy: ${metrics.servicios_hoy}
- Servicios completados hoy: ${metrics.completados_hoy}
- Servicios cancelados hoy: ${metrics.cancelados_hoy}
- Pagos pendientes de validar: ${metrics.pagos_pendientes}
- Enfermeras pendientes de verificar CSSP: ${metrics.enfermeras_por_verificar}${metrics.nombres_por_verificar.length > 0 ? ` (${metrics.nombres_por_verificar.map(x => x.nombre).join(', ')})` : ''}
- Enfermeras registradas sin verificar: ${metrics.nuevas_enfermeras}${metrics.nombres_nuevas_enfermeras.length > 0 ? ` (${metrics.nombres_nuevas_enfermeras.join(', ')})` : ''}
- Familias registradas: ${metrics.nuevas_familias}
- Solicitudes activas: ${metrics.solicitudes_activas}
- Ofertas pendientes de respuesta: ${metrics.ofertas_pendientes}
- Ingresos por comisión hoy: $${metrics.ingresos_comision}`;

    try {
      const content = await groqChat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        { temperature: 0.4, maxTokens: 250 }
      );
      setDailySummary(content);
    } catch {
      // Fallback sin Groq
      const lines = [
        `${metrics.fecha}: ${metrics.servicios_hoy} servicios programados, ${metrics.completados_hoy} completados, ${metrics.cancelados_hoy} cancelados.`,
        metrics.pagos_pendientes > 0 ? `${metrics.pagos_pendientes} pago(s) por validar.` : null,
        metrics.enfermeras_por_verificar > 0 ? `${metrics.enfermeras_por_verificar} enfermera(s) por verificar CSSP.` : null,
        metrics.nuevas_enfermeras > 0 ? `${metrics.nuevas_enfermeras} enfermera(s) sin verificar: ${metrics.nombres_nuevas_enfermeras.join(', ')}.` : null,
        metrics.nuevas_familias > 0 ? `${metrics.nuevas_familias} familia(s) registradas.` : null,
        `${metrics.solicitudes_activas} solicitudes activas, ${metrics.ofertas_pendientes} ofertas pendientes. Ingresos por comisión: $${metrics.ingresos_comision}.`,
      ].filter(Boolean);
      setDailySummary(lines.join(' '));
    }
    setSummaryLoading(false);
  };

  useEffect(() => {
    if (section === 'summary' && !dailySummary && !summaryLoading) {
      generateSummary();
    }
    if (section === 'chat' && !chatStats && !chatLoading) {
      loadChatStats();
    }
    if (section === 'support') {
      loadSupportEmails();
    }
    if (section === 'benni' && !benniStats && !benniLoading) {
      loadBenniStats();
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBenniStats = async () => {
    setBenniLoading(true);
    try {
      const { data, error } = await supabase
        .from('benni_session_log')
        .select('*')
        .order('session_started_at', { ascending: false })
        .limit(500);

      if (error || !data) {
        setBenniLoading(false);
        return;
      }

      const total = data.length;
      const completed = data.filter((s: any) => s.session_ended_at);
      const avgDurationSec = completed.length > 0
        ? Math.round(completed.reduce((sum: number, s: any) => sum + (s.session_duration_sec || 0), 0) / completed.length)
        : 0;
      const avgTurns = total > 0
        ? Math.round(data.reduce((sum: number, s: any) => sum + (s.turns_count || 0), 0) / total * 10) / 10
        : 0;
      const escalatedCount = data.filter((s: any) => s.escalated).length;

      const toolCount: Record<string, number> = {};
      for (const s of data) {
        if (s.tools_called && Array.isArray(s.tools_called)) {
          for (const t of s.tools_called) {
            toolCount[t] = (toolCount[t] || 0) + 1;
          }
        }
      }
      const toolsUsed = Object.entries(toolCount)
        .sort(([, a], [, b]) => b - a)
        .map(([tool, count]) => ({ tool, count }));

      const dayCount: Record<string, number> = {};
      for (const s of data) {
        const day = new Date(s.session_started_at).toISOString().split('T')[0];
        dayCount[day] = (dayCount[day] || 0) + 1;
      }
      const last7Days = Object.entries(dayCount)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-7)
        .map(([date, count]) => ({ date, count }));

      const recentSessions = data.slice(0, 20);

      setBenniStats({ total, avgDurationSec, avgTurns, escalatedCount, toolsUsed, last7Days, recentSessions });
    } catch {
      // Silent fail
    }
    setBenniLoading(false);
  };

  const loadSupportEmails = async () => {
    setSupportLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_emails')
        .select('id, from_email, subject, body, classification, auto_replied, auto_reply_body, needs_human, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
        setSupportEmails(data as any);
      }
    } catch {
      // silent
    }
    setSupportLoading(false);
  };

  const markEmailResolved = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('support_emails')
        .update({ needs_human: false })
        .eq('id', emailId);
      if (!error) {
        setSupportEmails(prev => prev.map(e => e.id === emailId ? { ...e, needs_human: false } : e));
      }
    } catch {
      // silent
    }
  };

  const loadChatStats = async () => {
    setChatLoading(true);
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('user_role, summary, topics, resolved, message_count, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error || !data) {
        setChatLoading(false);
        return;
      }

      const total = data.length;
      const byRole: Record<string, number> = {};
      let resolved = 0;
      let whatsapp = 0;
      let totalMessages = 0;
      const topicCount: Record<string, number> = {};
      const dayCount: Record<string, number> = {};

      for (const s of data) {
        byRole[s.user_role] = (byRole[s.user_role] || 0) + 1;
        if (s.resolved) resolved++;
        if (s.summary && s.summary.toLowerCase().includes('whatsapp')) whatsapp++;
        totalMessages += s.message_count || 0;
        if (s.topics && Array.isArray(s.topics)) {
          for (const t of s.topics) {
            const tc = t.toLowerCase().trim();
            if (tc) topicCount[tc] = (topicCount[tc] || 0) + 1;
          }
        }
        const day = new Date(s.created_at).toISOString().split('T')[0];
        dayCount[day] = (dayCount[day] || 0) + 1;
      }

      const topTopics = Object.entries(topicCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([topic, count]) => ({ topic, count }));

      const last7Days = Object.entries(dayCount)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-7)
        .map(([date, count]) => ({ date, count }));

      setChatStats({
        total,
        byRole,
        resolved,
        whatsapp,
        avgMessages: total > 0 ? Math.round(totalMessages / total) : 0,
        topTopics,
        last7Days,
      });
    } catch {
      // Silent fail
    }
    setChatLoading(false);
  };

  const waLink = (phone: string | undefined, message: string) => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;
    const fullPhone = cleanPhone.startsWith('503') ? cleanPhone : `503${cleanPhone}`;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
  };

  const generateWaMessage = async (type: 'family' | 'nurse', data: {
    familyName?: string; patientName?: string; offerCount?: number; location?: string;
    nurseName?: string; offeredRate?: number; shift?: string;
  }): Promise<string> => {
    const systemPrompt = 'Redactas mensajes cortos de WhatsApp para BienCuidar, plataforma de cuidado de salud en El Salvador. REGLAS: (1) Usa SOLO los datos proporcionados. (2) Máximo 40 palabras. (3) Tono cálido y personal, no robótico. (4) Incluye el link https://biencuidar.app al final. (5) No saludes con "Estimado/a".';
    let userContent = '';
    if (type === 'family') {
      userContent = `Redacta un mensaje para ${data.familyName || 'la familia'}:
- Tienen ${data.offerCount} enfermera(s) interesada(s) en cuidar a ${data.patientName}
- Ubicación: ${data.location || 'no especificada'}
Mensaje para avisarles que revisen las ofertas en la app.`;
    } else {
      userContent = `Redacta un mensaje para ${data.nurseName || 'la enfermera'}:
- Su oferta para cuidar a ${data.patientName} fue aceptada
- Tarifa acordada: $${data.offeredRate}/turno
Mensaje para avisarle que revise los detalles en la app.`;
    }
    try {
      return await groqChat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        { temperature: 0.5, maxTokens: 80 }
      );
    } catch {
      if (type === 'family') {
        return `Hola ${data.familyName || ''}, tienes ${data.offerCount} enfermera(s) interesada(s) en cuidar a ${data.patientName}. Revisa las ofertas en BienCuidar: https://biencuidar.app`;
      }
      return `Hola ${data.nurseName || ''}, tu oferta para cuidar a ${data.patientName} fue aceptada. Revisa los detalles en BienCuidar: https://biencuidar.app`;
    }
  };

  const handleFamilyWa = async (reqId: string, familyName: string, patientName: string, offerCount: number, location: string, phone?: string) => {
    setWaLoading(reqId);
    const msg = await generateWaMessage('family', { familyName, patientName, offerCount, location });
    setWaLoading(null);
    const wa = waLink(phone, msg);
    if (wa) window.open(wa, '_blank');
  };

  const handleNurseWa = async (offerId: string, nurseName: string, patientName: string, offeredRate: number, phone?: string) => {
    setWaLoading(offerId);
    const msg = await generateWaMessage('nurse', { nurseName, patientName, offeredRate });
    setWaLoading(null);
    const wa = waLink(phone, msg);
    if (wa) window.open(wa, '_blank');
  };

  // Long-term requests (4+ days) that need AGTI management
  const longTermRequests = careRequests.filter(r => r.status === 'open' && (r.expected_duration || 'shifts') !== 'shifts');
  // Nurses pre-qualified for long-term assignments
  const longTermNurses = nurses.filter(n => n.assignment_availability === 'up_to_1_month' || n.assignment_availability === 'flexible');
  // Split by available days
  const weekendNurses = longTermNurses.filter(n => n.available_days?.includes(0) || n.available_days?.includes(6));
  const weekdayNurses = longTermNurses.filter(n => n.available_days?.some(d => d >= 1 && d <= 5));

  const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const AVAIL_LABELS: Record<string, string> = {
    shifts_only: 'Solo turnos',
    up_to_2_weeks: 'Hasta 2 semanas',
    up_to_1_month: '1 mes o más',
    flexible: 'Flexible',
  };
  const PAY_LABELS: Record<string, string> = {
    per_shift: 'Por turno',
    service_contract: 'Contrato',
    both: 'Ambos',
  };

  // Requests with pending offers that family hasn't been notified about
  const requestsWithOffers = careRequests.filter(r =>
    careOffers.some(o => o.request_id === r.id && o.status === 'pending')
  );

  // Accepted offers where nurse needs to be notified
  const acceptedOffers = careOffers.filter(o => o.status === 'accepted');

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-1.5">
        <button
          onClick={() => setSection('summary')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'summary' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5 inline mr-1" />
          Resumen
        </button>
        <button
          onClick={() => setSection('notifications')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'notifications' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5 inline mr-1" />
          Notificaciones
          {(requestsWithOffers.length + acceptedOffers.length + pendingPayments.length) > 0 && (
            <span className="ml-1 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full inline-flex items-center justify-center">
              {requestsWithOffers.length + acceptedOffers.length + pendingPayments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSection('packages')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'packages' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="h-3.5 w-3.5 inline mr-1" />
          Asignaciones largas
          {longTermRequests.length > 0 && (
            <span className="ml-1 bg-emerald-500 text-white text-[8px] font-bold w-4 h-4 rounded-full inline-flex items-center justify-center">
              {longTermRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSection('cssp')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'cssp' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 inline mr-1" />
          CSSP
          {pendingCSSP.length > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-[8px] font-bold w-4 h-4 rounded-full inline-flex items-center justify-center">
              {pendingCSSP.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSection('nurses')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'nurses' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="h-3.5 w-3.5 inline mr-1" />
          Enfermeras
        </button>
        <button
          onClick={() => setSection('chat')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
          Chat
        </button>
        <button
          onClick={() => setSection('support')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'support' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Mail className="h-3.5 w-3.5 inline mr-1" />
          Correo
          {supportEmails.filter(e => e.needs_human).length > 0 && (
            <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1.5 py-0.5">{supportEmails.filter(e => e.needs_human).length}</span>
          )}
        </button>
        <button
          onClick={() => setSection('benni')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'benni' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Mic className="h-3.5 w-3.5 inline mr-1" />
          Benni
        </button>
      </div>

      {section === 'summary' && (
        <Suspense fallback={<SectionSpinner />}>
          <SummarySection
            dailySummary={dailySummary}
            summaryLoading={summaryLoading}
            summaryDate={summaryDate}
            generateSummary={generateSummary}
            todayBookings={todayBookings}
            completedToday={completedToday}
            pendingPayments={pendingPayments}
            pendingCSSP={pendingCSSP}
            newNurses={newNurses}
            newProfiles={newProfiles}
            requestsWithOffers={requestsWithOffers}
            acceptedOffers={acceptedOffers}
            setSection={setSection}
          />
        </Suspense>
      )}
      {section === 'notifications' && (
        <Suspense fallback={<SectionSpinner />}>
          <NotificationsSection
            requestsWithOffers={requestsWithOffers}
            acceptedOffers={acceptedOffers}
            profileMap={profileMap}
            nurseMap={nurseMap}
            careOffers={careOffers}
            careRequests={careRequests}
            bookings={bookings}
            waLoading={waLoading}
            handleFamilyWa={handleFamilyWa}
            handleNurseWa={handleNurseWa}
            confirmPayment={confirmPayment}
          />
        </Suspense>
      )}

      {section === 'packages' && (
        <Suspense fallback={<SectionSpinner />}>
          <PackagesSection
            longTermRequests={longTermRequests}
            weekdayNurses={weekdayNurses}
            weekendNurses={weekendNurses}
            profileMap={profileMap}
          />
        </Suspense>
      )}

      {section === 'cssp' && (
        <CSSPReviewPanel />
      )}

      {section === 'nurses' && (
        <Suspense fallback={<SectionSpinner />}>
          <NursesSection
            nurses={nurses}
            profileMap={profileMap}
            nurseGrouping={nurseGrouping}
            setNurseGrouping={setNurseGrouping}
            nurseViewMode={nurseViewMode}
            setNurseViewMode={setNurseViewMode}
            groupedNurses={groupedNurses}
          />
        </Suspense>
      )}

      {section === 'chat' && (
        <Suspense fallback={<SectionSpinner />}>
          <ChatSection
            chatLoading={chatLoading}
            chatStats={chatStats}
          />
        </Suspense>
      )}

      {section === 'support' && (
        <Suspense fallback={<SectionSpinner />}>
          <SupportSection
            supportLoading={supportLoading}
            supportEmails={supportEmails}
            supportFilter={supportFilter}
            setSupportFilter={setSupportFilter}
            markEmailResolved={markEmailResolved}
          />
        </Suspense>
      )}

      {section === 'benni' && (
        <Suspense fallback={<SectionSpinner />}>
          <BenniSection
            benniLoading={benniLoading}
            benniStats={benniStats}
            profileMap={profileMap}
          />
        </Suspense>
      )}

    </div>
  );
};
