import { useState, useMemo, useEffect, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { MessageCircle, ShieldCheck, Users, FileText, Clock, MapPin, Phone, DollarSign, CheckCircle2, TrendingUp, RefreshCw, Loader2, Calendar, BarChart3, Mail, LayoutGrid, List } from 'lucide-react';
import { CSSPReviewPanel } from './CSSPReviewPanel';
import { groqChat } from '../lib/groq';
import { supabase } from '../lib/supabase';

export const AdminPanel: FC = () => {
  const { currentUser, careRequests, careOffers, profiles, nurses, bookings, confirmPayment } = useApp();
  const [section, setSection] = useState<'summary' | 'notifications' | 'cssp' | 'packages' | 'nurses' | 'chat' | 'support'>('summary');
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
  const newNurses = nurses.filter(n => !n.cssp_verified && n.cssp_registration);
  const newProfiles = profiles.filter(p => p.role === 'user');
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
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

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
      </div>

      {section === 'summary' && (
        <div className="space-y-4">
          {/* Daily executive summary */}
          <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-300" />
                <div>
                  <h3 className="text-sm font-bold">Resumen del día</h3>
                  {summaryDate && <p className="text-[10px] text-indigo-300 capitalize">{summaryDate}</p>}
                </div>
              </div>
              <button
                onClick={generateSummary}
                disabled={summaryLoading}
                className="text-[10px] font-bold text-indigo-200 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
            {summaryLoading ? (
              <div className="flex items-center gap-2.5 text-xs text-indigo-200 font-medium py-2">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"></div>
                <span>Generando resumen...</span>
              </div>
            ) : (
              <p className="text-xs text-slate-100 leading-relaxed">{dailySummary}</p>
            )}
          </div>

          {/* Quick metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Servicios hoy</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{todayBookings.length}</p>
              <p className="text-[10px] text-slate-400">{completedToday.length} completados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Pagos pendientes</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{pendingPayments.length}</p>
              <p className="text-[10px] text-slate-400">por validar</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">CSSP</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{pendingCSSP.length}</p>
              <p className="text-[10px] text-slate-400">por verificar</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Nuevos hoy</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{newNurses.length + newProfiles.length}</p>
              <p className="text-[10px] text-slate-400">{newNurses.length} sin verificar, {newProfiles.length} familias</p>
            </div>
          </div>

          {/* Action items */}
          {(pendingPayments.length > 0 || pendingCSSP.length > 0 || requestsWithOffers.length > 0 || acceptedOffers.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide">Requiere atención</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {pendingPayments.length > 0 && (
                  <button onClick={() => setSection('notifications')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{pendingPayments.length} pago(s) por validar</p>
                      <p className="text-[10px] text-slate-400">Servicios con factura pendientes</p>
                    </div>
                    <DollarSign className="h-4 w-4 text-amber-500" />
                  </button>
                )}
                {pendingCSSP.length > 0 && (
                  <button onClick={() => setSection('cssp')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{pendingCSSP.length} enfermera(s) por verificar CSSP</p>
                      <p className="text-[10px] text-slate-400">Revisión pendiente</p>
                    </div>
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  </button>
                )}
                {requestsWithOffers.length > 0 && (
                  <button onClick={() => setSection('notifications')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{requestsWithOffers.length} familia(s) por notificar</p>
                      <p className="text-[10px] text-slate-400">Tienen ofertas pendientes</p>
                    </div>
                    <MessageCircle className="h-4 w-4 text-indigo-500" />
                  </button>
                )}
                {acceptedOffers.length > 0 && (
                  <button onClick={() => setSection('notifications')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{acceptedOffers.length} enfermera(s) por avisar</p>
                      <p className="text-[10px] text-slate-400">Ofertas aceptadas, notificar</p>
                    </div>
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'notifications' && (
        <div className="space-y-4">
          {/* Families to notify about new offers */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Familias con nuevas ofertas ({requestsWithOffers.length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Avisa a las familias que hay enfermeras interesadas en su solicitud.</p>
            </div>
            {requestsWithOffers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No hay familias pendientes de notificar.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requestsWithOffers.map(req => {
                  const family = profileMap.get(req.user_id);
                  const offers = careOffers.filter(o => o.request_id === req.id && o.status === 'pending');
                  return (
                    <div key={req.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">{family?.full_name || 'Familia'}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {req.patient_name} · {offers.length} oferta(s) · {req.location_name}
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="h-2.5 w-2.5" />{family?.phone || 'Sin teléfono'}
                        </p>
                      </div>
                      {family?.phone ? (
                        <button
                          onClick={() => handleFamilyWa(req.id, family?.full_name || '', req.patient_name, offers.length, req.location_name || '', family?.phone)}
                          disabled={waLoading === req.id}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer disabled:opacity-60"
                        >
                          {waLoading === req.id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Redactando...</>
                          ) : (
                            <><MessageCircle className="h-3.5 w-3.5" />Avisar</>
                          )}
                        </button>
                      ) : (
                        <span className="shrink-0 text-[10px] text-slate-400 italic">Sin teléfono</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nurses to notify about accepted offers */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Enfermeras con ofertas aceptadas ({acceptedOffers.length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Avisa a las enfermeras que su oferta fue aceptada.</p>
            </div>
            {acceptedOffers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No hay enfermeras pendientes de notificar.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {acceptedOffers.map(offer => {
                  const nurse = nurseMap.get(offer.nurse_id);
                  const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
                  const req = careRequests.find(r => r.id === offer.request_id);
                  return (
                    <div key={offer.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">{nurseProfile?.full_name || 'Enfermera'}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {req?.patient_name || 'Paciente'} · ${offer.offered_rate}/turno
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="h-2.5 w-2.5" />{nurseProfile?.phone || 'Sin teléfono'}
                        </p>
                      </div>
                      {nurseProfile?.phone ? (
                        <button
                          onClick={() => handleNurseWa(offer.id, nurseProfile?.full_name || '', req?.patient_name || 'el paciente', offer.offered_rate, nurseProfile?.phone)}
                          disabled={waLoading === offer.id}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer disabled:opacity-60"
                        >
                          {waLoading === offer.id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Redactando...</>
                          ) : (
                            <><MessageCircle className="h-3.5 w-3.5" />Avisar</>
                          )}
                        </button>
                      ) : (
                        <span className="shrink-0 text-[10px] text-slate-400 italic">Sin teléfono</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transfers to validate — only for invoiced bookings */}
          {bookings.filter(b => b.wants_invoice && (b.status === 'confirmed' || b.status === 'pending_payment') && b.payment_status !== 'paid').length > 0 && (
            <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" />
                  Transferencias por validar ({bookings.filter(b => b.wants_invoice && (b.status === 'confirmed' || b.status === 'pending_payment') && b.payment_status !== 'paid').length})
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Servicios con factura. Confirma que la familia transfirió a la cuenta de BienCuidar.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {bookings.filter(b => b.wants_invoice && (b.status === 'confirmed' || b.status === 'pending_payment') && b.payment_status !== 'paid').map(b => {
                  const family = profileMap.get(b.user_id);
                  const nurse = nurseMap.get(b.nurse_id);
                  const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
                  const isrRetention = (b.total_price || 0) * 0.10;
                  const managementFee = 5.65;
                  const totalToTransfer = (b.total_price || 0) + managementFee;
                  return (
                    <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">{b.patient_name}</p>
                        <p className="text-[10px] text-slate-500">
                          Familia: {family?.full_name || 'N/A'} · Enfermera: {nurseProfile?.full_name || 'N/A'}
                        </p>
                        <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                          <div className="flex gap-2"><span>Total a transferir:</span><span className="font-bold text-amber-700">${totalToTransfer.toFixed(2)}</span></div>
                          <div className="flex gap-2"><span>Enfermera recibe:</span><span className="font-bold text-emerald-600">${((b.total_price || 0) - isrRetention).toFixed(2)}</span></div>
                        </div>
                      </div>
                      <button
                        onClick={() => confirmPayment(b.id)}
                        className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirmar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FSEE requests from families */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Facturas familiares ({bookings.filter(b => b.wants_invoice && b.status === 'completed').length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">BienCuidar retiene ISR 10%, emite Factura a la familia y FSEE a la enfermera. Comisión: US$ 5.65 (gestión + IVA).</p>
            </div>
            {bookings.filter(b => b.wants_invoice && b.status === 'completed').length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Sin servicios con factura.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {bookings.filter(b => b.wants_invoice && b.status === 'completed').map(b => {
                  const family = profileMap.get(b.user_id);
                  const nurse = nurseMap.get(b.nurse_id);
                  const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
                  const serviceAmount = b.total_price || 0;
                  const managementFee = 5.65;
                  return (
                    <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">{b.patient_name}</p>
                        <p className="text-[10px] text-slate-500">
                          Familia: {family?.full_name || 'N/A'} · Enfermera: {nurseProfile?.full_name || 'N/A'}
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="h-2.5 w-2.5" />{family?.phone || 'Sin teléfono'}
                        </p>
                        <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                          <div className="flex gap-2"><span>Servicio:</span><span className="font-bold">${serviceAmount.toFixed(2)}</span></div>
                          <div className="flex gap-2"><span>Gestión + IVA:</span><span className="font-bold">${managementFee.toFixed(2)}</span></div>
                        </div>
                      </div>
                      <button
                        className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Emitir factura
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent bookings overview */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Servicios recientes ({bookings.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {bookings.slice(0, 10).map(b => {
                const family = profileMap.get(b.user_id);
                const nurse = nurseMap.get(b.nurse_id);
                const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
                return (
                  <div key={b.id} className="px-4 py-2.5 text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">{b.patient_name}</span>
                      <div className="flex items-center gap-1">
                        {b.payment_status === 'paid' && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">Pagado</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full font-bold ${
                          b.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          b.status === 'confirmed' ? 'bg-indigo-100 text-indigo-700' :
                          b.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{b.status}</span>
                      </div>
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      Enfermera: {nurseProfile?.full_name || 'Por asignar'} · Familia: {family?.full_name || b.patient_name || 'N/A'}
                    </p>
                    {b.check_in_at && (
                      <p className="text-emerald-600 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" />Check-in: {new Date(b.check_in_at).toLocaleString('es-SV')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {section === 'packages' && (
        <div className="space-y-4">
          {/* Long-term requests needing AGTI management */}
          <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Solicitudes de larga duración ({longTermRequests.length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Servicios de 4+ días. AGTI contacta a la familia con cotización personalizada.</p>
            </div>
            {longTermRequests.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No hay solicitudes de larga duración.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {longTermRequests.map(req => {
                  const family = profileMap.get(req.user_id);
                  const durationLabel = req.expected_duration === 'up_to_2_weeks' ? 'Hasta 2 semanas' : req.expected_duration === 'up_to_1_month' ? '1 mes o más' : 'Duración por definir';
                  return (
                    <div key={req.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700">{req.patient_name} - {req.patient_condition}</p>
                          <p className="text-[10px] text-slate-500">Familia: {family?.full_name || 'N/A'} · {req.slots.length} día(s) · {req.location_name}</p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone className="h-2.5 w-2.5" />{family?.phone || 'Sin teléfono'}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                          {durationLabel}
                        </span>
                      </div>
                      {req.specialization_needed && (
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full inline-block">
                          {req.specialization_needed}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nurses qualified for long-term - Weekday block */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Enfermeras Lunes a Viernes ({weekdayNurses.length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Cubren días hábiles. Ideales para bloque L-V en paquetes de 7 días.</p>
            </div>
            {weekdayNurses.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No hay enfermeras disponibles para L-V.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {weekdayNurses.map(nurse => {
                  const profile = profileMap.get(nurse.user_id);
                  const days = nurse.available_days?.map(d => DAY_LABELS[d]).join(', ') || '';
                  return (
                    <div key={nurse.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
                        <p className="text-[10px] text-slate-500">{days} · ${nurse.shift_rate}/turno</p>
                        <div className="flex gap-1.5 mt-1">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600">{PAY_LABELS[nurse.payment_preference || 'per_shift']}</span>
                          {nurse.cssp_verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">CSSP ✓</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                          <Phone className="h-2.5 w-2.5" />{profile?.phone || 'N/A'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nurses qualified for long-term - Weekend block */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Enfermeras Fines de Semana ({weekendNurses.length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Cubren sábados y domingos. Ideales para bloque S-D en paquetes de 7 días.</p>
            </div>
            {weekendNurses.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No hay enfermeras disponibles para fines de semana.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {weekendNurses.map(nurse => {
                  const profile = profileMap.get(nurse.user_id);
                  const days = nurse.available_days?.map(d => DAY_LABELS[d]).join(', ') || '';
                  return (
                    <div key={nurse.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
                        <p className="text-[10px] text-slate-500">{days} · ${nurse.shift_rate}/turno</p>
                        <div className="flex gap-1.5 mt-1">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600">{PAY_LABELS[nurse.payment_preference || 'per_shift']}</span>
                          {nurse.cssp_verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">CSSP ✓</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                          <Phone className="h-2.5 w-2.5" />{profile?.phone || 'N/A'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Package cost calculator hint */}
          {weekdayNurses.length > 0 && weekendNurses.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-indigo-600" />
                <p className="text-xs font-bold text-indigo-800">Calculadora de paquete (7 días)</p>
              </div>
              <div className="text-[11px] text-slate-600 space-y-0.5">
                <p>Bloque L-V (5 días): ${Math.min(...weekdayNurses.map(n => n.shift_rate))}/turno × 5 = <span className="font-bold">${Math.min(...weekdayNurses.map(n => n.shift_rate)) * 5}</span></p>
                <p>Bloque S-D (2 días): ${Math.min(...weekendNurses.map(n => n.shift_rate))}/turno × 2 = <span className="font-bold">${Math.min(...weekendNurses.map(n => n.shift_rate)) * 2}</span></p>
                <p className="font-bold text-indigo-700 pt-1 border-t border-indigo-200 mt-1">Costo base semanal: ${Math.min(...weekdayNurses.map(n => n.shift_rate)) * 5 + Math.min(...weekendNurses.map(n => n.shift_rate)) * 2}</p>
                <p className="text-[10px] text-slate-500">Aplica descuento por volumen al cotizar a la familia.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'cssp' && (
        <CSSPReviewPanel />
      )}

      {section === 'nurses' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Directorio de Enfermeras ({nurses.length})
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Datos completos de cada enfermera registrada.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 flex-wrap">
                  <button
                    onClick={() => setNurseGrouping('specialization')}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'specialization' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >Por especialización</button>
                  <button
                    onClick={() => setNurseGrouping('department')}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'department' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >Por departamento</button>
                  <button
                    onClick={() => setNurseGrouping('district')}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'district' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >Por distrito</button>
                  <button
                    onClick={() => setNurseGrouping('none')}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'none' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >Sin agrupar</button>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setNurseViewMode('list')}
                    className={`p-1 rounded transition cursor-pointer ${nurseViewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                    title="Vista lista"
                  ><List className="h-3.5 w-3.5" /></button>
                  <button
                    onClick={() => setNurseViewMode('grid')}
                    className={`p-1 rounded transition cursor-pointer ${nurseViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                    title="Vista cuadrícula"
                  ><LayoutGrid className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {nurseGrouping === 'none' ? (
                <div className={nurseViewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3' : 'divide-y divide-slate-100'}>
                  {nurses.map(nurse => {
                    const profile = profileMap.get(nurse.user_id);
                    const csspStatus = nurse.cssp_verification_status || 'unverified';
                    const csspBadge = csspStatus === 'auto_verified' || csspStatus === 'manual_verified'
                      ? { label: 'CSSP ✓', color: 'bg-blue-50 text-blue-700' }
                      : csspStatus === 'pending'
                      ? { label: 'CSSP ⏳', color: 'bg-amber-50 text-amber-700' }
                      : { label: 'CSSP ✗', color: 'bg-rose-50 text-rose-700' };
                    if (nurseViewMode === 'grid') {
                      return (
                        <div key={nurse.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-700 truncate">{profile?.full_name || 'Sin nombre'}</p>
                              <p className="text-[10px] text-slate-500 truncate">{profile?.email}</p>
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${csspBadge.color}`}>{csspBadge.label}</span>
                          </div>
                          <div className="space-y-1 text-[10px] text-slate-600">
                            <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-slate-400" />{profile?.phone || 'Sin teléfono'}</div>
                            <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-slate-400" />{profile?.location_name || 'Sin ubicación'}</div>
                            <div className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5 text-slate-400" />${nurse.shift_rate}/turno</div>
                          </div>
                          {nurse.specialization && nurse.specialization.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {nurse.specialization.map((s: string) => (
                                <span key={s} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={nurse.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
                            <p className="text-[10px] text-slate-500">{profile?.email}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${csspBadge.color}`}>{csspBadge.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600">
                          <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-slate-400" />{profile?.phone || 'Sin teléfono'}</div>
                          <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-slate-400" />{profile?.location_name || 'Sin ubicación'}</div>
                          <div className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5 text-slate-400" />${nurse.shift_rate}/turno</div>
                          <div className="flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5 text-slate-400" />{nurse.cssp_registration || 'Sin CSSP'}</div>
                          <div><span className="text-slate-400">Nivel:</span> {nurse.cssp_level || 'N/A'}</div>
                          <div><span className="text-slate-400">DUI:</span> {nurse.dui || 'N/A'}</div>
                          <div><span className="text-slate-400">Pago:</span> {PAY_LABELS[nurse.payment_preference || 'per_shift']}</div>
                          <div><span className="text-slate-400">Disponibilidad:</span> {AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</div>
                        </div>
                        {nurse.specialization && nurse.specialization.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {nurse.specialization.map((s: string) => (
                              <span key={s} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{s}</span>
                            ))}
                          </div>
                        )}
                        {nurse.bio && (
                          <p className="text-[10px] text-slate-500 italic line-clamp-2">{nurse.bio}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                groupedNurses.map(group => (
                  <div key={group.key} className="border-b border-slate-100 last:border-0">
                    <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">{group.key}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{group.nurses.length}</span>
                    </div>
                    <div className={nurseViewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3' : 'divide-y divide-slate-100'}>
                      {group.nurses.map(nurse => {
                        const profile = profileMap.get(nurse.user_id);
                        const csspStatus = nurse.cssp_verification_status || 'unverified';
                        const csspBadge = csspStatus === 'auto_verified' || csspStatus === 'manual_verified'
                          ? { label: 'CSSP ✓', color: 'bg-blue-50 text-blue-700' }
                          : csspStatus === 'pending'
                          ? { label: 'CSSP ⏳', color: 'bg-amber-50 text-amber-700' }
                          : { label: 'CSSP ✗', color: 'bg-rose-50 text-rose-700' };
                        if (nurseViewMode === 'grid') {
                          return (
                            <div key={nurse.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-700 truncate">{profile?.full_name || 'Sin nombre'}</p>
                                  <p className="text-[10px] text-slate-500 truncate">{profile?.email}</p>
                                </div>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${csspBadge.color}`}>{csspBadge.label}</span>
                              </div>
                              <div className="space-y-1 text-[10px] text-slate-600">
                                <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-slate-400" />{profile?.phone || 'Sin teléfono'}</div>
                                <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-slate-400" />{profile?.location_name || 'Sin ubicación'}</div>
                                <div className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5 text-slate-400" />${nurse.shift_rate}/turno</div>
                              </div>
                              {nurse.specialization && nurse.specialization.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {nurse.specialization.map((s: string) => (
                                    <span key={s} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{s}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div key={nurse.id} className="px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
                                <p className="text-[10px] text-slate-500">{profile?.email}</p>
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${csspBadge.color}`}>{csspBadge.label}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600">
                              <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-slate-400" />{profile?.phone || 'Sin teléfono'}</div>
                              <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-slate-400" />{profile?.location_name || 'Sin ubicación'}</div>
                              <div className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5 text-slate-400" />${nurse.shift_rate}/turno</div>
                              <div className="flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5 text-slate-400" />{nurse.cssp_registration || 'Sin CSSP'}</div>
                              <div><span className="text-slate-400">Nivel:</span> {nurse.cssp_level || 'N/A'}</div>
                              <div><span className="text-slate-400">DUI:</span> {nurse.dui || 'N/A'}</div>
                              <div><span className="text-slate-400">Pago:</span> {PAY_LABELS[nurse.payment_preference || 'per_shift']}</div>
                              <div><span className="text-slate-400">Disponibilidad:</span> {AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</div>
                            </div>
                            {nurse.specialization && nurse.specialization.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {nurse.specialization.map((s: string) => (
                                  <span key={s} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{s}</span>
                                ))}
                              </div>
                            )}
                            {nurse.bio && (
                              <p className="text-[10px] text-slate-500 italic line-clamp-2">{nurse.bio}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {section === 'chat' && (
        <div className="space-y-4">
          {chatLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
            </div>
          )}

          {!chatLoading && !chatStats && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <p className="text-sm text-slate-500">No hay datos de chat disponibles.</p>
            </div>
          )}

          {!chatLoading && chatStats && (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageCircle className="h-4 w-4 text-indigo-500" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total sesiones</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{chatStats.total}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Resueltas</p>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">
                    {chatStats.total > 0 ? Math.round((chatStats.resolved / chatStats.total) * 100) : 0}%
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">A WhatsApp</p>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{chatStats.whatsapp}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-4 w-4 text-amber-500" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Msg promedio</p>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{chatStats.avgMessages}</p>
                </div>
              </div>

              {/* By role */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Sesiones por rol</h3>
                <div className="space-y-2">
                  {Object.entries(chatStats.byRole).map(([role, count]) => {
                    const pct = chatStats.total > 0 ? Math.round((count / chatStats.total) * 100) : 0;
                    const label = role === 'nurse' ? 'Enfermeras' : role === 'family' ? 'Familias' : role === 'admin' ? 'Admin' : 'Visitantes';
                    const color = role === 'nurse' ? 'bg-emerald-500' : role === 'family' ? 'bg-indigo-500' : role === 'admin' ? 'bg-amber-500' : 'bg-slate-400';
                    return (
                      <div key={role} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-600 w-20">{label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                          <div className={`${color} h-full rounded-full flex items-center justify-end px-2`} style={{ width: `${Math.max(pct, 8)}%` }}>
                            <span className="text-[10px] font-bold text-white">{count}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top topics */}
              {chatStats.topTopics.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Temas más consultados</h3>
                  <div className="flex flex-wrap gap-2">
                    {chatStats.topTopics.map((t, i) => (
                      <div key={t.topic} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                        <span className="text-[10px] font-bold text-indigo-400">#{i + 1}</span>
                        <span className="text-xs font-bold text-indigo-700 capitalize">{t.topic}</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-100 rounded-full px-1.5 py-0.5">{t.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Last 7 days */}
              {chatStats.last7Days.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Actividad (últimos 7 días)</h3>
                  <div className="flex items-end justify-between gap-2 h-32">
                    {chatStats.last7Days.map((d) => {
                      const maxCount = Math.max(...chatStats.last7Days.map(x => x.count), 1);
                      const heightPct = Math.max((d.count / maxCount) * 100, 5);
                      const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric' });
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-600">{d.count}</span>
                          <div className="w-full bg-indigo-100 rounded-t-lg" style={{ height: `${heightPct}%` }}>
                            <div className="w-full h-full bg-indigo-500 rounded-t-lg" />
                          </div>
                          <span className="text-[9px] text-slate-400 capitalize">{dateLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {chatStats.total === 0 && (
                <div className="text-center py-8 bg-white rounded-2xl border border-slate-200">
                  <p className="text-sm text-slate-500">Aún no hay sesiones de chat registradas.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {section === 'support' && (
        <div className="space-y-4">
          {/* Filter buttons */}
          <div className="flex gap-2">
            {[
              { key: 'needs_human' as const, label: 'Necesitan respuesta' },
              { key: 'auto_replied' as const, label: 'Auto-respondidos' },
              { key: 'all' as const, label: 'Todos' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSupportFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  supportFilter === key ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
                {key === 'needs_human' && supportEmails.filter(e => e.needs_human).length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1.5 py-0.5">{supportEmails.filter(e => e.needs_human).length}</span>
                )}
              </button>
            ))}
          </div>

          {supportLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
            </div>
          )}

          {!supportLoading && (() => {
            const filtered = supportEmails.filter(e => {
              if (supportFilter === 'needs_human') return e.needs_human;
              if (supportFilter === 'auto_replied') return e.auto_replied;
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <Mail className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {supportFilter === 'needs_human' ? 'No hay correos pendientes de respuesta.' : 'No hay correos registrados.'}
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-2">
                {filtered.map((email) => (
                  <div key={email.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-800 truncate">{email.subject || '(sin asunto)'}</p>
                          {email.needs_human && (
                            <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">Requiere atención</span>
                          )}
                          {email.auto_replied && (
                            <span className="bg-emerald-100 text-emerald-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">Auto-respondido</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">De: {email.from_email} · {new Date(email.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}</p>
                      </div>
                      <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full shrink-0 capitalize">{email.classification}</span>
                    </div>
                    {email.body && (
                      <p className="text-[11px] text-slate-600 line-clamp-3">{email.body.substring(0, 300)}</p>
                    )}
                    {email.auto_reply_body && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Respuesta enviada:</p>
                        <p className="text-[11px] text-slate-600 line-clamp-3">{email.auto_reply_body.replace(/<[^>]*>/g, '').substring(0, 200)}</p>
                      </div>
                    )}
                    {email.needs_human && (
                      <p className="text-[10px] text-slate-400">Respondé desde Hostinger → info@agtisa.com</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
};
