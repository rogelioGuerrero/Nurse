import { useState, useMemo, useEffect, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { SHIFTS, type ShiftType, type ExpectedDuration, type PatientAgeRange, type PatientGender, type CareRequest } from '../types';
import { MapPin, Calendar, Trash2, CheckCircle2, Send, Crosshair, Loader2, ChevronLeft, ChevronRight, Phone, Check, Sun, Moon, Clock, FileText, AlertCircle, RotateCcw, XCircle, Inbox, Heart, User } from 'lucide-react';
import { getTimeRemaining } from '../data/platformSettings';
import { triageRequest, type TriageResult } from '../lib/triage';

interface DaySelection {
  date: string;
  shifts: ShiftType[]; // which shifts are needed: day/night/full_day
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const HELP_NEEDS = [
  'Encamado / postrado',
  'Postoperatorio',
  'Post ACV (derrame)',
  'Alzheimer / demencia',
  'Cuidados paliativos',
  'Postparto',
  'Curaciones / heridas',
  'Sondas / catéteres',
  'Cuidado y compañía',
  'Medicación',
];

const AGE_RANGES: { value: PatientAgeRange; label: string }[] = [
  { value: '0-17', label: '0-17 años' },
  { value: '18-40', label: '18-40 años' },
  { value: '41-60', label: '41-60 años' },
  { value: '61-75', label: '61-75 años' },
  { value: '76+', label: '76+ años' },
];

const STEPS = [
  { num: 1, label: 'Necesidad' },
  { num: 2, label: 'Fechas' },
  { num: 3, label: 'Contacto' },
];

export const CareRequestForm: FC = () => {
  const { createCareRequest, currentUser, careRequests, careOffers, closeCareRequest, republisheCareRequest } = useApp();

  const [step, setStep] = useState(1);
  const [helpNeeds, setHelpNeeds] = useState<string[]>([]);
  const [helpNeedsOther, setHelpNeedsOther] = useState('');
  const [situation, setSituation] = useState('');
  const [patientAgeRange, setPatientAgeRange] = useState<PatientAgeRange | ''>('');
  const [patientGender, setPatientGender] = useState<PatientGender | ''>('');
  const [notes, setNotes] = useState('');
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [locationName, setLocationName] = useState(currentUser?.location_name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [locating, setLocating] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [published, setPublished] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [triageConfirmed, setTriageConfirmed] = useState(false);
  const [triageError, setTriageError] = useState(false);
  const [republishingRequest, setRepublishingRequest] = useState<CareRequest | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const toggleHelpNeed = (need: string) => {
    setHelpNeeds(prev =>
      prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]
    );
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsCoords({ lat: latitude, lng: longitude });
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await res.json();
          const addr = data.address || {};
          const parts = [
            addr.road || addr.neighbourhood,
            addr.suburb || addr.city_district,
            addr.city || addr.town || addr.village || addr.municipality,
          ].filter(Boolean);
          setLocationName(parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(','));
        } catch {
          setLocationName(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const addDay = (dateStr: string) => setSelectedDays(prev => [...prev, { date: dateStr, shifts: [] }]);
  const removeDay = (dateStr: string) => setSelectedDays(prev => prev.filter(d => d.date !== dateStr));
  const toggleDay = (dateStr: string) => {
    const exists = selectedDays.find(d => d.date === dateStr);
    if (exists) removeDay(dateStr); else addDay(dateStr);
  };
  const toggleShiftInDay = (dateStr: string, shift: ShiftType) => {
    setSelectedDays(prev => prev.map(d => {
      if (d.date !== dateStr) return d;
      const has = d.shifts.includes(shift);
      if (has) {
        return { ...d, shifts: d.shifts.filter(s => s !== shift) };
      }
      // full_day is mutually exclusive with day/night
      if (shift === 'full_day') {
        return { ...d, shifts: ['full_day'] };
      }
      // selecting day or night removes full_day
      return { ...d, shifts: [...d.shifts.filter(s => s !== 'full_day'), shift] };
    }));
  };
  const toggleAllShifts = (dateStr: string) => {
    setSelectedDays(prev => prev.map(d => {
      if (d.date !== dateStr) return d;
      const hasFullDay = d.shifts.includes('full_day');
      return { ...d, shifts: hasFullDay ? [] : ['full_day'] };
    }));
  };

  // Expand selected days into slot list for submission
  const slots = selectedDays.flatMap(d => d.shifts.map(s => ({ date: d.date, shift: s })));

  const SHIFT_ICONS: Record<ShiftType, typeof Sun> = { day: Sun, night: Moon, full_day: Clock };
  const SHIFT_LABELS: Record<ShiftType, string> = { day: 'Día', night: 'Noche', full_day: '24 horas' };

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

  const isToday = (dateStr: string) => dateStr === new Date().toISOString().split('T')[0];
  const isPast = (dateStr: string) => dateStr < new Date().toISOString().split('T')[0];
  const prevMonth = () => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const canNextStep1 = (helpNeeds.length > 0 || helpNeedsOther.trim().length > 0) && patientName.trim().length >= 3 && situation.trim().length >= 10;
  const canNextStep2 = selectedDays.length > 0 && selectedDays.every(d => d.shifts.length > 0);
  const canSubmit = locationName.trim().length > 0;

  const handleTriage = async () => {
    if (!canSubmit || !currentUser) return;
    setTriageLoading(true);
    setTriageError(false);
    setTriageConfirmed(false);

    const condition = [...helpNeeds, helpNeedsOther.trim()].filter(Boolean).join('; ');

    try {
      const result = await triageRequest({
        patient_name: patientName.trim(),
        patient_age_range: patientAgeRange || undefined,
        patient_gender: patientGender || undefined,
        help_needs: helpNeeds,
        help_needs_other: helpNeedsOther.trim() || undefined,
        situation: situation.trim(),
      });
      setTriageResult(result);
    } catch {
      setTriageError(true);
    }
    setTriageLoading(false);
  };

  const handleConfirmTriage = () => {
    if (!currentUser) return;
    const condition = [...helpNeeds, helpNeedsOther.trim()].filter(Boolean).join('; ');
    const finalSpec = triageResult?.specialization_suggested || 'Cuidado general';
    const dayCount = selectedDays.length;
    const deducedDuration: ExpectedDuration = dayCount <= 3 ? 'shifts' : dayCount <= 15 ? 'up_to_2_weeks' : 'up_to_1_month';

    createCareRequest({
      patient_name: patientName.trim(),
      patient_condition: condition,
      patient_age_range: patientAgeRange || undefined,
      patient_gender: patientGender || undefined,
      patient_data: triageResult?.patient_data,
      nurse_summary: triageResult?.nurse_summary,
      urgency: triageResult?.urgency,
      specialization_needed: finalSpec,
      slots,
      location_name: locationName,
      lat: gpsCoords?.lat,
      lng: gpsCoords?.lng,
      notes: notes.trim() || undefined,
      wants_invoice: wantsInvoice,
      expected_duration: deducedDuration,
    });
    setPublished(true);
  };

  const handleSubmit = () => {
    if (!canSubmit || !currentUser) return;
    if (republishingRequest) {
      const dayCount = selectedDays.length;
      const deducedDuration: ExpectedDuration = dayCount <= 3 ? 'shifts' : dayCount <= 15 ? 'up_to_2_weeks' : 'up_to_1_month';
      republisheCareRequest(republishingRequest.id, slots, deducedDuration);
      setPublished(true);
    } else {
      handleTriage();
    }
  };

  const handleNewRequest = () => {
    setPublished(false);
    setStep(1);
    setHelpNeeds([]);
    setHelpNeedsOther('');
    setSituation('');
    setPatientAgeRange('');
    setPatientGender('');
    setNotes('');
    setSelectedDays([]);
    setLocationName('');
    setPhone('');
    setGpsCoords(null);
    setPatientName('');
    setTriageResult(null);
    setTriageConfirmed(false);
    setTriageError(false);
    setRepublishingRequest(null);
  };

  const handleRepublishWithDates = (req: CareRequest) => {
    setRepublishingRequest(req);
    setPublished(false);
    setPatientName(req.patient_name);
    setPatientAgeRange(req.patient_age_range || '');
    setPatientGender(req.patient_gender || '');
    setNotes(req.notes || '');
    setWantsInvoice(req.wants_invoice);
    setLocationName(req.location_name);
    setGpsCoords(req.lat && req.lng ? { lat: req.lat, lng: req.lng } : null);
    setTriageResult(req.nurse_summary ? {
      specialization_suggested: req.specialization_needed,
      specialization_confidence: 1,
      urgency: req.urgency || 'medium',
      patient_data: req.patient_data || { diagnosis: '', autonomy: 'no reportado', allergies: 'no reportado', medications: 'no reportado', emergency_contact: 'no reportado' },
      nurse_summary: req.nurse_summary,
    } : null);
    setTriageConfirmed(false);
    setTriageError(false);
    setSelectedDays([]);
    setStep(2);
  };

  /* ── Hooks must run before any conditional return ── */
  const myRequests = useMemo(() => {
    if (!currentUser) return [];
    return careRequests
      .filter(r => r.user_id === currentUser.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [careRequests, currentUser]);

  const activeRequests = myRequests.filter(r => r.status === 'open');
  const finishedRequests = myRequests.filter(r => r.status === 'expired' || r.status === 'closed' || r.status === 'matched');

  /* ── Triage confirmation state ── */
  if (triageLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
            <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Analizando la solicitud...</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Estamos organizando la información para que las enfermeras puedan entender rápidamente lo que necesita tu ser querido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Triage result confirmation ── */
  if (triageResult && !triageConfirmed) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Esto es lo que entendimos</h2>
            <p className="text-xs text-slate-500">Revisa que la información sea correcta antes de publicar.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-left">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Resumen para la enfermera</p>
              <p className="text-sm text-slate-700 leading-relaxed">{triageResult.nurse_summary}</p>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Especialidad:</span>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">{triageResult.specialization_suggested}</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleConfirmTriage}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="h-5 w-5" />
              Es correcto, publicar solicitud
            </button>
            <button
              onClick={() => { setTriageResult(null); setStep(1); }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm cursor-pointer"
            >
              Editar información
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Triage error fallback ── */
  if (triageError) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">No pudimos procesar el resumen automático</h2>
            <p className="text-sm text-slate-500">No pasa nada. Podemos publicar la solicitud con la información que escribiste.</p>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleConfirmTriage}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="h-4 w-4" />
              Publicar de todas formas
            </button>
            <button
              onClick={() => { setTriageError(false); setStep(1); }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm cursor-pointer"
            >
              Volver a editar
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Published state ── */
  if (published) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Ya estamos buscando a la persona ideal</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Estamos conectando con enfermeras que puedan cuidar a tu ser querido. Recibirás una notificación cuando haya ofertas.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-left space-y-2">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Resumen</p>
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Necesita ayuda con:</span> {[...helpNeeds, helpNeedsOther.trim()].filter(Boolean).join(', ')}</p>
              <p><span className="font-semibold">Especialización:</span> {triageResult?.specialization_suggested || 'Cuidado general'}</p>
              <p><span className="font-semibold">Fechas:</span> {selectedDays.length} día(s), {slots.length} turno(s)</p>
              <p><span className="font-semibold">Ubicación:</span> {locationName}</p>
            </div>
          </div>
          <button
            onClick={handleNewRequest}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm cursor-pointer"
          >
            Hacer otra solicitud
          </button>
        </div>
      </div>
    );
  }

  /* ── Stepper form ── */
  const expiredRequests = myRequests.filter(r => r.status === 'expired' || r.status === 'closed');

  return (
    <div className="min-h-[80vh] flex flex-col px-5 py-6 max-w-md mx-auto w-full">

      {/* My active/expired requests */}
      {currentUser && (activeRequests.length > 0 || expiredRequests.length > 0) && (
        <div className="space-y-3 mb-6">
          {activeRequests.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Inbox className="h-3.5 w-3.5" />
                <span>Solicitudes activas</span>
              </div>
              {activeRequests.map(req => {
                const offersCount = careOffers.filter(o => o.request_id === req.id && o.status === 'pending').length;
                const timeLeft = getTimeRemaining(req.created_at);
                return (
                  <div key={req.id} className="bg-white border border-indigo-200 rounded-2xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{req.patient_condition}</p>
                        <p className="text-[10px] text-slate-500">{req.slots.length} turno(s) · {req.location_name}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        timeLeft === 'Expirado' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {timeLeft}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">
                        {offersCount > 0 ? `${offersCount} oferta(s) recibida(s)` : 'Esperando ofertas...'}
                      </span>
                      <button
                        onClick={() => closeCareRequest(req.id)}
                        className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="h-3 w-3" />
                        Cerrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {finishedRequests.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Finalizadas</span>
              </div>
              {finishedRequests.map(req => {
                const offersCount = careOffers.filter(o => o.request_id === req.id).length;
                const hadAcceptedOffer = careOffers.some(o => o.request_id === req.id && o.status === 'accepted');
                const isExpired = req.status === 'expired';
                const isMatched = req.status === 'matched';
                const statusLabel = isExpired ? 'Expirada' : isMatched ? 'Atendida' : 'Cerrada';
                const statusColor = isExpired ? 'bg-rose-100 text-rose-600' : isMatched ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500';
                const statusDesc = isExpired
                  ? (offersCount > 0 ? 'No decidiste a tiempo' : 'Sin respuesta de enfermeras')
                  : isMatched
                    ? 'Servicio completado'
                    : 'Cerrada manualmente';
                return (
                  <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-600 truncate">{req.patient_name}</p>
                        <p className="text-[10px] text-slate-400">{req.slots.length} turno(s) · {req.location_name}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{statusDesc}</span>
                      {hadAcceptedOffer || isMatched ? (
                        <button
                          onClick={() => handleNewRequest()}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Solicitar de nuevo
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRepublishWithDates(req)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Republicar con nuevas fechas
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stepper indicator */}
      <div className="flex items-center justify-between mb-8 px-2">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition ${
                step > s.num
                  ? 'bg-emerald-500 text-white'
                  : step === s.num
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-slate-100 text-slate-400'
              }`}>
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span className={`text-[10px] font-bold ${step >= s.num ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 -mt-5 transition ${step > s.num ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Republishing banner */}
      {republishingRequest && step >= 2 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-indigo-700">Republicando solicitud</p>
              <p className="text-[10px] text-indigo-500">{republishingRequest.patient_name} · {republishingRequest.specialization_needed}</p>
            </div>
          </div>
          <button
            onClick={() => handleNewRequest()}
            className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Step 1: Need */}
      {step === 1 && (
        <div className="flex-1 space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿A quién vamos a cuidar?</h2>
            <p className="text-xs text-slate-500">Cuéntanos sobre tu ser querido para encontrar la enfermera ideal.</p>
          </div>

          {/* Patient data */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Nombre del paciente</label>
              <div className="relative">
                <Heart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  placeholder="Ej: Don Alberto Gómez"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Edad</label>
                <select
                  value={patientAgeRange}
                  onChange={e => setPatientAgeRange(e.target.value as PatientAgeRange)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
                >
                  <option value="">Seleccionar</option>
                  {AGE_RANGES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Género</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPatientGender('male')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      patientGender === 'male'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Hombre
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientGender('female')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      patientGender === 'female'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Mujer
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Help needs */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-1">¿En qué necesita ayuda?</h3>
            <p className="text-xs text-slate-500 mb-3">Selecciona todas las que apliquen.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {HELP_NEEDS.map(need => (
              <button
                key={need}
                type="button"
                onClick={() => toggleHelpNeed(need)}
                className={`px-3 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
                  helpNeeds.includes(need)
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {need}
              </button>
            ))}
          </div>

          {/* Other */}
          <input
            type="text"
            value={helpNeedsOther}
            onChange={e => setHelpNeedsOther(e.target.value)}
            placeholder="Otro: escribe aquí si no está en la lista"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />

          {/* Situation textarea */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Cuéntanos sobre la situación de cuido o atención en salud</label>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="Ej: Mi papá tiene Alzheimer avanzado, está encamado. Toma pastillas para la presión. Necesita ayuda con el baño y darle sus medicinas a las horas correctas."
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">Puedes mencionar medicamentos, alergias o cualquier detalle útil.</p>
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canNextStep1}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            Continuar
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Step 2: Calendar */}
      {step === 2 && (
        <div className="flex-1 space-y-4 animate-fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿Qué días y turnos necesitas?</h2>
            <p className="text-xs text-slate-500">Elige los días en el calendario y los turnos: mañana, tarde, noche o cuidado completo de 24 horas.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            {/* Month navigation */}
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
                const daySel = selectedDays.find(d => d.date === dateStr);
                const selected = !!daySel;
                const past = isPast(dateStr);
                const today = isToday(dateStr);
                const dayNum = parseInt(dateStr.split('-')[2]);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={past}
                    onClick={() => toggleDay(dateStr)}
                    className={`aspect-square rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : today
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                          : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{dayNum}</span>
                    {selected && daySel && (
                      <span className="text-[7px] font-normal leading-none text-indigo-200">
                        {daySel.shifts.includes('full_day') ? '24h' : daySel.shifts.length + 't'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDays.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600">Días seleccionados ({selectedDays.length})</p>
              {selectedDays.map((daySel) => {
                const date = new Date(daySel.date + 'T00:00:00');
                const is24h = daySel.shifts.includes('full_day');
                return (
                  <div key={daySel.date} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-11 text-center">
                        <div className="bg-indigo-600 text-white rounded-lg py-1 px-0.5">
                          <div className="text-sm font-black">{date.getDate()}</div>
                          <div className="text-[9px] font-bold uppercase opacity-80">{MONTH_NAMES[date.getMonth()]}</div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-slate-500">{DAY_NAMES[date.getDay()]}</div>
                        {is24h && <div className="text-[10px] font-bold text-indigo-600 flex items-center gap-1"><Clock className="h-3 w-3" /> Cuidado 24 horas</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDay(daySel.date)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Shift selector */}
                    <div className="flex gap-1.5 pl-14">
                      {(Object.keys(SHIFTS) as ShiftType[]).map(shift => {
                        const Icon = SHIFT_ICONS[shift];
                        const isActive = daySel.shifts.includes(shift);
                        return (
                          <button
                            key={shift}
                            type="button"
                            onClick={() => toggleShiftInDay(daySel.date, shift)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                              isActive
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {SHIFT_LABELS[shift]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-slate-400">
              Toca un día en el calendario para agregarlo
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Notas adicionales (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Preferencias, indicaciones especiales, etc."
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-5 rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canNextStep2}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Continuar
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Contact */}
      {step === 3 && (
        <div className="flex-1 space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿Dónde se necesita la atención?</h2>
            <p className="text-xs text-slate-500">Confirma el lugar de atención. Puedes ajustarlo si el paciente está en otra ubicación.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Ubicación</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    value={locationName}
                    onChange={e => setLocationName(e.target.value)}
                    placeholder="Colonia, ciudad, dirección..."
                    className="w-full pl-9 pr-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  className="flex-shrink-0 px-3 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Usar mi ubicación"
                >
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                </button>
              </div>
              {currentUser?.location_name && (
                <p className="text-[10px] text-slate-400 mt-1.5">Dirección guardada de tu perfil. Ajústala si el paciente está en otro lugar.</p>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <Phone className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Teléfono de contacto</p>
                <p className="text-sm text-slate-700 font-medium">{phone || 'No configurado'}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-5 rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="h-5 w-5" />
              Publicar solicitud
            </button>
          </div>

          {/* Checkbox de factura */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={wantsInvoice}
              onChange={(e) => setWantsInvoice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-700">Necesito factura</span>
          </label>
          {wantsInvoice ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                <p className="text-xs font-bold text-indigo-800">Factura electrónica</p>
              </div>
              <p className="text-[10px] text-indigo-600 leading-relaxed">
                El pago se realiza por transferencia a BienCuidar. Te emitiremos comprobante legal (Factura o Crédito Fiscal) por el total del servicio, válido para deducir Impuesto sobre la Renta o reembolso de seguro médico. El total incluye el pago de la enfermera y nuestra tarifa de gestión fiscal y administrativa de US$5 (más IVA).
              </p>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-emerald-800">Pago directo a la enfermera</p>
              </div>
              <p className="text-[10px] text-emerald-600 leading-relaxed">
                El pago se realiza directamente a la enfermera, sin intermediación de BienCuidar. Ustedes acuerdan la forma de pago (efectivo, transferencia, etc.) al coordinar la visita. BienCuidar no emite factura ni tiene responsabilidad fiscal sobre el pago.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
