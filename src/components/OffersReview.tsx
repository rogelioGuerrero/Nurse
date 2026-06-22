import { useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { calculateNurseNet } from '../data/standardRates';
import { SHIFTS, type ShiftType } from '../types';
import { CheckCircle2, XCircle, Star, MapPin, User, Calendar, Clock as ClockIcon, Dumbbell, Users, Heart, MessageCircle } from 'lucide-react';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export const OffersReview: FC = () => {
  const { careRequests, careOffers, nurses, profiles, currentUser, acceptCareOffer } = useApp();

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  // Get pending offers for this user's requests
  const pendingOffers = useMemo(() => {
    if (!currentUser) return [];
    const myRequestIds = careRequests
      .filter(r => r.user_id === currentUser.id && r.status === 'open')
      .map(r => r.id);
    
    return careOffers.filter(o => 
      myRequestIds.includes(o.request_id) && o.status === 'pending'
    );
  }, [careRequests, careOffers, currentUser]);

  if (pendingOffers.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-5">
        <div className="text-center space-y-3">
          <ClockIcon className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-600">No tienes ofertas pendientes.</p>
          <p className="text-xs text-slate-400">Las enfermeras aparecerán aquí cuando envíen sus ofertas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Ofertas Recibidas</h1>
        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
          {pendingOffers.length}
        </span>
      </div>

      {pendingOffers.map(offer => {
        const request = careRequests.find(r => r.id === offer.request_id);
        if (!request) return null;

        const nurse = nurses.find(n => n.id === offer.nurse_id);
        const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
        const slot = request.slots[offer.slot_index];
        const shiftInfo = SHIFTS[slot.shift as ShiftType] || SHIFTS.morning;
        const hours = 8;
        const totalNet = calculateNurseNet(offer.offered_rate, true);

        return (
          <div key={offer.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            {/* Header: nurse info */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 truncate">
                    {nurseProfile?.full_name || 'Enfermera'}
                  </h3>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <span className="text-xs font-bold">{nurse?.rating || 4.5}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <MapPin className="h-3 w-3" />
                  <span>{nurse?.coverage_radius || 10} km de radio</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-slate-800">
                  US$ {offer.offered_rate}
                </div>
                <div className="text-[10px] text-slate-400">por turno</div>
              </div>
            </div>

            {/* Specializations */}
            <div className="flex flex-wrap gap-1">
              {nurse?.specialization.slice(0, 3).map(spec => (
                <span key={spec} className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {spec}
                </span>
              ))}
              {nurse?.specialization.length > 3 && (
                <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  +{nurse.specialization.length - 3}
                </span>
              )}
            </div>

            {/* Schedule */}
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-medium">{formatDate(slot.date)}</span>
              <span className="text-slate-400">•</span>
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="font-medium">{shiftInfo.label}</span>
              <span className="text-slate-400">({shiftInfo.start}-{shiftInfo.end})</span>
            </div>

            {/* Message from nurse */}
            {offer.message && (
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                  <MessageCircle className="h-3 w-3" />
                  <span>Mensaje</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{offer.message}</p>
              </div>
            )}

            {/* Patient condition */}
            {request.patient_condition && (
              <div className="bg-amber-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1">
                  <Heart className="h-3 w-3" />
                  <span>Condición del paciente</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">{request.patient_condition}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => acceptCareOffer(offer.id)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                Aceptar Oferta
              </button>
              <button
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <XCircle className="h-4 w-4" />
                Rechazar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
