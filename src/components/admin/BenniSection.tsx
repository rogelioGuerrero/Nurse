import { type FC } from 'react';
import { Mic, Timer, MessageCircle, AlertTriangle, Wrench, Loader2 } from 'lucide-react';
import type { Profile } from '../../types';

interface BenniStats {
  total: number;
  avgDurationSec: number;
  avgTurns: number;
  escalatedCount: number;
  toolsUsed: Array<{ tool: string; count: number }>;
  last7Days: Array<{ date: string; count: number }>;
  recentSessions: Array<{
    id: string;
    patient_user_id: string | null;
    family_user_id: string | null;
    session_started_at: string;
    session_ended_at: string | null;
    session_duration_sec: number | null;
    turns_count: number;
    tools_called: string[] | null;
    escalated: boolean;
  }>;
}

interface Props {
  benniLoading: boolean;
  benniStats: BenniStats | null;
  profileMap: Map<string, Profile>;
}

export const BenniSection: FC<Props> = ({ benniLoading, benniStats, profileMap }) => (
  <div className="space-y-4">
    {benniLoading && (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    )}

    {!benniLoading && !benniStats && (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">No hay datos de sesiones de Benni.</p>
      </div>
    )}

    {!benniLoading && benniStats && (
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Mic className="h-4 w-4 text-indigo-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Total sesiones</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{benniStats.total}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Timer className="h-4 w-4 text-emerald-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Duración prom.</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {benniStats.avgDurationSec > 0 ? `${Math.floor(benniStats.avgDurationSec / 60)}m ${benniStats.avgDurationSec % 60}s` : '\u2014'}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageCircle className="h-4 w-4 text-amber-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Turnos prom.</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{benniStats.avgTurns}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Escalados</p>
            </div>
            <p className="text-2xl font-bold text-rose-600">{benniStats.escalatedCount}</p>
          </div>
        </div>

        {benniStats.last7Days.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Sesiones (últimos 7 días)</h3>
            <div className="flex items-end justify-between gap-2 h-32">
              {benniStats.last7Days.map((d) => {
                const maxCount = Math.max(...benniStats.last7Days.map(x => x.count), 1);
                const heightPct = Math.max((d.count / maxCount) * 100, 5);
                const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric' });
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-600">{d.count}</span>
                    <div className="w-full bg-indigo-100 rounded-t-lg" style={{ height: `${heightPct}%` }}>
                      <div className="w-full h-full bg-indigo-500 rounded-t-lg" />
                    </div>
                    <span className="text-[9px] text-slate-400 capitalize">{dateLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {benniStats.toolsUsed.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-indigo-500" />
              Herramientas usadas
            </h3>
            <div className="space-y-2">
              {benniStats.toolsUsed.map((t) => {
                const maxCount = Math.max(...benniStats.toolsUsed.map(x => x.count), 1);
                const pct = Math.round((t.count / maxCount) * 100);
                const labels: Record<string, string> = {
                  get_today_agenda: 'Agenda del día',
                  create_reminder: 'Crear recordatorio',
                  log_symptom: 'Registrar síntoma',
                  send_family_message: 'Mensaje a familia',
                };
                return (
                  <div key={t.tool} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-600 w-32">{labels[t.tool] || t.tool}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full flex items-center justify-end px-2" style={{ width: `${Math.max(pct, 8)}%` }}>
                        <span className="text-[10px] font-bold text-white">{t.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Sesiones recientes</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {benniStats.recentSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No hay sesiones registradas.</div>
            ) : (
              benniStats.recentSessions.map((s) => {
                const family = s.family_user_id ? profileMap.get(s.family_user_id) : null;
                const duration = s.session_duration_sec != null
                  ? `${Math.floor(s.session_duration_sec / 60)}m ${s.session_duration_sec % 60}s`
                  : '\u2014';
                const startedAt = new Date(s.session_started_at).toLocaleString('es-SV', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={s.id} className="px-4 py-2.5 text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">{family?.full_name || 'Sin familia'}</span>
                      <div className="flex items-center gap-1">
                        {s.escalated && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700">Escalado</span>
                        )}
                        <span className="text-slate-400">{startedAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-slate-500">
                      <span>Turnos: {s.turns_count}</span>
                      <span>Duración: {duration}</span>
                      {s.tools_called && s.tools_called.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Wrench className="h-2.5 w-2.5" />
                          {s.tools_called.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {benniStats.total === 0 && (
          <div className="text-center py-8 bg-white rounded-2xl border border-slate-200">
            <p className="text-sm text-slate-500">Aún no hay sesiones de Benni registradas.</p>
          </div>
        )}
      </>
    )}
  </div>
);
