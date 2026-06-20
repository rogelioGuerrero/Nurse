import { useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { getFamilyPrice } from '../data/standardRates';
import { getDistanceKm, USER_COORDS } from '../lib/distance';
import type { CareRequest } from '../types';
import { Inbox, Calendar, Clock, Heart, MapPin, CheckCircle2, XCircle, AlertCircle, User } from 'lucide-react';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export const NurseInbox: FC = () => {
  const { careRequests, careOffers, nurses, profiles, currentUser, createCareOffer } = useApp();

  // Find the current nurse's record
  const myNurse = useMemo(
    () => nurses.find(n => n.user_id === currentUser?.id),
    [nurses, currentUser]
  );

  // Filter requests that match this nurse's specialization and coverage radius
  const incomingRequests = useMemo(() => {
    if (!myNurse) return [];
    return careRequests.filter(req => {
      if (req.status !== 'open') return false;
      if (!myNurse.specialization.includes(req.specialization_needed)) return false;
      const distance = getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, myNurse.lat, myNurse.lng);
      return distance <= myNurse.coverage_radius;
    });
  }, [careRequests, myNurse]);

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

  const getOfferForSlot = (requestId: string, slotIndex: number) => {
    return careOffers.find(
      o => o.request_id === requestId &&
      o.nurse_id === myNurse?.id &&
      o.slot_index === slotIndex
    );
  };

  const handleAccept = (request: CareRequest, slotIndex: number) => {
    if (!myNurse) return;
    createCareOffer({
      request_id: request.id,
      nurse_id: myNurse.id,
      slot_index: slotIndex,
      message: 'Confirmo disponibilidad para esta visita.'
    });
  };

  const handleDecline = (request: CareRequest, slotIndex: number) => {
    if (!myNurse) return;
    createCareOffer({
      request_id: request.id,
      nurse_id: myNurse.id,
      slot_index: slotIndex,
      message: 'No tengo disponibilidad para esta fecha.'
    });
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
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Inbox className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Solicitudes de visita</h1>
          <p className="text-xs text-slate-500">Revisa y confirma las visitas que te llegaron</p>
        </div>
      </div>

      {incomingRequests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No tienes solicitudes pendientes.</p>
          <p className="text-xs text-slate-400 mt-1">Cuando una familia publique una necesidad que coincida con tu especialización, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {incomingRequests.map(req => {
            const familyProfile = profileMap.get(req.user_id);
            const familyPrice = getFamilyPrice(req.specialization_needed);
            const distance = getDistanceKm(
              USER_COORDS.lat, USER_COORDS.lng,
              myNurse.lat, myNurse.lng
            );

            return (
              <div key={req.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {/* Request header */}
                <div className="p-5 border-b border-slate-100 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={familyProfile?.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">{familyProfile?.full_name || 'Familia'}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {req.location_name}
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-400">{distance.toFixed(1)} km de ti</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                      {req.specialization_needed}
                    </span>
                  </div>

                  {/* Patient info */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <Heart className="h-3.5 w-3.5 text-rose-400" />
                      <span className="font-bold text-slate-700">{req.patient_name}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pl-5">{req.patient_condition}</p>
                    {req.notes && (
                      <p className="text-xs text-slate-500 italic pl-5">Nota: {req.notes}</p>
                    )}
                  </div>
                </div>

                {/* Slots - each day individually */}
                <div className="divide-y divide-slate-100">
                  {req.slots.map((slot, idx) => {
                    const offer = getOfferForSlot(req.id, idx);
                    const responded = hasOffered(req.id, idx);
                    const [sh, sm] = slot.start_time.split(':').map(Number);
                    const [eh, em] = slot.end_time.split(':').map(Number);
                    const hours = (eh + em / 60) - (sh + sm / 60);
                    const payout = hours * familyPrice;

                    return (
                      <div key={idx} className="p-4 flex items-center gap-4">
                        {/* Date badge */}
                        <div className="flex-shrink-0 w-12 text-center">
                          <div className="bg-slate-100 rounded-lg py-1.5 px-0.5">
                            <div className="text-sm font-black text-slate-700">
                              {slot.date ? new Date(slot.date + 'T00:00:00').getDate() : '--'}
                            </div>
                            <div className="text-[9px] font-bold uppercase text-slate-400">
                              {slot.date ? MONTH_NAMES[new Date(slot.date + 'T00:00:00').getMonth()] : '--'}
                            </div>
                          </div>
                        </div>

                        {/* Slot info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-700">
                            {formatDate(slot.date)}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {slot.start_time} - {slot.end_time}
                            </span>
                            <span className="font-bold text-slate-600">{hours.toFixed(1)}h</span>
                            <span className="font-bold text-indigo-600">${payout.toFixed(0)}</span>
                          </div>
                        </div>

                        {/* Action buttons or status */}
                        {!responded ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleAccept(req, idx)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Aceptar
                            </button>
                            <button
                              onClick={() => handleDecline(req, idx)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Rechazar
                            </button>
                          </div>
                        ) : offer?.status === 'accepted' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 flex-shrink-0">
                            <CheckCircle2 className="h-4 w-4" />
                            Aceptaste
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 flex-shrink-0">
                            <XCircle className="h-4 w-4" />
                            Rechazaste
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
