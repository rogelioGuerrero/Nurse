import { useState, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { getAllSpecializations, getFamilyPrice } from '../data/standardRates';
import { Heart, MapPin, Calendar, Clock, PlusCircle, Trash2, Stethoscope, Star, CheckCircle2, AlertCircle, User, ChevronRight, Send, Crosshair, Loader2 } from 'lucide-react';

interface CareRequestSlot {
  date: string;
  start_time: string;
  end_time: string;
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export const CareRequestForm: FC = () => {
  const { nurses, profiles, createCareRequest, setSelectedNurseId, setActiveTab, careRequests, careOffers } = useApp();
  const specializations = getAllSpecializations();

  const [patientName, setPatientName] = useState('');
  const [patientCondition, setPatientCondition] = useState('');
  const [conditionTags, setConditionTags] = useState<string[]>([]);
  const [conditionExtra, setConditionExtra] = useState('');
  const [specializationNeeded, setSpecializationNeeded] = useState('Geriatría');
  const [locationName, setLocationName] = useState('San Salvador');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<CareRequestSlot[]>([
    { date: '', start_time: '08:00', end_time: '14:00' }
  ]);

  const [published, setPublished] = useState(false);
  const [publishedRequestId, setPublishedRequestId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

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
            addr.state
          ].filter(Boolean);
          setLocationName(parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(',') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
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

  const familyPrice = getFamilyPrice(specializationNeeded);
  const profileMap = new Map(profiles.map(p => [p.id, p]));

  const addSlot = () => {
    setSlots(prev => [...prev, { date: '', start_time: '08:00', end_time: '14:00' }]);
  };

  const removeSlot = (index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof CareRequestSlot, value: string) => {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const COMMON_CONDITIONS = [
    'Alzheimer', 'Parkinson', 'Demencia', 'Accidente cerebrovascular (ACV)',
    'Postoperatorio', 'Fractura de cadera', 'Diabetes', 'Hipertensión',
    'Movilización reducida', 'Sondaje', 'Oxígeno permanente',
    'Demencia senil', 'Cuidados paliativos', 'Herida crónica',
    'Silla de ruedas', 'Encamado'
  ];

  const toggleConditionTag = (tag: string) => {
    setConditionTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handlePublish = () => {
    if (!patientName || slots.some(s => !s.date)) return;
    const condition = [
      ...conditionTags,
      conditionExtra.trim()
    ].filter(Boolean).join('; ');
    if (!condition) return;
    setPatientCondition(condition);
    const request = createCareRequest({
      patient_name: patientName,
      patient_condition: condition,
      specialization_needed: specializationNeeded,
      slots,
      location_name: locationName,
      notes
    });
    setPublishedRequestId(request.id);
    setPublished(true);
  };

  const handleNewRequest = () => {
    setPublished(false);
    setPublishedRequestId(null);
    setPatientName('');
    setPatientCondition('');
    setConditionTags([]);
    setConditionExtra('');
    setNotes('');
    setSlots([{ date: '', start_time: '08:00', end_time: '14:00' }]);
  };

  const getSlotOffers = (requestId: string, slotIndex: number) => {
    return careOffers.filter(o => o.request_id === requestId && o.slot_index === slotIndex);
  };

  const handleViewNurseProfile = (nurseId: string) => {
    setSelectedNurseId(nurseId);
    setActiveTab('nurse-detail');
  };

  const slotsWithHours = slots.map(s => {
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    return { ...s, hours: (eh + em / 60) - (sh + sm / 60) };
  });
  const totalHours = slotsWithHours.reduce((sum, s) => sum + s.hours, 0);
  const estimatedTotal = totalHours * familyPrice;

  const publishedRequest = publishedRequestId ? careRequests.find(r => r.id === publishedRequestId) : null;

  const coveredSlots = publishedRequest
    ? publishedRequest.slots.filter((_, i) => {
        const offers = getSlotOffers(publishedRequest.id, i);
        return offers.some(o => o.status === 'accepted');
      }).length
    : 0;

  const totalSlots = publishedRequest?.slots.length || 0;
  const allCovered = coveredSlots === totalSlots && totalSlots > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
          <Heart className="h-3.5 w-3.5" />
          Solicitud de Cuidado
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Publica tu necesidad de cuidado</h1>
        <p className="text-sm text-slate-500 max-w-xl mx-auto">
          Cuéntanos qué necesitas. Las enfermeras que pueden ayudarte te responderán.
        </p>
      </div>

      {/* Published state: waiting or results */}
      {published && publishedRequest ? (
        <div className="space-y-5">
          {/* Status banner */}
          {allCovered ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">¡Tu plan está listo!</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tenemos enfermera confirmada para todas tus fechas. Revisa el detalle abajo.
                </p>
              </div>
            </div>
          ) : coveredSlots > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Plan parcialmente confirmado</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {coveredSlots} de {totalSlots} fechas con enfermera. Las demás están en proceso.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Send className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Solicitud enviada</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Las enfermeras están revisando tu solicitud. Te responderán pronto.
                </p>
              </div>
            </div>
          )}

          {/* Day-by-day results */}
          <div className="space-y-3">
            {publishedRequest.slots.map((slot, i) => {
              const offers = getSlotOffers(publishedRequest.id, i);
              const acceptedOffer = offers.find(o => o.status === 'accepted');
              const acceptedNurse = acceptedOffer
                ? nurses.find(n => n.id === acceptedOffer.nurse_id)
                : null;
              const nurseProfile = acceptedNurse
                ? profileMap.get(acceptedNurse.user_id)
                : null;
              const [sh, sm] = slot.start_time.split(':').map(Number);
              const [eh, em] = slot.end_time.split(':').map(Number);
              const hours = (eh + em / 60) - (sh + sm / 60);
              const price = hours * familyPrice;

              return (
                <div
                  key={i}
                  className={`bg-white border rounded-2xl p-5 ${
                    acceptedNurse ? 'border-emerald-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Date badge */}
                    <div className="flex-shrink-0 w-14 text-center">
                      <div className={`text-white rounded-xl py-2 px-1 ${acceptedNurse ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                        <div className="text-[10px] font-bold uppercase">
                          {slot.date ? new Date(slot.date + 'T00:00:00').getDate() : '--'}
                        </div>
                        <div className="text-[9px] font-bold uppercase opacity-80">
                          {slot.date ? MONTH_NAMES[new Date(slot.date + 'T00:00:00').getMonth()] : '--'}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500 font-semibold mb-0.5">
                        {formatDate(slot.date)} · {slot.start_time} - {slot.end_time} · {hours.toFixed(1)}h
                      </div>

                      {acceptedNurse ? (
                        <>
                          <div className="flex items-start justify-between gap-3 mt-1">
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-800 truncate">
                                {nurseProfile?.full_name || 'Enfermera confirmada'}
                              </h3>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                                  {acceptedNurse.rating}
                                </span>
                                <span className="font-bold text-emerald-700">${price.toFixed(0)}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                              <CheckCircle2 className="h-3 w-3" />
                              Confirmada
                            </span>
                          </div>
                          <button
                            onClick={() => handleViewNurseProfile(acceptedNurse.id)}
                            className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                          >
                            <User className="h-3.5 w-3.5" />
                            Ver perfil de la enfermera
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400 mt-1">
                          <Clock className="h-4 w-4 flex-shrink-0" />
                          <p className="text-sm font-semibold">Esperando confirmación</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary + new request */}
          {allCovered && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-xl py-3">
                  <div className="text-lg font-black text-slate-800">{totalSlots}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Visitas</div>
                </div>
                <div className="bg-slate-50 rounded-xl py-3">
                  <div className="text-lg font-black text-slate-800">{totalHours.toFixed(1)}h</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Total horas</div>
                </div>
                <div className="bg-emerald-50 rounded-xl py-3">
                  <div className="text-lg font-black text-emerald-700">${estimatedTotal.toFixed(0)}</div>
                  <div className="text-[10px] text-emerald-500 font-bold uppercase">Total</div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleNewRequest}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <PlusCircle className="h-5 w-5" />
            Publicar nueva solicitud
          </button>
        </div>
      ) : (
        /* Form state */
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Patient info */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Heart className="h-4 w-4 text-indigo-600" />
              Datos del paciente
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Nombre del paciente</label>
                <input
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  placeholder="Ej: Don Alberto Gómez"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Ubicación</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      placeholder="San Salvador"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={locating}
                    className="flex-shrink-0 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Usar mi ubicación"
                  >
                    {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-600 block">Condición del paciente</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_CONDITIONS.map(cond => (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => toggleConditionTag(cond)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                      conditionTags.includes(cond)
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {cond}
                  </button>
                ))}
              </div>
              <textarea
                value={conditionExtra}
                onChange={e => setConditionExtra(e.target.value)}
                placeholder="Algo más que la enfermera deba saber? (opcional)"
                rows={2}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
              />
            </div>
          </div>

          {/* Specialization */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-indigo-600" />
              Especialización requerida
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {specializations.map(spec => (
                <button
                  key={spec}
                  onClick={() => setSpecializationNeeded(spec)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                    specializationNeeded === spec
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {spec}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule slots */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-600" />
                Fechas y horarios necesitados
              </h2>
              <button
                onClick={addSlot}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                Agregar día
              </button>
            </div>

            {slots.map((slot, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1 w-full">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Fecha {slots.length > 1 ? `#${i + 1}` : ''}</label>
                  <input
                    type="date"
                    value={slot.date}
                    onChange={e => updateSlot(i, 'date', e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Inicio</label>
                  <input
                    type="time"
                    value={slot.start_time}
                    onChange={e => updateSlot(i, 'start_time', e.target.value)}
                    className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Fin</label>
                  <input
                    type="time"
                    value={slot.end_time}
                    onChange={e => updateSlot(i, 'end_time', e.target.value)}
                    className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                {slots.length > 1 && (
                  <button
                    onClick={() => removeSlot(i)}
                    className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Notas adicionales (opcional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Preferencias, indicaciones especiales, etc."
                rows={2}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
              />
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={handlePublish}
            disabled={!patientName || (conditionTags.length === 0 && !conditionExtra.trim()) || slots.some(s => !s.date)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="h-5 w-5" />
            Enviar solicitud
          </button>
        </div>
      )}
    </div>
  );
};
