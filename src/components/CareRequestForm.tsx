import { useState, useEffect, useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { getAllSpecializations } from '../data/standardRates';
import { SHIFTS, type ShiftType, type ExpectedDuration } from '../types';
import { MapPin, Calendar, Trash2, Stethoscope, CheckCircle2, Send, Crosshair, Loader2, ChevronLeft, ChevronRight, Phone, Check, Sun, Sunset, Moon, Clock, X, FileText, AlertCircle, RotateCcw, XCircle, Inbox, Heart } from 'lucide-react';
import { AuthForm } from './AuthForm';
import { getTimeRemaining } from '../data/platformSettings';

interface DaySelection {
  date: string;
  shifts: ShiftType[]; // which shifts are needed: morning/afternoon/night. All 3 = 24h
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const COMMON_CONDITIONS = [
  'Alzheimer', 'Parkinson', 'Demencia', 'ACV (Derrame)',
  'Postoperatorio', 'Fractura de cadera', 'Diabetes', 'Hipertensión',
  'Movilización reducida', 'Sondaje', 'Oxígeno permanente',
  'Cuidados paliativos', 'Herida crónica',
  'Silla de ruedas', 'Encamado', 'Acompañamiento'
];

const STEPS = [
  { num: 1, label: 'Necesidad' },
  { num: 2, label: 'Fechas' },
  { num: 3, label: 'Contacto' },
];

export const CareRequestForm: FC = () => {
  const { createCareRequest, currentUser, careRequests, careOffers, closeCareRequest, republisheCareRequest } = useApp();
  const specializations = getAllSpecializations();

  const [step, setStep] = useState(1);
  const [conditionTags, setConditionTags] = useState<string[]>([]);
  const [conditionExtra, setConditionExtra] = useState('');
  const [specializationNeeded, setSpecializationNeeded] = useState('');
  const [otherSpecialization, setOtherSpecialization] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [locationName, setLocationName] = useState('');
  const [phone, setPhone] = useState('');
  const [locating, setLocating] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [published, setPublished] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Restore form data from localStorage if available
  useEffect(() => {
    const draft = localStorage.getItem('biencuidar_care_request_draft');
    if (draft) {
      try {
        const formData = JSON.parse(draft);
        setConditionTags(formData.conditionTags || []);
        setConditionExtra(formData.conditionExtra || '');
        setSpecializationNeeded(formData.specializationNeeded || '');
        setOtherSpecialization(formData.otherSpecialization || '');
        setNotes(formData.notes || '');
        setSelectedDays(formData.selectedDays || []);
        setLocationName(formData.locationName || '');
        setPhone(formData.phone || '');
        setPatientName(formData.patientName || '');
        // Clear the draft after restoring
        localStorage.removeItem('biencuidar_care_request_draft');
      } catch (err) {
        console.error('Error restoring form data:', err);
      }
    }
  }, []);

  const toggleConditionTag = (tag: string) => {
    setConditionTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
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
      return { ...d, shifts: has ? d.shifts.filter(s => s !== shift) : [...d.shifts, shift] };
    }));
  };
  const toggleAllShifts = (dateStr: string) => {
    setSelectedDays(prev => prev.map(d => {
      if (d.date !== dateStr) return d;
      const allThree = d.shifts.length === 3;
      return { ...d, shifts: allThree ? [] : ['morning', 'afternoon', 'night'] };
    }));
  };

  // Expand selected days into slot list for submission
  const slots = selectedDays.flatMap(d => d.shifts.map(s => ({ date: d.date, shift: s })));

  const SHIFT_ICONS: Record<ShiftType, typeof Sun> = { morning: Sun, afternoon: Sunset, night: Moon };
  const SHIFT_LABELS: Record<ShiftType, string> = { morning: 'Mañana', afternoon: 'Tarde', night: 'Noche' };

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

  const canNextStep1 = (conditionTags.length > 0 || conditionExtra.trim().length > 0) && patientName.trim().length >= 3;
  const canNextStep2 = selectedDays.length > 0 && selectedDays.every(d => d.shifts.length > 0);
  const canSubmit = phone.trim().length >= 8 && locationName.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    
    // Check if user is logged in
    if (!currentUser) {
      // Save form data to localStorage before showing registration modal
      const formData = {
        conditionTags,
        conditionExtra,
        specializationNeeded,
        otherSpecialization,
        notes,
        selectedDays,
        locationName,
        phone,
        patientName
      };
      localStorage.setItem('biencuidar_care_request_draft', JSON.stringify(formData));
      setShowRegisterModal(true);
      return;
    }
    
    const condition = [...conditionTags, conditionExtra.trim()].filter(Boolean).join('; ');
    const finalSpec = otherSpecialization.trim() || specializationNeeded || 'Geriatría';
    // Deduce expected_duration from number of selected days
    const dayCount = selectedDays.length;
    const deducedDuration: ExpectedDuration = dayCount <= 3 ? 'shifts' : dayCount <= 15 ? 'up_to_2_weeks' : 'up_to_1_month';

    createCareRequest({
      patient_name: patientName.trim(),
      patient_condition: condition,
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

  const handleNewRequest = () => {
    setPublished(false);
    setStep(1);
    setConditionTags([]);
    setConditionExtra('');
    setSpecializationNeeded('');
    setOtherSpecialization('');
    setNotes('');
    setSelectedDays([]);
    setLocationName('');
    setPhone('');
    setGpsCoords(null);
    setPatientName('');
  };

  /* ── Hooks must run before any conditional return ── */
  const myRequests = useMemo(() => {
    if (!currentUser) return [];
    return careRequests
      .filter(r => r.user_id === currentUser.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [careRequests, currentUser]);

  const activeRequests = myRequests.filter(r => r.status === 'open');

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
              Estamos conectando con enfermeras que puedan cuidar a tu ser querido. Recibirás una notificación cuando haya ofertas. Si es necesario, te contactaremos por WhatsApp al <span className="font-bold text-slate-700">{phone}</span>.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-left space-y-2">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Resumen</p>
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Condiciones:</span> {[...conditionTags, conditionExtra.trim()].filter(Boolean).join(', ')}</p>
              <p><span className="font-semibold">Especialización:</span> {otherSpecialization.trim() || specializationNeeded || 'Geriatría'}</p>
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

          {expiredRequests.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Finalizadas</span>
              </div>
              {expiredRequests.map(req => {
                const offersCount = careOffers.filter(o => o.request_id === req.id).length;
                const isExpired = req.status === 'expired';
                return (
                  <div key={req.id} className={`bg-slate-50 border rounded-2xl p-3 space-y-2 ${isExpired ? 'border-slate-200' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-600 truncate">{req.patient_condition}</p>
                        <p className="text-[10px] text-slate-400">{req.slots.length} turno(s) · {req.location_name}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        isExpired ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {isExpired ? 'Expirada' : 'Cerrada'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {isExpired
                          ? (offersCount > 0 ? 'No decidiste a tiempo' : 'Sin respuesta de enfermeras')
                          : 'Cerrada manualmente'}
                      </span>
                      {isExpired && (
                        <button
                          onClick={() => republisheCareRequest(req.id)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Republicar
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

      {/* Step 1: Need */}
      {step === 1 && (
        <div className="flex-1 space-y-5 animate-fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿A quién vamos a cuidar?</h2>
            <p className="text-xs text-slate-500">Cuéntanos el nombre del paciente y la condición médica para encontrar la enfermera ideal.</p>
          </div>

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

          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-1">Selecciona la enfermedad médica</h3>
            <p className="text-xs text-slate-500 mb-3">Esto nos ayuda a encontrar la enfermera con la especialidad adecuada.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {COMMON_CONDITIONS.map(cond => (
              <button
                key={cond}
                type="button"
                onClick={() => toggleConditionTag(cond)}
                className={`px-3 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
                  conditionTags.includes(cond)
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cond}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">¿Algo más que debamos saber? (opcional)</label>
            <textarea
              value={conditionExtra}
              onChange={e => setConditionExtra(e.target.value)}
              placeholder="Ej: Acompañar a fisioterapia, ayudar con baño, etc."
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 block flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 text-indigo-500" />
              Especialización requerida (opcional)
            </label>
            <div className="flex flex-wrap gap-2">
              {specializations.map(spec => (
                <button
                  key={spec}
                  type="button"
                  onClick={() => setSpecializationNeeded(specializationNeeded === spec ? '' : spec)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    specializationNeeded === spec
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {spec}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={otherSpecialization}
              onChange={e => setOtherSpecialization(e.target.value)}
              placeholder="¿No encuentras el servicio? Escríbelo aquí"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
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
                        {daySel.shifts.length === 3 ? '24h' : daySel.shifts.length + 't'}
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
                const is24h = daySel.shifts.length === 3;
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
                        {is24h && <div className="text-[10px] font-bold text-indigo-600 flex items-center gap-1"><Clock className="h-3 w-3" /> Cuido 24 horas (3 enfermeras)</div>}
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
            <h2 className="text-lg font-bold text-slate-900 mb-1">Lugar de atención y teléfono para contactarte</h2>
            <p className="text-xs text-slate-500">Tu ubicación nos ayuda a encontrar enfermeras cercanas. Tu teléfono es para que el administrador te contacte si es necesario.</p>
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
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Teléfono / WhatsApp</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Ej: 7777 1234"
                  className="w-full pl-9 pr-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Te avisaremos por notificación y WhatsApp cuando haya novedades.</p>
            </div>
          </div>

          {/* Invoice preference */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
              <p className="text-xs font-bold text-slate-700">¿Necesitas factura electrónica?</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWantsInvoice(false)}
                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  !wantsInvoice
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Sin factura
              </button>
              <button
                type="button"
                onClick={() => setWantsInvoice(true)}
                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  wantsInvoice
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Con factura
              </button>
            </div>
            {wantsInvoice ? (
              <p className="text-[10px] text-indigo-600 leading-relaxed">
                El pago se realiza por transferencia a BienCuidar. Te emitiremos comprobante legal (Factura o Crédito Fiscal) por el total del servicio, válido para deducir Impuesto sobre la Renta o reembolso de seguro médico. El total incluye el pago de la enfermera y nuestra tarifa de gestión fiscal y administrativa de US$5 (más IVA).
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Pago directo a la enfermera. BienCuidar no emite factura ni tiene responsabilidad fiscal.
              </p>
            )}
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
              Enviar solicitud
            </button>
          </div>
        </div>
      )}
      
      {/* Registration Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Regístrate para enviar solicitud</h2>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4">
              <AuthForm
                mode="register"
                role="family"
                onBack={() => setShowRegisterModal(false)}
                onSuccess={() => {
                  setShowRegisterModal(false);
                  window.location.reload();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
