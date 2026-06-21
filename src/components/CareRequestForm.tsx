import { useState, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { getAllSpecializations } from '../data/standardRates';
import { MapPin, Calendar, Trash2, Stethoscope, CheckCircle2, Send, Crosshair, Loader2, ChevronLeft, ChevronRight, Phone, Check } from 'lucide-react';

interface CareRequestSlot {
  date: string;
  start_time: string;
  end_time: string;
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
  const { createCareRequest } = useApp();
  const specializations = getAllSpecializations();

  const [step, setStep] = useState(1);
  const [conditionTags, setConditionTags] = useState<string[]>([]);
  const [conditionExtra, setConditionExtra] = useState('');
  const [specializationNeeded, setSpecializationNeeded] = useState('');
  const [otherSpecialization, setOtherSpecialization] = useState('');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<CareRequestSlot[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [locationName, setLocationName] = useState('');
  const [phone, setPhone] = useState('');
  const [locating, setLocating] = useState(false);
  const [published, setPublished] = useState(false);

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

  const addSlot = (dateStr: string) => setSlots(prev => [...prev, { date: dateStr, start_time: '08:00', end_time: '14:00' }]);
  const removeSlot = (index: number) => setSlots(prev => prev.filter((_, i) => i !== index));
  const toggleDay = (dateStr: string) => {
    const exists = slots.findIndex(s => s.date === dateStr);
    if (exists >= 0) removeSlot(exists); else addSlot(dateStr);
  };
  const updateSlot = (index: number, field: keyof CareRequestSlot, value: string) => {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

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

  const canNextStep1 = conditionTags.length > 0 || conditionExtra.trim().length > 0;
  const canNextStep2 = slots.length > 0;
  const canSubmit = phone.trim().length >= 8 && locationName.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const condition = [...conditionTags, conditionExtra.trim()].filter(Boolean).join('; ');
    const finalSpec = otherSpecialization.trim() || specializationNeeded || 'Geriatría';
    createCareRequest({
      patient_name: 'Por confirmar',
      patient_condition: condition,
      specialization_needed: finalSpec,
      slots,
      location_name: locationName,
      notes: notes.trim() || undefined,
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
    setSlots([]);
    setLocationName('');
    setPhone('');
  };

  /* ── Published state ── */
  if (published) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Solicitud enviada</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Estamos buscando enfermeras que puedan ayudarte. Te contactaremos por WhatsApp al <span className="font-bold text-slate-700">{phone}</span> con tu plan de atención.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-left space-y-2">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Resumen</p>
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Condiciones:</span> {[...conditionTags, conditionExtra.trim()].filter(Boolean).join(', ')}</p>
              <p><span className="font-semibold">Especialización:</span> {otherSpecialization.trim() || specializationNeeded || 'Geriatría'}</p>
              <p><span className="font-semibold">Fechas:</span> {slots.length} día(s) seleccionado(s)</p>
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
  return (
    <div className="min-h-[80vh] flex flex-col px-5 py-6 max-w-md mx-auto w-full">

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
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿Qué necesita tu ser querido?</h2>
            <p className="text-xs text-slate-500">Selecciona una o más condiciones. Esto ayuda a las enfermeras a entender el cuidado requerido.</p>
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
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿Cuándo necesitas el cuidado?</h2>
            <p className="text-xs text-slate-500">Toca los días en el calendario. Luego ajusta las horas para cada día.</p>
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
                const slotIndex = slots.findIndex(s => s.date === dateStr);
                const selected = slotIndex >= 0;
                const past = isPast(dateStr);
                const today = isToday(dateStr);
                const dayNum = parseInt(dateStr.split('-')[2]);
                const slot = selected ? slots[slotIndex] : null;
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
                    {selected && slot && (
                      <span className="text-[8px] font-normal leading-none text-indigo-200">
                        {slot.start_time}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {slots.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600">Días seleccionados ({slots.length})</p>
              {slots.map((slot, i) => (
                <div key={i} className="flex items-center gap-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3">
                  <div className="flex-shrink-0 w-11 text-center">
                    <div className="bg-indigo-600 text-white rounded-lg py-1 px-0.5">
                      <div className="text-sm font-black">{new Date(slot.date + 'T00:00:00').getDate()}</div>
                      <div className="text-[9px] font-bold uppercase opacity-80">{MONTH_NAMES[new Date(slot.date + 'T00:00:00').getMonth()]}</div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-500 mb-1">{DAY_NAMES[new Date(slot.date + 'T00:00:00').getDay()]}</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={slot.start_time}
                        onChange={e => updateSlot(i, 'start_time', e.target.value)}
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-400 bg-white w-[72px]"
                      />
                      <span className="text-slate-400 text-xs">→</span>
                      <input
                        type="time"
                        value={slot.end_time}
                        onChange={e => updateSlot(i, 'end_time', e.target.value)}
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-400 bg-white w-[72px]"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlot(i)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
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
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿Dónde y cómo te contactamos?</h2>
            <p className="text-xs text-slate-500">Necesitamos tu ubicación y teléfono para enviarte el plan por WhatsApp.</p>
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
              <p className="text-[10px] text-slate-400 mt-1">Te enviaremos un WhatsApp con el link para ver tu plan de atención.</p>
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
              Enviar solicitud
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
