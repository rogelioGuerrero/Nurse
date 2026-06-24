import { useState, useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { ShieldCheck, ShieldX, Clock, ExternalLink, Search, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { Nurse, CSSPVerificationStatus } from '../types';

export const CSSPReviewPanel: FC = () => {
  const { nurses, profiles, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'unverified' | 'verified'>('pending');
  const [loading, setLoading] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">Acceso restringido a administradores.</p>
      </div>
    );
  }

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const filteredNurses = useMemo(() => {
    let list = nurses;

    if (filter === 'pending') {
      list = list.filter(n => n.cssp_verification_status === 'pending' || n.cssp_verification_status === 'unverified');
    } else if (filter === 'verified') {
      list = list.filter(n => n.cssp_verified === true);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n => {
        const profile = profileMap.get(n.user_id);
        return (
          n.cssp_registration.toLowerCase().includes(q) ||
          profile?.full_name?.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [nurses, profileMap, filter, search]);

  const updateVerification = async (
    nurseId: string,
    status: CSSPVerificationStatus,
    noteText: string
  ) => {
    setLoading(nurseId);
    try {
      const { error } = await supabase
        .from('nurses')
        .update({
          cssp_verification_status: status,
          cssp_verified: status === 'manual_verified' || status === 'auto_verified',
          cssp_verification_date: new Date().toISOString(),
          cssp_verification_notes: noteText || undefined,
        })
        .eq('id', nurseId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating verification:', err);
    } finally {
      setLoading(null);
    }
  };

  const statusConfig: Record<CSSPVerificationStatus, { label: string; color: string; icon: typeof ShieldCheck }> = {
    auto_verified: { label: 'Auto verificado', color: 'text-emerald-600 bg-emerald-50', icon: ShieldCheck },
    manual_verified: { label: 'Verificado manual', color: 'text-blue-600 bg-blue-50', icon: ShieldCheck },
    pending: { label: 'En proceso', color: 'text-amber-600 bg-amber-50', icon: Clock },
    unverified: { label: 'No verificado', color: 'text-amber-600 bg-amber-50', icon: Clock },
    rejected: { label: 'Rechazado', color: 'text-rose-600 bg-rose-50', icon: ShieldX },
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-800">Revisión manual de registros CSSP</h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o número CSSP..."
              className="w-full pl-10 pr-3 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
          <div className="flex gap-1.5">
            {(['pending', 'unverified', 'verified', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'pending' ? 'Pendientes' : f === 'unverified' ? 'No verif.' : f === 'verified' ? 'Verificados' : 'Todos'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de enfermeras */}
        <div className="space-y-3">
          {filteredNurses.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-slate-400">No hay enfermeras en este filtro.</p>
            </div>
          )}

          {filteredNurses.map((nurse) => {
            const profile = profileMap.get(nurse.user_id);
            const status = nurse.cssp_verification_status || 'unverified';
            const config = statusConfig[status];
            const StatusIcon = config.icon;

            return (
              <div key={nurse.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">{profile?.full_name || 'Sin nombre'}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${config.color} flex items-center gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      CSSP: <span className="font-mono font-bold">{nurse.cssp_registration || 'No registrado'}</span>
                      {' · '}Nivel: {nurse.cssp_level}
                    </p>
                    <p className="text-xs text-slate-500">
                      DUI: <span className="font-mono font-bold">{nurse.dui || 'No registrado'}</span>
                    </p>
                    {nurse.cssp_verification_date && (
                      <p className="text-[10px] text-slate-400">
                        Última verificación: {new Date(nurse.cssp_verification_date).toLocaleDateString('es-SV')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <a
                      href="https://cssp.gob.sv/profesionales/faces/consulta/buscar.xhtml"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      CSSP
                    </a>
                    <a
                      href="https://www.simple.sv"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      simple.sv
                    </a>
                  </div>
                </div>

                {/* Notas existentes */}
                {nurse.cssp_verification_notes && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 italic">{nurse.cssp_verification_notes}</p>
                  </div>
                )}

                {/* Acciones manuales */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={notes[nurse.id] || ''}
                    onChange={(e) => setNotes(prev => ({ ...prev, [nurse.id]: e.target.value }))}
                    placeholder="Notas de verificación (opcional)..."
                    className="flex-1 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateVerification(nurse.id, 'manual_verified', notes[nurse.id] || 'Verificado manualmente por administrador')}
                      disabled={loading === nurse.id}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-3 py-2 rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      {loading === nurse.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Aprobar
                    </button>
                    <button
                      onClick={() => updateVerification(nurse.id, 'rejected', notes[nurse.id] || 'Registro no confirmado')}
                      disabled={loading === nurse.id}
                      className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] px-3 py-2 rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
