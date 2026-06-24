import { useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { SHIFTS, type ShiftType } from '../types';
import {
  BookOpen, Calendar, Clock, Star, FileText, DollarSign,
  CheckCircle2, XCircle, User, Stethoscope, TrendingUp
} from 'lucide-react';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const Bitacora: FC = () => {
  const {
    bookings, careLogs, nurseReviews, nurses, profiles, currentUser
  } = useApp();

  const isNurse = currentUser?.role === 'nurse';

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const nurseMap = useMemo(() => new Map(nurses.map(n => [n.id, n])), [nurses]);

  // Filter bookings: family sees their own, nurse sees those assigned to them
  // Only show completed or cancelled (historical), plus confirmed (active)
  const myBookings = useMemo(() => {
    if (!currentUser) return [];
    return bookings
      .filter(b => {
        if (isNurse) {
          const nurse = nurses.find(n => n.user_id === currentUser.id);
          return nurse && b.nurse_id === nurse.id;
        }
        return b.user_id === currentUser.id;
      })
      .sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
  }, [bookings, currentUser, isNurse, nurses]);

  // Stats
  const stats = useMemo(() => {
    const completed = myBookings.filter(b => b.status === 'completed');
    const totalHours = completed.reduce((sum, b) => sum + b.hours, 0);
    const totalEarnings = completed.reduce((sum, b) => {
      const nurseRate = b.wants_invoice ? b.total_price - 5 * 1.13 : b.total_price;
      return sum + nurseRate;
    }, 0);
    const totalSpent = completed.reduce((sum, b) => sum + b.total_price, 0);
    const reportsCount = completed.filter(b => careLogs[b.id]).length;
    const avgRating = isNurse
      ? (() => {
          const myReviews = nurseReviews.filter(r => {
            const nurse = nurses.find(n => n.user_id === currentUser?.id);
            return nurse && r.nurse_id === nurse.id;
          });
          if (myReviews.length === 0) return 0;
          return myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length;
        })()
      : 0;

    return {
      total: myBookings.length,
      completed: completed.length,
      totalHours,
      totalEarnings,
      totalSpent,
      reportsCount,
      avgRating,
    };
  }, [myBookings, careLogs, nurseReviews, isNurse, nurses, currentUser]);

  const getCounterPartyName = (b: typeof myBookings[0]) => {
    if (isNurse) {
      const familyProfile = profileMap.get(b.user_id);
      return familyProfile?.full_name || 'Familia';
    } else {
      const nurse = nurseMap.get(b.nurse_id);
      const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
      return nurseProfile?.full_name || 'Enfermera';
    }
  };

  const getShiftLabel = (b: typeof myBookings[0]) => {
    for (const [key, val] of Object.entries(SHIFTS)) {
      if (val.start === b.start_time && val.end === b.end_time) {
        return val.label;
      }
    }
    return `${b.start_time}-${b.end_time}`;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
    if (status === 'cancelled') return <XCircle className="h-3.5 w-3.5 text-rose-500" />;
    if (status === 'confirmed') return <Clock className="h-3.5 w-3.5 text-indigo-500" />;
    return <Clock className="h-3.5 w-3.5 text-slate-400" />;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      completed: 'Completado',
      cancelled: 'Cancelado',
      confirmed: 'Confirmado',
      pending: 'Pendiente',
    };
    return labels[status] || status;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  const getNurseRate = (b: typeof myBookings[0]) => {
    return b.wants_invoice ? b.total_price - 5 * 1.13 : b.total_price;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-indigo-600" />
        <div>
          <h1 className="text-lg font-bold text-slate-800">Bitácora</h1>
          <p className="text-xs text-slate-500">
            {isNurse ? 'Historial de servicios prestados' : 'Historial de solicitudes y reportes'}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 font-semibold uppercase">
            {isNurse ? 'Servicios' : 'Solicitudes'}
          </p>
          <p className="text-xl font-black text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 font-semibold uppercase">Horas</p>
          <p className="text-xl font-black text-slate-800">{stats.totalHours}</p>
        </div>
        {isNurse ? (
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Ingresos</p>
            <p className="text-xl font-black text-emerald-600">${stats.totalEarnings.toFixed(0)}</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Invertido</p>
            <p className="text-xl font-black text-indigo-600">${stats.totalSpent.toFixed(0)}</p>
          </div>
        )}
      </div>

      {/* Additional stats row */}
      <div className="flex gap-2 flex-wrap">
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-[10px] font-bold text-indigo-700">{stats.completed} completados</span>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-[10px] font-bold text-amber-700">{stats.reportsCount} reportes</span>
        </div>
        {isNurse && stats.avgRating > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-emerald-600 fill-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-700">{stats.avgRating.toFixed(1)} promedio</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {myBookings.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">No hay registros en tu bitácora</p>
          <p className="text-xs text-slate-400 mt-1">
            {isNurse
              ? 'Cuando completes servicios, aparecerán aquí con tus reportes y calificaciones.'
              : 'Cuando hagas solicitudes y recibas reportes, aparecerán aquí.'}
          </p>
        </div>
      )}

      {/* History list */}
      <div className="space-y-3">
        {myBookings.map((b) => {
          const log = careLogs[b.id];
          const review = nurseReviews.find(r => r.booking_id === b.id);
          const nurseRate = getNurseRate(b);

          return (
            <div
              key={b.id}
              className={`bg-white border rounded-2xl overflow-hidden ${
                b.status === 'cancelled' ? 'border-slate-200 opacity-75' : 'border-slate-200'
              }`}
            >
              {/* Header row */}
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center">
                    <span className="text-sm font-black text-slate-700">
                      {new Date(b.date + 'T00:00:00').getDate()}
                    </span>
                    <span className="text-[8px] font-bold text-slate-500 uppercase">
                      {MONTH_NAMES[new Date(b.date + 'T00:00:00').getMonth()]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-800 text-sm truncate">{getCounterPartyName(b)}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span>{getShiftLabel(b)}</span>
                      <span className="text-slate-300">·</span>
                      <span>{b.start_time}-{b.end_time}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    {getStatusIcon(b.status)}
                    <span className="text-[10px] font-bold text-slate-600">{getStatusLabel(b.status)}</span>
                  </div>
                  <span className="text-xs font-black text-indigo-600">
                    ${isNurse ? nurseRate.toFixed(0) : b.total_price.toFixed(0)}
                  </span>
                </div>
              </div>

              {/* Patient info */}
              <div className="px-3 py-2 bg-slate-50/70 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <User className="h-3 w-3 text-indigo-500" />
                  <span className="font-bold">{b.patient_name}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500 truncate">{b.patient_condition}</span>
                </div>
              </div>

              {/* Report section */}
              {b.status === 'completed' && (
                <div className="px-3 py-2.5 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Reporte profesional</span>
                  </div>
                  {log ? (
                    <div className="bg-amber-50/40 border border-amber-100/40 rounded-xl p-2.5 text-[11px] text-slate-700 leading-relaxed">
                      {log.narrativeReport || `La enfermera llegó a las ${log.arrivalTime} y encontró a ${b.patient_name} en estado ${log.patientConditionOnArrival.toLowerCase()}. Durante el servicio ${log.activities.length > 0 ? 'realizó ' + log.activities.map(a => a.toLowerCase()).join(', ') : 'brindó atención general'}. Al retirarse a las ${log.departureTime}, ${b.patient_name} ${log.patientConditionOnDeparture.toLowerCase()}.`}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">Sin reporte registrado</p>
                  )}
                </div>
              )}

              {/* Payment & rating footer */}
              {(b.status === 'completed' || b.status === 'confirmed') && (
                <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                  {/* Payment status */}
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                    {b.wants_invoice ? (
                      <span className={`font-bold ${b.payment_status === 'paid' ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {b.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
                      </span>
                    ) : (
                      <span className="font-bold text-slate-500">Pago directo</span>
                    )}
                  </div>

                  {/* Rating */}
                  {review && (
                    <div className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                      <span className="font-bold text-amber-700">{review.rating.toFixed(1)}</span>
                      {review.comment && (
                        <span className="text-slate-400 truncate max-w-[120px]">· {review.comment}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
