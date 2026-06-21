import { useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { calculateNurseNet } from '../data/standardRates';
import { getDistanceKm, USER_COORDS } from '../lib/distance';
import type { CareRequest } from '../types';
import { SHIFTS, type ShiftType } from '../types';
import { Inbox, Calendar, Clock, Heart, MapPin, CheckCircle2, XCircle, AlertCircle, User, Sun, Sunset, Moon } from 'lucide-react';

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

  // Filter requests that match this nurse's specialization (distance is informational, not a hard filter)
  const incomingRequests = useMemo(() => {
    if (!myNurse) return [];
    return careRequests.filter(req => {
      if (req.status !== 'open') return false;
      return myNurse.specialization.includes(req.specialization_needed);
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
      message: 'No tengo disponibilidad para esta fecha.',
      status: 'rejected'
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
    <div className="max-w-md mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Inbox className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Familias que te necesitan</h1>
          <p className="text-xs text-slate-500">Revisa los pedidos de cuidado y confirma los turnos que puedes cubrir</p>
        </div>
      </div>

      {incomingRequests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Todo tranquilo por ahora.</p>
          <p className="text-xs text-slate-400 mt-1">Cuando una familia busque cuidado que coincida con tu especialidad, lo verás aquí.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {incomingRequests.map(req => {
            const familyProfile = profileMap.get(req.user_id);
            const distance = getDistanceKm(
              USER_COORDS.lat, USER_COORDS.lng,
              myNurse.lat, myNurse.lng
            );

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
                    </div>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full flex-shrink-0">
                      {req.specialization_needed}
                    </span>
                  </div>

                  {/* Distance badge */}
                  <div className={`text-[10px] font-bold ${distance <= myNurse.coverage_radius ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {distance.toFixed(1)} km{distance > myNurse.coverage_radius ? ` · fuera de tu radio de ${myNurse.coverage_radius} km` : ''}
                  </div>

                  {/* Patient info */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <Heart className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
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
                    const dateConflict = isDateBooked(slot.date) && !responded;
                    const shiftInfo = SHIFTS[slot.shift as ShiftType] || SHIFTS.morning;
                    const nurseRate = myNurse.shift_rate || 25;
                    const wantsInvoicing = true; // FSE automatico
                    const payout = calculateNurseNet(nurseRate, wantsInvoicing);

                    const SHIFT_ICON: Record<ShiftType, typeof Sun> = { morning: Sun, afternoon: Sunset, night: Moon };
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

                        {/* Action buttons - full width row */}
                        {!responded ? (
                          <div className="flex gap-2 pl-14">
                            <button
                              onClick={() => handleAccept(req, idx)}
                              disabled={dateConflict}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white text-xs font-bold py-2 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Aceptar
                            </button>
                            <button
                              onClick={() => handleDecline(req, idx)}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Rechazar
                            </button>
                          </div>
                        ) : offer?.status === 'accepted' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 pl-14">
                            <CheckCircle2 className="h-4 w-4" />
                            Confirmado
                          </div>
                        ) : offer?.status === 'pending' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 pl-14">
                            <CheckCircle2 className="h-4 w-4" />
                            Ofreciste tu servicio
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 pl-14">
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
