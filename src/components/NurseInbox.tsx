import { useMemo, useState, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { calculateNurseNet } from '../data/standardRates';
import type { CareRequest, Nurse, Profile, CareOffer } from '../types';
import { SHIFTS, type ShiftType, type WeekDay } from '../types';
import { Inbox, Calendar, Clock, Heart, MapPin, CheckCircle2, XCircle, AlertCircle, User, Sun, Moon, FileText, Send } from 'lucide-react';
import { FamilyTrustBadge } from './FamilyTrustBadge';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function getProfileSuggestions(nurse: Nurse | undefined, offer: CareOffer | undefined): string[] {
  if (!nurse) return [];
  const suggestions: string[] = [];

  // 1. Bio vacía o muy corta
  if (!nurse.bio || nurse.bio.trim().length < 30) {
    suggestions.push('Completa tu biografía. Cuéntale a las familias sobre tu experiencia y estilo de cuidado.');
  }

  // 2. Sin certificaciones (aparte del CSSP obligatorio)
  if (!nurse.certifications || nurse.certifications.length === 0) {
    suggestions.push('Agrega certificaciones a tu perfil. Refuerzan tu credibilidad profesional.');
  }

  // 3. Mensaje genérico al ofertar
  if (offer && (!offer.message || offer.message.trim().length < 20 || offer.message.includes('Confirmo disponibilidad'))) {
    suggestions.push('Escribe un mensaje personalizado al ofertar. La conexión humana marca la diferencia.');
  }

  // 4. Pocas especialidades
  if (nurse.specialization.length < 2) {
    suggestions.push('Agrega más especialidades a tu perfil para coincidir con más solicitudes.');
  }

  // 5. Poca disponibilidad (menos de 3 días o 2 turnos)
  if (nurse.available_days.length < 3 || nurse.available_shifts.length < 2) {
    suggestions.push('Amplía tus días y turnos disponibles para recibir más solicitudes.');
  }

  // 6. Pocas reseñas → sugerir acumular reputación
  if (nurse.review_count < 3) {
    suggestions.push('Acumula buenas reseñas completando servicios. Tu reputación es tu mejor carta de presentación.');
  }

  // 7. Si todo está bien, sugerir tarifa como último recurso
  if (suggestions.length === 0) {
    suggestions.push('Ajustar tu tarifa puede ayudarte a ser más competitiva en próximas ofertas.');
  }

  // Devolver máximo 2 sugerencias para no abrumar
  return suggestions.slice(0, 2);
}

export const NurseInbox: FC = () => {
  const { careRequests, careOffers, nurses, profiles, currentUser, createCareOffer, withdrawCareOffer, familyReviews } = useApp();

  // Modal de ajuste de tarifa
  const [acceptModal, setAcceptModal] = useState<{ request: CareRequest; slotIndex: number } | null>(null);
  const [offerRate, setOfferRate] = useState<number>(0);
  const [offerMessage, setOfferMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'available' | 'my-offers'>('available');

  // Find the current nurse's record
  const myNurse = useMemo(
    () => nurses.find(n => n.user_id === currentUser?.id),
    [nurses, currentUser]
  );

  // Nurse availability sets (empty = no filter, e.g. nurse hasn't configured yet)
  const nurseShifts = useMemo(() => new Set(myNurse?.available_shifts || []), [myNurse]);
  const nurseDays = useMemo(() => new Set(myNurse?.available_days || []), [myNurse]);
  const nurseSpecs = useMemo(() => new Set(myNurse?.specialization || []), [myNurse]);

  // Check if nurse's assignment_availability is compatible with request's expected_duration
  const isDurationCompatible = (req: CareRequest): boolean => {
    const nurseAvail: string = myNurse?.assignment_availability || 'shifts_only';
    const duration: string = req.expected_duration || 'shifts';
    if (nurseAvail === 'flexible') return true;
    if (duration === 'unsure' || duration === 'shifts') return true;
    if (duration === 'up_to_2_weeks') {
      return ['up_to_2_weeks', 'up_to_1_month', 'flexible'].includes(nurseAvail);
    }
    if (duration === 'up_to_1_month') {
      return ['up_to_1_month', 'flexible'].includes(nurseAvail);
    }
    return true;
  };

  // Check if a specific slot matches nurse's shift and day availability
  const isSlotAvailable = (slot: { date: string; shift: ShiftType }): boolean => {
    const shiftOk = nurseShifts.size === 0 || nurseShifts.has(slot.shift);
    const dayOk = nurseDays.size === 0 || nurseDays.has(new Date(slot.date + 'T00:00:00').getDay() as WeekDay);
    return shiftOk && dayOk;
  };

  // Requests where this nurse hasn't offered — all open requests, sorted by most recent
  // (soft filter: show everything, mark non-matching slots visually)
  const availableRequests = useMemo(() => {
    if (!myNurse) return [];
    return careRequests
      .filter(req => req.status === 'open')
      .filter(req => !careOffers.some(o => o.request_id === req.id && o.nurse_id === myNurse.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [careRequests, careOffers, myNurse]);

  // This nurse's offers — excluding accepted (go to Servicios) and declined/rejected older than 48h
  const myOffersList = useMemo(() => {
    if (!myNurse) return [];
    const now = Date.now();
    return careOffers
      .filter(o => o.nurse_id === myNurse.id)
      .filter(o => {
        if (o.status === 'accepted') return false;
        if (o.status === 'declined' || o.status === 'rejected') {
          const ageHours = (now - new Date(o.created_at).getTime()) / (1000 * 60 * 60);
          if (ageHours > 48) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [careOffers, myNurse]);

  // Map family profiles for display
  const profileMap = useMemo(
    () => new Map(profiles.map(p => [p.id, p])),
    [profiles]
  );

  // Check if nurse already offered for a specific slot
  const hasOffered = (requestId: string, slotIndex: number): boolean => {
    return careOffers.some(
      o => o.request_id === requestId &&
      o.nurse_id === myNurse?.id &&
      o.slot_index === slotIndex
    );
  };

  // Check if nurse already accepted ANY slot on the same date (double-booking prevention)
  const isDateBooked = (dateStr: string): boolean => {
    return careOffers.some(o => {
      if (o.nurse_id !== myNurse?.id) return false;
      if (o.status !== 'accepted') return false;
      const req = careRequests.find(r => r.id === o.request_id);
      if (!req) return false;
      const slot = req.slots[o.slot_index];
      return slot?.date === dateStr;
    });
  };

  const getOfferForSlot = (requestId: string, slotIndex: number) => {
    return careOffers.find(
      o => o.request_id === requestId &&
      o.nurse_id === myNurse?.id &&
      o.slot_index === slotIndex
    );
  };

  const handleAccept = (request: CareRequest, slotIndex: number) => {
    if (!myNurse) return;
    setAcceptModal({ request, slotIndex });
    setOfferRate(myNurse.shift_rate);
    setOfferMessage('');
  };

  const handleConfirmOffer = () => {
    if (!acceptModal || !myNurse) return;
    const { request, slotIndex } = acceptModal;
    createCareOffer({
      request_id: request.id,
      nurse_id: myNurse.id,
      slot_index: slotIndex,
      offered_rate: offerRate,
      message: offerMessage.trim() || 'Confirmo disponibilidad para esta visita.'
    });
    setAcceptModal(null);
  };

  if (!myNurse) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-700">No tienes perfil de enfermera activo.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Inbox className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Familias que te necesitan</h1>
          <p className="text-xs text-slate-500">Revisa las solicitudes disponibles y gestiona tus ofertas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('available')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'available' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Solicitudes{availableRequests.length > 0 && ` (${availableRequests.length})`}
        </button>
        <button
          onClick={() => setActiveTab('my-offers')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'my-offers' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Mis ofertas{myOffersList.length > 0 && ` (${myOffersList.length})`}
        </button>
      </div>

      {activeTab === 'available' && (
      availableRequests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Todo tranquilo por ahora.</p>
          <p className="text-xs text-slate-400 mt-1">Cuando una familia busque cuidado que coincida con tu especialidad, lo verás aquí.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {availableRequests.map(req => {
            const familyProfile = profileMap.get(req.user_id);
            return (
              <div key={req.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {/* Request header */}
                <div className="p-4 border-b border-slate-100 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={familyProfile?.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 text-sm truncate">{familyProfile?.full_name || 'Familia'}</h3>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{req.location_name}</span>
                      </div>
                      <div className="mt-1">
                        <FamilyTrustBadge familyProfile={familyProfile} familyReviews={familyReviews} variant="compact" />
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full flex-shrink-0">
                      {req.specialization_needed}
                    </span>
                  </div>

                  {/* Patient info */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <Heart className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                      <span className="font-bold text-slate-700">{req.patient_condition}</span>
                    </div>
                    {req.notes && (
                      <p className="text-xs text-slate-500 italic pl-5">Nota: {req.notes}</p>
                    )}
                    {/* Invoice preference badge */}
                    <div className="pt-1">
                      {req.wants_invoice ? (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full border border-indigo-100">
                          <FileText className="h-3 w-3" />
                          Con factura — BienCuidar retiene ISR 10%, ajusta tu tarifa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-100">
                          Pago directo sin factura
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Slots - each day individually */}
                <div className="divide-y divide-slate-100">
                  {req.slots.map((slot, idx) => {
                    const offer = getOfferForSlot(req.id, idx);
                    const responded = hasOffered(req.id, idx);
                    const dateConflict = isDateBooked(slot.date) && !responded;
                    const slotAvail = isSlotAvailable(slot);
                    const shiftInfo = SHIFTS[slot.shift as ShiftType] || SHIFTS.day;
                    const nurseRate = offer ? Number(offer.offered_rate) : (myNurse.shift_rate || 25);
                    const wantsInvoicing = req.wants_invoice;
                    const payout = calculateNurseNet(nurseRate, wantsInvoicing);

                    const SHIFT_ICON: Record<ShiftType, typeof Sun> = { day: Sun, night: Moon, full_day: Clock };
                    const ShiftIcon = SHIFT_ICON[slot.shift as ShiftType] || Sun;

                    return (
                      <div key={idx} className="p-3 space-y-2">
                        {/* Top row: date + shift info */}
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-11 text-center">
                            <div className="bg-slate-100 rounded-lg py-1 px-0.5">
                              <div className="text-sm font-black text-slate-700">
                                {slot.date ? new Date(slot.date + 'T00:00:00').getDate() : '--'}
                              </div>
                              <div className="text-[9px] font-bold uppercase text-slate-400">
                                {slot.date ? MONTH_NAMES[new Date(slot.date + 'T00:00:00').getMonth()] : '--'}
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-700">
                              {formatDate(slot.date)}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <ShiftIcon className="h-3 w-3" />
                                {shiftInfo.label}
                              </span>
                              <span className="font-bold text-indigo-600">${payout.toFixed(2)} neto</span>
                            </div>
                          </div>
                        </div>

                        {dateConflict && (
                          <div className="text-[10px] font-bold text-amber-600 flex items-center gap-1 pl-14">
                            <AlertCircle className="h-3 w-3" />
                            Ya tienes una visita aceptada este día
                          </div>
                        )}

                        {!slotAvail && !responded && (
                          <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 pl-14">
                            <Clock className="h-3 w-3" />
                            Turno no habitual para ti
                          </div>
                        )}

                        {/* Action buttons - full width row */}
                        {!responded ? (
                          <div className="flex gap-2 pl-14">
                            <button
                              onClick={() => handleAccept(req, idx)}
                              disabled={dateConflict}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white text-xs font-bold py-2 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ofertar
                            </button>
                          </div>
                        ) : offer?.status === 'accepted' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 pl-14">
                            <CheckCircle2 className="h-4 w-4" />
                            Confirmado
                          </div>
                        ) : offer?.status === 'pending' ? (
                          <div className="flex items-center justify-between pl-14">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600">
                              <CheckCircle2 className="h-4 w-4" />
                              Ofreciste tu servicio
                            </div>
                            <button
                              onClick={() => withdrawCareOffer(offer.id)}
                              className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="h-3 w-3" />
                              Retirar
                            </button>
                          </div>
                        ) : offer?.status === 'declined' ? (
                          <div className="pl-14 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                              <Heart className="h-4 w-4" />
                              La familia eligió otra enfermera
                            </div>
                            {getProfileSuggestions(myNurse, offer).map((s, i) => (
                              <p key={i} className="text-[10px] text-slate-400 leading-relaxed flex items-start gap-1">
                                <span className="text-indigo-300 flex-shrink-0">•</span>
                                <span>{s}</span>
                              </p>
                            ))}
                          </div>
                        ) : offer?.status === 'rejected' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 pl-14">
                            <XCircle className="h-4 w-4" />
                            Retiraste tu oferta
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )
      )}

      {activeTab === 'my-offers' && (() => {
        if (myOffersList.length === 0) {
          return (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <Send className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No has enviado ofertas aún.</p>
              <p className="text-xs text-slate-400 mt-1">Cuando ofertes a una familia, podrás seguir el estado aquí.</p>
            </div>
          );
        }

        const getOfferStatusInfo = (offer: typeof myOffersList[0]) => {
          const req = careRequests.find(r => r.id === offer.request_id);
          if (!req) return { label: 'Solicitud no disponible', color: 'text-slate-400', bg: 'bg-slate-100' };

          if (offer.status === 'rejected') {
            return { label: 'Retiraste tu oferta', color: 'text-slate-400', bg: 'bg-slate-100' };
          }
          if (offer.status === 'pending' && req.status === 'open') {
            return { label: 'Esperando respuesta', color: 'text-indigo-600', bg: 'bg-indigo-100' };
          }
          if (offer.status === 'declined') {
            if (offer.reject_reason === 'auto') {
              const hasAcceptedSameDate = careOffers.some(o =>
                o.nurse_id === myNurse?.id &&
                o.status === 'accepted' &&
                o.id !== offer.id
              );
              if (hasAcceptedSameDate) {
                return { label: 'Auto-retirada: ya tienes servicio esa fecha', color: 'text-amber-600', bg: 'bg-amber-100' };
              }
              if (req.status === 'expired') {
                const hadOffers = careOffers.some(o => o.request_id === req.id && o.status !== 'rejected');
                return {
                  label: hadOffers ? 'La familia no decidió a tiempo' : 'Ninguna enfermera respondió a tiempo',
                  color: 'text-rose-500',
                  bg: 'bg-rose-100'
                };
              }
              if (req.status === 'closed') {
                return { label: 'La familia canceló la solicitud', color: 'text-slate-400', bg: 'bg-slate-100' };
              }
            }
            return { label: 'La familia eligió otra opción', color: 'text-slate-400', bg: 'bg-slate-100' };
          }
          return { label: '—', color: 'text-slate-400', bg: 'bg-slate-100' };
        };

        return (
          <div className="space-y-3">
            {myOffersList.map(offer => {
              const req = careRequests.find(r => r.id === offer.request_id);
              const slot = req?.slots[offer.slot_index];
              const shiftInfo = slot ? (SHIFTS[slot.shift as ShiftType] || SHIFTS.day) : null;
              const info = getOfferStatusInfo(offer);
              const familyProfile = req ? profileMap.get(req.user_id) : null;
              return (
                <div key={offer.id} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {req && (
                        <p className="text-xs font-bold text-slate-700 truncate">
                          {familyProfile?.full_name || 'Familia'} · {req.patient_condition}
                        </p>
                      )}
                      {slot && shiftInfo && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDate(slot.date)} · {shiftInfo.label}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Ofertaste: US$ {Number(offer.offered_rate).toFixed(2)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${info.bg} ${info.color}`}>
                      {info.label}
                    </span>
                  </div>
                  {offer.status === 'pending' && req?.status === 'open' && (
                    <button
                      onClick={() => withdrawCareOffer(offer.id)}
                      className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition flex items-center gap-1 cursor-pointer"
                    >
                      <XCircle className="h-3 w-3" />
                      Retirar oferta
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Modal de ajuste de tarifa */}
      {acceptModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setAcceptModal(null); }}>
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Ajustar tarifa para esta visita</h3>
              <p className="text-xs text-slate-500 mt-1">Puedes ajustar tu tarifa según el servicio específico.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tarifa por turno (US$)</label>
              <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min="15"
                  max="50"
                  value={offerRate}
                  onChange={e => setOfferRate(Number(e.target.value))}
                  className="w-full bg-transparent pl-7 pr-3 py-3 outline-none font-bold text-slate-800 text-sm"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Tu tarifa base: US$ {myNurse?.shift_rate}</p>
              {acceptModal.request.wants_invoice && (
                <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 space-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-600">Tu oferta:</span><span className="font-bold text-slate-700">${offerRate.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">ISR retenido (10%):</span><span className="font-bold text-rose-600">-${(offerRate * 0.10).toFixed(2)}</span></div>
                  <div className="border-t border-indigo-100 pt-1 flex justify-between"><span className="font-bold text-slate-700">Recibes neto:</span><span className="font-black text-emerald-600">${(offerRate * 0.90).toFixed(2)}</span></div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mensaje a la familia (opcional)</label>
              <textarea
                value={offerMessage}
                onChange={e => setOfferMessage(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ej: Tengo experiencia con este tipo de cuidado. ¿Podrían indicarme si cuentan con los insumos en casa o prefieren que yo los lleve?"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 resize-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">Este mensaje se enviará a la familia junto con tu oferta.</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setAcceptModal(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmOffer}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer"
              >
                Ofertar US$ {offerRate}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
