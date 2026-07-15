import { type FC } from 'react';
import { Users, Phone, MapPin, DollarSign, ShieldCheck, List, LayoutGrid } from 'lucide-react';
import type { Nurse, Profile } from '../../types';

const PAY_LABELS: Record<string, string> = {
  per_shift: 'Por turno',
  service_contract: 'Contrato',
  both: 'Ambos',
};
const AVAIL_LABELS: Record<string, string> = {
  shifts_only: 'Solo turnos',
  up_to_2_weeks: 'Hasta 2 semanas',
  up_to_1_month: '1 mes o más',
  flexible: 'Flexible',
};

interface GroupedNurses {
  key: string;
  nurses: Nurse[];
}

interface Props {
  nurses: Nurse[];
  profileMap: Map<string, Profile>;
  nurseGrouping: string;
  setNurseGrouping: (g: 'none' | 'specialization' | 'department' | 'district') => void;
  nurseViewMode: 'list' | 'grid';
  setNurseViewMode: (m: 'list' | 'grid') => void;
  groupedNurses: GroupedNurses[];
}

const NurseCard: FC<{ nurse: Nurse; profile?: Profile; viewMode: 'list' | 'grid' }> = ({ nurse, profile, viewMode }) => {
  const csspStatus = nurse.cssp_verification_status || 'unverified';
  const csspBadge = csspStatus === 'auto_verified' || csspStatus === 'manual_verified'
    ? { label: 'CSSP ✓', color: 'bg-blue-50 text-blue-700' }
    : csspStatus === 'pending'
    ? { label: 'CSSP ⏳', color: 'bg-amber-50 text-amber-700' }
    : { label: 'CSSP ✗', color: 'bg-rose-50 text-rose-700' };

  if (viewMode === 'grid') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-700 truncate">{profile?.full_name || 'Sin nombre'}</p>
            <p className="text-[10px] text-slate-500 truncate">{profile?.email}</p>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${csspBadge.color}`}>{csspBadge.label}</span>
        </div>
        <div className="space-y-1 text-[10px] text-slate-600">
          <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-slate-400" />{profile?.phone || 'Sin teléfono'}</div>
          <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-slate-400" />{profile?.location_name || 'Sin ubicación'}</div>
          <div className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5 text-slate-400" />${nurse.shift_rate}/turno</div>
        </div>
        {nurse.specialization && nurse.specialization.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {nurse.specialization.map((s: string) => (
              <span key={s} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{s}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-700">{profile?.full_name || 'Sin nombre'}</p>
          <p className="text-[10px] text-slate-500">{profile?.email}</p>
        </div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${csspBadge.color}`}>{csspBadge.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600">
        <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-slate-400" />{profile?.phone || 'Sin teléfono'}</div>
        <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-slate-400" />{profile?.location_name || 'Sin ubicación'}</div>
        <div className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5 text-slate-400" />${nurse.shift_rate}/turno</div>
        <div className="flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5 text-slate-400" />{nurse.cssp_registration || 'Sin CSSP'}</div>
        <div><span className="text-slate-400">Nivel:</span> {nurse.cssp_level || 'N/A'}</div>
        <div><span className="text-slate-400">DUI:</span> {nurse.dui || 'N/A'}</div>
        <div><span className="text-slate-400">Pago:</span> {PAY_LABELS[nurse.payment_preference || 'per_shift']}</div>
        <div><span className="text-slate-400">Disponibilidad:</span> {AVAIL_LABELS[nurse.assignment_availability || 'shifts_only']}</div>
      </div>
      {nurse.specialization && nurse.specialization.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {nurse.specialization.map((s: string) => (
            <span key={s} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{s}</span>
          ))}
        </div>
      )}
      {nurse.bio && (
        <p className="text-[10px] text-slate-500 italic line-clamp-2">{nurse.bio}</p>
      )}
    </div>
  );
};

export const NursesSection: FC<Props> = ({
  nurses, profileMap, nurseGrouping, setNurseGrouping, nurseViewMode, setNurseViewMode, groupedNurses
}) => (
  <div className="space-y-4">
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Directorio de Enfermeras ({nurses.length})
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Datos completos de cada enfermera registrada.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 flex-wrap">
            <button onClick={() => setNurseGrouping('specialization')} className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'specialization' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Por especialización</button>
            <button onClick={() => setNurseGrouping('department')} className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'department' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Por departamento</button>
            <button onClick={() => setNurseGrouping('district')} className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'district' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Por distrito</button>
            <button onClick={() => setNurseGrouping('none')} className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${nurseGrouping === 'none' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Sin agrupar</button>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setNurseViewMode('list')} className={`p-1 rounded transition cursor-pointer ${nurseViewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`} title="Vista lista"><List className="h-3.5 w-3.5" /></button>
            <button onClick={() => setNurseViewMode('grid')} className={`p-1 rounded transition cursor-pointer ${nurseViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`} title="Vista cuadrícula"><LayoutGrid className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {nurseGrouping === 'none' ? (
          <div className={nurseViewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3' : 'divide-y divide-slate-100'}>
            {nurses.map(nurse => (
              <NurseCard key={nurse.id} nurse={nurse} profile={profileMap.get(nurse.user_id)} viewMode={nurseViewMode} />
            ))}
          </div>
        ) : (
          groupedNurses.map(group => (
            <div key={group.key} className="border-b border-slate-100 last:border-0">
              <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">{group.key}</span>
                <span className="text-[10px] text-slate-400 font-bold">{group.nurses.length}</span>
              </div>
              <div className={nurseViewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3' : 'divide-y divide-slate-100'}>
                {group.nurses.map(nurse => (
                  <NurseCard key={nurse.id} nurse={nurse} profile={profileMap.get(nurse.user_id)} viewMode={nurseViewMode} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);
