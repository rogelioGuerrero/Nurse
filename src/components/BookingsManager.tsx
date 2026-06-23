/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, type FC } from 'react';
import { useApp, type ServiceLogType } from '../context/AppContext';
import { Booking, BookingStatus } from '../types';
import { groqChat } from '../lib/groq';
import {
  Calendar, User, CheckCircle2,
  PlusCircle, FileText, AlertTriangle,
  Phone, ChevronLeft, ChevronRight, MessageCircle,
  MapPin, LogIn, LogOut, Star, DollarSign
} from 'lucide-react';

const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const PHYSIO_SPECS = ['Fisioterapia Básica'];
const COMPANION_SPECS = ['Acompañamiento'];

export const BookingsManager: FC = () => {
  const {
    bookings,
    nurses,
    profiles,
    currentUser,
    updateBookingStatus,
    checkInBooking,
    checkOutBooking,
    careLogs,
    saveCareLog,
    nurseReviews,
    submitReview
  } = useApp();

  const isNurseView = currentUser?.role === 'nurse';

  // Check-in/out state
  const [checkInBookingId, setCheckInBookingId] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [reportedAddress, setReportedAddress] = useState('');

  // O(1) lookup maps to avoid repeated find() calls inside loops
  const profileMap = useMemo(() => {
    const map = new Map<string, typeof profiles[number]>();
    profiles.forEach(p => map.set(p.id, p));
    return map;
  }, [profiles]);

  const nurseMap = useMemo(() => {
    const map = new Map<string, typeof nurses[number]>();
    nurses.forEach(n => map.set(n.id, n));
    return map;
  }, [nurses]);

  // Care logs now managed by AppContext
  // Forms for visit report
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [formArrivalTime, setFormArrivalTime] = useState('07:00');
  const [formDepartureTime, setFormDepartureTime] = useState('15:00');
  const [formConditionArrival, setFormConditionArrival] = useState<'Bien' | 'Regular' | 'Deteriorado' | 'Crítico'>('Regular');
  const [formConditionDeparture, setFormConditionDeparture] = useState<'Mejoró' | 'Igual' | 'Empeoró'>('Igual');
  const [formActivities, setFormActivities] = useState<string[]>([]);
  const [formObservations, setFormObservations] = useState('');
  const [savingReport, setSavingReport] = useState(false);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState(0);

  // Calendario
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const handleCheckIn = async (bookingId: string) => {
    setGpsLoading(true);
    setGpsError(null);
    setCheckInBookingId(bookingId);

    if (!navigator.geolocation) {
      setGpsError('Tu dispositivo no soporta geolocalización');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const address = reportedAddress.trim() || 'Ubicación GPS registrada';
        const mismatch = !!reportedAddress.trim();
        try {
          await checkInBooking(bookingId, latitude, longitude, address, mismatch);
          setCheckInBookingId(null);
          setReportedAddress('');
        } catch {
          setGpsError('Error al registrar check-in');
        }
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(`No se pudo obtener tu ubicación: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCheckOut = async (bookingId: string) => {
    setGpsLoading(true);
    setGpsError(null);
    setCheckInBookingId(bookingId);

    if (!navigator.geolocation) {
      setGpsError('Tu dispositivo no soporta geolocalización');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await checkOutBooking(bookingId, latitude, longitude);
          setCheckInBookingId(null);
        } catch {
          setGpsError('Error al registrar check-out');
        }
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(`No se pudo obtener tu ubicación: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!currentUser) return null;

  const inferServiceType = (booking: Booking): ServiceLogType => {
    const nurse = nurseMap.get(booking.nurse_id);
    const specs = nurse?.specialization || [];
    if (specs.some(s => PHYSIO_SPECS.includes(s))) return 'physio';
    if (specs.some(s => COMPANION_SPECS.includes(s))) return 'companion';
    return 'clinical';
  };

  const handleOpenLogForm = (bookingId: string) => {
    const log = careLogs[bookingId];
    setEditingBookingId(bookingId);
    setFormArrivalTime(log?.arrivalTime || '07:00');
    setFormDepartureTime(log?.departureTime || '15:00');
    setFormConditionArrival(log?.patientConditionOnArrival || 'Regular');
    setFormConditionDeparture(log?.patientConditionOnDeparture || 'Igual');
    setFormActivities(log?.activities || []);
    setFormObservations(log?.observations || '');
  };

  const handleSaveLog = async (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    const sType = booking ? inferServiceType(booking) : 'clinical';
    const patientName = booking?.patient_name || 'el paciente';

    setSavingReport(true);

    // Prompt anti-alucinación: solo usa los datos proporcionados, no inventa
    const systemPrompt = 'Eres un redactor profesional de reportes de visita domiciliaria para enfermeras en El Salvador. Redacta un párrafo breve, claro y profesional basado EXCLUSIVAMENTE en los datos proporcionados. REGLAS ESTRICTAS: (1) No inventes información que no se te dio. (2) No agregues observaciones médicas, diagnósticos ni recomendaciones. (3) No interpretes los signos vitales ni sugieras tratamientos. (4) Si un campo está vacío, omítelo naturalmente, no lo menciones. (5) Usa tercera persona ("la enfermera llegó...", "el paciente..."). (6) Máximo 80 palabras. (7) Tono profesional, objetivo y empático. (8) No uses frases como "se recomienda" o "se sugiere".';

    const activitiesStr = formActivities.length > 0 ? formActivities.join(', ') : 'No se registraron actividades específicas';
    const observationsStr = formObservations.trim() || 'Sin observaciones adicionales';

    const userContent = `Redacta el reporte de visita con estos datos EXACTOS. No agregues nada más:
- Nombre del paciente: ${patientName}
- Hora de llegada: ${formArrivalTime}
- Hora de salida: ${formDepartureTime}
- Estado al llegar: ${formConditionArrival}
- Estado al retirarse: ${formConditionDeparture}
- Actividades realizadas: ${activitiesStr}
- Observaciones de la enfermera: ${observationsStr}`;

    let narrativeReport = '';
    try {
      narrativeReport = await groqChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        { temperature: 0.3, maxTokens: 200 }
      );
    } catch {
      // Si Groq falla, usar template simple sin alucinación
      narrativeReport = `La enfermera llegó a las ${formArrivalTime} y encontró a ${patientName} en estado ${formConditionArrival.toLowerCase()}. Durante el servicio ${formActivities.length > 0 ? 'realizó ' + formActivities.map(a => a.toLowerCase()).join(', ') : 'brindó atención general'}. Al retirarse a las ${formDepartureTime}, ${patientName} ${formConditionDeparture.toLowerCase()}.${formObservations.trim() ? ' ' + formObservations.trim() : ''}`;
    }

    saveCareLog(bookingId, {
      serviceType: sType,
      arrivalTime: formArrivalTime,
      departureTime: formDepartureTime,
      patientConditionOnArrival: formConditionArrival,
      patientConditionOnDeparture: formConditionDeparture,
      activities: formActivities,
      observations: formObservations,
      narrativeReport
    });
    setSavingReport(false);
    setEditingBookingId(null);
  };

  // Filter bookings according to active perspective
  const filteredBookings = bookings.filter(b => {
    if (isNurseView) {
      // Find current user's nurse record
      const myNurse = nurses.find(n => n.user_id === currentUser.id);
      return myNurse ? b.nurse_id === myNurse.id : false;
    } else {
      return b.user_id === currentUser.id;
    }
  });

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">Pendiente</span>;
      case 'confirmed':
        return <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">Confirmado</span>;
      case 'completed':
        return <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 w-fit"><CheckCircle2 className="h-3 w-3 text-emerald-600" />Completado</span>;
      case 'cancelled':
        return <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">Cancelado</span>;
      default:
        return null;
    }
  };

  // Calendario helpers
  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const days: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
  };

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    filteredBookings.forEach(b => {
      const existing = map.get(b.date) || [];
      existing.push(b);
      map.set(b.date, existing);
    });
    return map;
  }, [filteredBookings]);

  const prevMonth = () => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  // Ordenar bookings por fecha
  const sortedBookings = [...filteredBookings].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5" id="bookings-manager-root">
      
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Calendar className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">
            {isNurseView ? 'Mis Servicios' : 'Mis Solicitudes'}
          </h1>
          <p className="text-xs text-slate-500">
            {isNurseView ? 'Calendario y registro de tus visitas' : 'Visitas programadas para tus familiares'}
          </p>
        </div>
        <div className="ml-auto bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl text-center flex-shrink-0">
          <span className="text-[9px] text-indigo-500 font-bold block uppercase">Total</span>
          <span className="text-sm font-black text-indigo-700">{filteredBookings.length}</span>
        </div>
      </div>

      {/* SOS Emergency banner */}
      {filteredBookings.some(b => b.status === 'confirmed') && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-rose-900 space-y-1">
            <p className="font-bold uppercase tracking-wider">Emergencias SOS El Salvador</p>
            <div className="flex flex-wrap gap-1.5">
              <a href="tel:132" className="bg-rose-100 hover:bg-rose-200 text-rose-800 px-2 py-1 rounded-lg font-bold flex items-center gap-1"><Phone className="h-2.5 w-2.5" />SEM 132</a>
              <a href="tel:911" className="bg-rose-100 hover:bg-rose-200 text-rose-800 px-2 py-1 rounded-lg font-bold flex items-center gap-1"><Phone className="h-2.5 w-2.5" />PNC 911</a>
              <a href="tel:913" className="bg-rose-100 hover:bg-rose-200 text-rose-800 px-2 py-1 rounded-lg font-bold flex items-center gap-1"><Phone className="h-2.5 w-2.5" />Bomberos 913</a>
            </div>
          </div>
        </div>
      )}

      {/* Calendario mensual */}
      {filteredBookings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <span className="font-bold text-sm text-slate-800">
              {MONTH_FULL[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </span>
            <button type="button" onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
              <ChevronRight className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DAY_SHORT.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {getCalendarDays().map((dateStr, i) => {
              if (!dateStr) return <div key={i} />;
              const dayBookings = bookingsByDate.get(dateStr) || [];
              const hasBooked = dayBookings.length > 0;
              const hasConfirmed = dayBookings.some(b => b.status === 'confirmed');
              const hasCompleted = dayBookings.some(b => b.status === 'completed');
              const hasPending = dayBookings.some(b => b.status === 'pending');
              const dayNum = parseInt(dateStr.split('-')[2]);
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-0.5 relative ${
                    isToday ? 'ring-1 ring-indigo-200 bg-indigo-50' : ''
                  } ${hasBooked ? 'bg-slate-50' : ''}`}
                >
                  <span className={hasBooked ? 'text-slate-800' : 'text-slate-400'}>{dayNum}</span>
                  {hasBooked && (
                    <div className="flex gap-0.5">
                      {hasConfirmed && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                      {hasCompleted && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                      {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Leyenda */}
          <div className="flex items-center gap-3 text-[9px] text-slate-500 font-medium pt-1">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />Confirmado</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completado</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Pendiente</span>
          </div>
        </div>
      )}

      {/* Lista de servicios */}
      {sortedBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No hay servicios registrados.</p>
          <p className="text-xs text-slate-400 mt-1">Las visitas que aceptes aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBookings.map((b) => {
            const clientProfile = profileMap.get(b.user_id);
            const nurseRec = nurseMap.get(b.nurse_id);
            const nurseProfile = nurseRec ? profileMap.get(nurseRec.user_id) : null;
            const counterPartyName = isNurseView
              ? (clientProfile?.full_name ?? 'Familia')
              : (nurseProfile?.full_name ?? 'Enfermera');
            const counterPartyAvatar = isNurseView
              ? (clientProfile?.avatar_url ?? 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=200')
              : (nurseProfile?.avatar_url ?? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200');
            const log = careLogs[b.id];

            return (
              <div key={b.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {/* Card header */}
                <div className="p-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <img src={counterPartyAvatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-slate-800 text-sm truncate">{counterPartyName}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        <span>{b.date}</span>
                        <span className="text-slate-300">·</span>
                        <span>{b.start_time}-{b.end_time}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {getStatusBadge(b.status)}
                      <span className="text-xs font-black text-indigo-600">US$ {b.total_price}</span>
                    </div>
                  </div>
                </div>

                {/* Patient info */}
                <div className="px-3 py-2 bg-slate-50/70 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <User className="h-3 w-3 text-indigo-500" />
                    <span className="font-bold">{b.patient_name}</span>
                  </div>
                  <p className="text-slate-500 mt-0.5 pl-4 truncate">{b.patient_condition}</p>
                  {isNurseView && b.lat && b.lng && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    >
                      <MapPin className="h-3 w-3" />
                      Cómo llegar (Google Maps)
                    </a>
                  )}
                </div>

                {/* Reporte de visita */}
                {(b.status === 'confirmed' || b.status === 'completed') && (
                  <div className="border-t border-slate-100 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-indigo-600" />
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Reporte de Visita</span>
                      </div>
                    </div>

                    {editingBookingId === b.id ? (
                      /* FORMULARIO REPORTE */
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 text-xs">
                        {/* Horas */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hora de llegada</label>
                            <input type="time" value={formArrivalTime} onChange={e => setFormArrivalTime(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hora de salida</label>
                            <input type="time" value={formDepartureTime} onChange={e => setFormDepartureTime(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold" />
                          </div>
                        </div>

                        {/* Estado al llegar */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Estado del paciente al llegar</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {(['Bien', 'Regular', 'Deteriorado', 'Crítico'] as const).map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setFormConditionArrival(c)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                  formConditionArrival === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Estado al retirarse */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Estado del paciente al retirarse</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {(['Mejoró', 'Igual', 'Empeoró'] as const).map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setFormConditionDeparture(c)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                  formConditionDeparture === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Actividades */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Actividades realizadas</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {['Higiene', 'Alimentación', 'Movilización', 'Medicación', 'Acompañamiento', 'Curación', 'Fisioterapia', 'Otro'].map(a => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => setFormActivities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                  formActivities.includes(a) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
                                }`}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Observaciones */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Observaciones</label>
                          <textarea value={formObservations} onChange={e => setFormObservations(e.target.value)} rows={3} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold resize-none" placeholder="Notas de la visita..." />
                        </div>

                        <div className="flex gap-2 justify-end pt-1">
                          <button type="button" onClick={() => setEditingBookingId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer">Cancelar</button>
                          <button type="button" onClick={() => handleSaveLog(b.id)} disabled={savingReport} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer flex items-center gap-1.5 disabled:opacity-60">
                            {savingReport ? (
                              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Generando...</>
                            ) : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : log ? (
                      /* MOSTRAR REPORTE NARRATIVO */
                      <div className="space-y-2">
                        <div className="bg-indigo-50/40 border border-indigo-100/40 rounded-xl p-3 text-[11px] text-slate-700 leading-relaxed">
                          {log.narrativeReport || `La enfermera llegó a las ${log.arrivalTime} y encontró a ${b.patient_name} en estado ${log.patientConditionOnArrival.toLowerCase()}. Durante el servicio ${log.activities.length > 0 ? 'realizó ' + log.activities.map(a => a.toLowerCase()).join(', ') : 'brindó atención general'}. Al retirarse a las ${log.departureTime}, ${b.patient_name} ${log.patientConditionOnDeparture.toLowerCase()}.`}
                        </div>

                        {/* Botones */}
                        <div className="flex items-center gap-2">
                          {isNurseView ? (
                            <button onClick={() => handleOpenLogForm(b.id)} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100 cursor-pointer">Editar</button>
                          ) : (
                            nurseProfile?.phone && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <MessageCircle className="h-3 w-3 text-emerald-600" />
                                <span>Dudas sobre el reporte? Llama a la enfermera:</span>
                                <a href={`tel:${nurseProfile.phone}`} className="font-bold text-emerald-700 hover:underline">
                                  {nurseProfile.phone}
                                </a>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : (
                      /* SIN REPORTE */
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-[11px] space-y-2">
                        <p className="text-slate-500">No se ha registrado el reporte de visita.</p>
                        {isNurseView ? (
                          <button onClick={() => handleOpenLogForm(b.id)} className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer">
                            <PlusCircle className="h-3.5 w-3.5" />Registrar Reporte
                          </button>
                        ) : (
                          <p className="text-[9px] text-slate-400">La enfermera registrará el reporte durante la visita.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Nurse review - family only, completed bookings */}
                {b.status === 'completed' && !isNurseView && (() => {
                  const existingReview = nurseReviews.find(r => r.booking_id === b.id);
                  if (existingReview) {
                    return (
                      <div className="border-t border-slate-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Tu calificación</span>
                        </div>
                        <div className="flex items-center gap-0.5 mb-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <Star key={n} className={`h-3.5 w-3.5 ${n <= existingReview.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                          ))}
                        </div>
                        {existingReview.comment && (
                          <p className="text-[11px] text-slate-600 italic">"{existingReview.comment}"</p>
                        )}
                      </div>
                    );
                  }
                  if (reviewingBookingId === b.id) {
                    return (
                      <div className="border-t border-slate-100 p-3 space-y-3">
                        <div className="flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Califica a la enfermera</span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => setReviewRating(n)}
                              onMouseEnter={() => setHoverRating(n)}
                              onMouseLeave={() => setHoverRating(0)}
                              className="cursor-pointer"
                            >
                              <Star className={`h-6 w-6 transition ${(hoverRating || reviewRating) >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          rows={2}
                          placeholder="Comentario (opcional)..."
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setReviewingBookingId(null); setReviewRating(0); setReviewComment(''); }}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer"
                          >Cancelar</button>
                          <button
                            onClick={async () => {
                              if (reviewRating > 0) {
                                await submitReview(b.id, b.nurse_id, reviewRating, reviewComment.trim() || undefined);
                                setReviewingBookingId(null);
                                setReviewRating(0);
                                setReviewComment('');
                              }
                            }}
                            disabled={reviewRating === 0}
                            className="bg-amber-500 hover:bg-amber-400 text-white px-4 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer disabled:opacity-40"
                          >Enviar calificación</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="border-t border-slate-100 p-3">
                      <button
                        onClick={() => setReviewingBookingId(b.id)}
                        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 py-2 rounded-lg border border-amber-200 cursor-pointer"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Calificar enfermera
                      </button>
                    </div>
                  );
                })()}

                {/* Payment status badge */}
                {b.status === 'confirmed' && (
                  <div className={`px-3 py-2 border-t flex items-center gap-2 text-[10px] ${
                    b.payment_status === 'paid'
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                      : 'bg-slate-50 border-slate-100 text-slate-600'
                  }`}>
                    <DollarSign className="h-3.5 w-3.5" />
                    {b.payment_status === 'paid' ? (
                      <span className="font-bold">Pago confirmado</span>
                    ) : b.wants_invoice ? (
                      <span className="font-bold">{isNurseView ? 'Pago por transferencia a BienCuidar (con factura)' : 'Transfiere a la cuenta de BienCuidar'}</span>
                    ) : (
                      <span className="font-bold">{isNurseView ? 'Pendiente de pago — coordina con la familia' : 'Paga directamente a la enfermera'}</span>
                    )}
                  </div>
                )}

                {/* Cancellation policy note */}
                {b.status === 'confirmed' && !b.check_in_at && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[9px] text-slate-400 leading-relaxed">
                    {isNurseView
                      ? 'Si la familia cancela después de tu check-in, recibes el 50% del turno por movilización.'
                      : 'Puedes cancelar sin costo antes del check-in. Si cancelas después, se cobra el 50% por movilización de la enfermera.'
                    }
                  </div>
                )}

                {/* Check-in/out status banner */}
                {b.status === 'confirmed' && b.check_in_at && (
                  <div className="px-3 py-2 bg-emerald-50 border-t border-emerald-100 flex items-center gap-2 text-[10px] text-emerald-700">
                    <LogIn className="h-3.5 w-3.5" />
                    <span className="font-bold">Check-in:</span>
                    <span>{new Date(b.check_in_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</span>
                    {b.address_mismatch && (
                      <span className="text-amber-600 font-bold flex items-center gap-0.5">
                        <AlertTriangle className="h-3 w-3" />Dirección diferente
                      </span>
                    )}
                    {b.check_out_at && (
                      <>
                        <span className="text-slate-300">·</span>
                        <LogOut className="h-3.5 w-3.5" />
                        <span className="font-bold">Check-out:</span>
                        <span>{new Date(b.check_out_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Check-in address report (nurse only, before check-in) */}
                {b.status === 'confirmed' && isNurseView && !b.check_in_at && checkInBookingId === b.id && (
                  <div className="px-3 py-3 bg-amber-50 border-t border-amber-100 space-y-2">
                    <p className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      ¿Estás en la dirección correcta?
                    </p>
                    <p className="text-[10px] text-slate-500">Si la dirección real es diferente a la que dio la familia, repórtala aquí para tu protección.</p>
                    <input
                      type="text"
                      value={reportedAddress}
                      onChange={e => setReportedAddress(e.target.value)}
                      placeholder="Dirección real (opcional, solo si es diferente)"
                      className="w-full text-[11px] border border-amber-200 rounded-lg p-2 bg-white"
                    />
                    {gpsError && <p className="text-[10px] text-rose-600">{gpsError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCheckInBookingId(null); setReportedAddress(''); setGpsError(null); }}
                        className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg cursor-pointer"
                      >Cancelar</button>
                      <button
                        onClick={() => handleCheckIn(b.id)}
                        disabled={gpsLoading}
                        className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        {gpsLoading ? (
                          <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Obteniendo GPS...</>
                        ) : (
                          <><LogIn className="h-3 w-3" />Confirmar llegada</>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 p-3 border-t border-slate-100/60">
                  {b.status === 'pending' && (
                    <>
                      {isNurseView ? (
                        <>
                          <button onClick={() => updateBookingStatus(b.id, 'cancelled').catch(console.error)} className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg cursor-pointer">Rechazar</button>
                          <button onClick={() => updateBookingStatus(b.id, 'confirmed').catch(console.error)} className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg cursor-pointer">Aceptar</button>
                        </>
                      ) : (
                        <button onClick={() => updateBookingStatus(b.id, 'cancelled').catch(console.error)} className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                      )}
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <>
                      {isNurseView ? (
                        <>
                          {!b.check_in_at && checkInBookingId !== b.id && (
                            <button
                              onClick={() => setCheckInBookingId(b.id)}
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <LogIn className="h-3.5 w-3.5" />Check-in
                            </button>
                          )}
                          {b.check_in_at && !b.check_out_at && (
                            <button
                              onClick={() => handleCheckOut(b.id)}
                              disabled={gpsLoading}
                              className="text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              {gpsLoading ? (
                                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>GPS...</>
                              ) : (
                                <><LogOut className="h-3.5 w-3.5" />Check-out</>
                              )}
                            </button>
                          )}
                          {b.check_in_at && b.check_out_at && (
                            <button onClick={() => {
                              if (!careLogs[b.id]) {
                                handleOpenLogForm(b.id);
                              } else {
                                updateBookingStatus(b.id, 'completed').catch(console.error);
                              }
                            }} className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer">
                              <CheckCircle2 className="h-3.5 w-3.5" />{careLogs[b.id] ? 'Completar' : 'Registrar y Completar'}
                            </button>
                          )}
                        </>
                      ) : (
                        !b.check_in_at && (
                          <button onClick={() => updateBookingStatus(b.id, 'cancelled').catch(console.error)} className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                        )
                      )}
                    </>
                  )}
                  {b.status === 'cancelled' && (
                    <span className="text-[10px] text-slate-400 italic">Cancelada</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
