import { type FC } from 'react';
import { Calendar, Users, DollarSign, Phone } from 'lucide-react';
import type { CareRequest, Nurse, Profile } from '../../types';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const AVAIL_LABELS: Record<string, string> = {
  shifts_only: 'Solo turnos',
  up_to_2_weeks: 'Hasta 2 semanas',
  up_to_1_month: '1 mes o más',
  flexible: 'Flexible',
};
const PAY_LABELS: Record<string, string> = {
  per_shift: 'Por turno',
  service_contract: 'Contrato',
  both: 'Ambos',
};

interface Props {
  longTermRequests: CareRequest[];
  weekdayNurses: Nurse[];
  weekendNurses: Nurse[];
  profileMap: Map<string, Profile>;
}

export const PackagesSection: FC<Props> = ({
  longTermRequests, weekdayNurses, weekendNurses, profileMap
}) => (
  <div className="space-y-4">
    <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          Solicitudes de larga duración ({longTermRequests.length})
        </h3>
        <p className="text-[10px] text-slate-500 mt-0.5">Servicios de 4+ días. AGTI contacta a la familia con cotización personalizada.</p>
      </div>
      {longTermRequests.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-400">No hay solicitudes de larga duración.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {longTermRequests.map(req => {
            const family = profileMap.get(req.user_id);
            const durationLabel = req.expected_duration === 'up_to_2_weeks' ? 'Hasta 2 semanas' : req.expected_duration === 'up_to_1_month' ? '1 mes o más' : 'Duración por definir';
            return (
              <div key={req.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700">{req.patient_name} - {req.patient_condition}</p>
                    <p className="text-[10px] text-slate-500">Familia: {family?.full_name || 'N/A'} · {req.slots.length} día(s) · {req.location_name}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5" />{family?.phone || 'Sin teléfono'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                    {durationLabel}
                  </span>
                </div>
                {req.specialization_needed && (
                  <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full inline-block">
                    {req.specialization_needed}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
        <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          Enfermeras Lunes a Viernes ({weekdayNurses.length})
        </h3>
        <p className="text-[10px] text-slate-500 mt-0.5">Cubren días hábiles. Ideales para bloque L-V en paquetes de 7 días.</p>
      </div>
      {weekdayNurses.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-400">No hay enfermeras disponibles para L-V.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {weekdayNurses.map(nurse => {
            const profile = profileMap.get(nurse.user_id);
            const days = nurse.available_days?.map(d => DAY_LABELS[d]).join(', ') || '';
            return (
              <div key={nurse.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
                  <p className="text-[10px] text-slate-500">{days} · ${nurse.shift_rate}/turno</p>
                  <div className="flex gap-1.5 mt-1">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600">{PAY_LABELS[nurse.payment_preference || 'per_shift']}</span>
                    {nurse.cssp_verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">CSSP \u2713</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                    <Phone className="h-2.5 w-2.5" />{profile?.phone || 'N/A'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
        <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          Enfermeras Fines de Semana ({weekendNurses.length})
        </h3>
        <p className="text-[10px] text-slate-500 mt-0.5">Cubren sábados y domingos. Ideales para bloque S-D en paquetes de 7 días.</p>
      </div>
      {weekendNurses.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-400">No hay enfermeras disponibles para fines de semana.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {weekendNurses.map(nurse => {
            const profile = profileMap.get(nurse.user_id);
            const days = nurse.available_days?.map(d => DAY_LABELS[d]).join(', ') || '';
            return (
              <div key={nurse.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
                  <p className="text-[10px] text-slate-500">{days} · ${nurse.shift_rate}/turno</p>
                  <div className="flex gap-1.5 mt-1">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600">{PAY_LABELS[nurse.payment_preference || 'per_shift']}</span>
                    {nurse.cssp_verified && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">CSSP \u2713</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                    <Phone className="h-2.5 w-2.5" />{profile?.phone || 'N/A'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {weekdayNurses.length > 0 && weekendNurses.length > 0 && (
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-indigo-600" />
          <p className="text-xs font-bold text-indigo-800">Calculadora de paquete (7 días)</p>
        </div>
        <div className="text-[11px] text-slate-600 space-y-0.5">
          <p>Bloque L-V (5 días): ${Math.min(...weekdayNurses.map(n => n.shift_rate))}/turno × 5 = <span className="font-bold">${Math.min(...weekdayNurses.map(n => n.shift_rate)) * 5}</span></p>
          <p>Bloque S-D (2 días): ${Math.min(...weekendNurses.map(n => n.shift_rate))}/turno × 2 = <span className="font-bold">${Math.min(...weekendNurses.map(n => n.shift_rate)) * 2}</span></p>
          <p className="font-bold text-indigo-700 pt-1 border-t border-indigo-200 mt-1">Costo base semanal: ${Math.min(...weekdayNurses.map(n => n.shift_rate)) * 5 + Math.min(...weekendNurses.map(n => n.shift_rate)) * 2}</p>
          <p className="text-[10px] text-slate-500">Aplica descuento por volumen al cotizar a la familia.</p>
        </div>
      </div>
    )}
  </div>
);
