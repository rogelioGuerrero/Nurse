import { useState, useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { getFamilyPrice } from '../data/standardRates';
import { CheckCircle2, XCircle, Clock, MapPin, Calendar, Star, User, Phone, Heart, Send, ChevronLeft } from 'lucide-react';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const PlanReview: FC = () => {
  const { careRequests, careOffers, nurses, profiles, currentUser } = useApp();

  const [accepted, setAccepted] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  // Find the most recent open/closed request for this user
  const myRequest = useMemo(() => {
    if (!currentUser) return null;
    return careRequests
      .filter(r => r.user_id === currentUser.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
  }, [careRequests, currentUser]);

  if (!myRequest) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-5">
        <div className="text-center space-y-3">
          <Clock className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-600">No tienes solicitudes activas.</p>
          <p className="text-xs text-slate-400">Cuando enviemos tu plan, podrás revisarlo aquí.</p>
        </div>
      </div>
    );
  }

  const familyPrice = getFamilyPrice(myRequest.specialization_needed);

  // Build slot details with accepted nurse info
  const slotDetails = myRequest.slots.map((slot, i) => {
    const offers = careOffers.filter(o => o.request_id === myRequest.id && o.slot_index === i);
    const acceptedOffer = offers.find(o => o.status === 'accepted');
    const nurse = acceptedOffer ? nurses.find(n => n.id === acceptedOffer.nurse_id) : null;
    const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
    const [sh, sm] = slot.start_time.split(':').map(Number);
    const [eh, em] = slot.end_time.split(':').map(Number);
    const hours = (eh + em / 60) - (sh + sm / 60);
    const price = hours * familyPrice;
    return { slot, nurse, nurseProfile, hours, price, hasNurse: !!nurse };
  });

  const allCovered = slotDetails.every(s => s.hasNurse);
  const totalHours = slotDetails.reduce((sum, s) => sum + s.hours, 0);
  const totalPrice = slotDetails.reduce((sum, s) => sum + s.price, 0);

  // Rejected state
  if (rejected) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Plan rechazado</h2>
          <p className="text-sm text-slate-500">Lamentamos que no haya funcionado. Puedes hacer una nueva solicitud cuando quieras.</p>
        </div>
      </div>
    );
  }

  // Submitted state (after accepting and filling complementary data)
  if (submitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">¡Trato cerrado!</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Tu plan ha sido confirmado. La enfermera se comunicará contigo pronto para coordinar la primera visita.
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-left space-y-1.5">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Datos confirmados</p>
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Paciente:</span> {patientName}</p>
              {patientAge && <p><span className="font-semibold">Edad:</span> {patientAge} años</p>}
              <p><span className="font-semibold">Contacto de emergencia:</span> {emergencyContact}</p>
              <p><span className="font-semibold">Total:</span> ${totalPrice.toFixed(0)} · {totalHours.toFixed(1)}h</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Accepted state: ask for complementary data
  if (accepted) {
    return (
      <div className="min-h-[80vh] flex flex-col px-5 py-6 max-w-md mx-auto w-full">
        <div className="space-y-5 flex-1">
          <button
            onClick={() => setAccepted(false)}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al plan
          </button>

          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Datos del paciente</h2>
            <p className="text-xs text-slate-500">Ya casi está. Solo necesitamos estos datos para cerrar el trato.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Nombre del paciente</label>
              <div className="relative">
                <Heart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  placeholder="Ej: Don Alberto Gómez"
                  className="w-full pl-9 pr-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Edad del paciente (opcional)</label>
              <input
                type="number"
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                placeholder="Ej: 78"
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Contacto de emergencia</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={emergencyContact}
                  onChange={e => setEmergencyContact(e.target.value)}
                  placeholder="Teléfono de un familiar o encargado"
                  className="w-full pl-9 pr-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setSubmitted(true)}
          disabled={patientName.trim().length < 3 || emergencyContact.trim().length < 8}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-4"
        >
          <Send className="h-5 w-5" />
          Confirmar trato
        </button>
      </div>
    );
  }

  // Plan review state (default)
  return (
    <div className="min-h-[80vh] flex flex-col px-5 py-6 max-w-md mx-auto w-full">
      <div className="flex-1 space-y-5">
        {/* Status banner */}
        {allCovered ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Tu plan está listo</h3>
              <p className="text-xs text-slate-500">Revisa el detalle y decide si aceptas.</p>
            </div>
          </div>
        ) : (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Plan en preparación</h3>
              <p className="text-xs text-slate-500">Aún estamos confirmando algunas fechas. Lo que ya está confirmado aparece abajo.</p>
            </div>
          </div>
        )}

        {/* Request summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-indigo-500" />
            <span className="font-semibold">{myRequest.location_name}</span>
          </div>
          <div className="text-xs text-slate-600">
            <span className="font-semibold">Condiciones:</span> {myRequest.patient_condition}
          </div>
          {myRequest.notes && (
            <div className="text-xs text-slate-500 italic">Nota: {myRequest.notes}</div>
          )}
        </div>

        {/* Day-by-day plan */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Detalle del plan</h3>
          {slotDetails.map((detail, i) => (
            <div
              key={i}
              className={`bg-white border rounded-2xl p-4 ${detail.hasNurse ? 'border-emerald-200' : 'border-slate-200'}`}
            >
              <div className="flex items-start gap-3">
                {/* Date badge */}
                <div className="flex-shrink-0 w-11 text-center">
                  <div className={`rounded-lg py-1 px-0.5 ${detail.hasNurse ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    <div className="text-sm font-black">
                      {new Date(detail.slot.date + 'T00:00:00').getDate()}
                    </div>
                    <div className="text-[9px] font-bold uppercase opacity-80">
                      {MONTH_NAMES[new Date(detail.slot.date + 'T00:00:00').getMonth()]}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 font-semibold">
                    {DAY_NAMES[new Date(detail.slot.date + 'T00:00:00').getDay()]} · {detail.slot.start_time} - {detail.slot.end_time} · {detail.hours.toFixed(1)}h
                  </div>

                  {detail.hasNurse && detail.nurse && detail.nurseProfile ? (
                    <div className="mt-1.5">
                      <div className="flex items-center gap-2">
                        <img src={detail.nurseProfile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-800 text-sm truncate">{detail.nurseProfile.full_name}</h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                              {detail.nurse.rating}
                            </span>
                            <span className="font-bold text-emerald-700">${detail.price.toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 mt-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <p className="text-xs font-semibold">En espera de confirmación</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Price summary */}
        {allCovered && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Total de horas</span>
              <span className="font-bold text-slate-700">{totalHours.toFixed(1)}h</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Tarifa por hora</span>
              <span className="font-bold text-slate-700">${familyPrice.toFixed(0)}/h</span>
            </div>
            <div className="border-t border-indigo-200 pt-2 flex justify-between items-center">
              <span className="text-sm font-bold text-slate-700">Total a pagar</span>
              <span className="text-xl font-black text-indigo-700">${totalPrice.toFixed(0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {allCovered && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setRejected(true)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <XCircle className="h-5 w-5" />
            Rechazar
          </button>
          <button
            onClick={() => setAccepted(true)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="h-5 w-5" />
            Aceptar plan
          </button>
        </div>
      )}
    </div>
  );
};
