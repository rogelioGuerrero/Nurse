import { type FC } from 'react';
import { MessageCircle, CheckCircle2, TrendingUp, Loader2 } from 'lucide-react';

interface ChatStats {
  total: number;
  byRole: Record<string, number>;
  resolved: number;
  whatsapp: number;
  avgMessages: number;
  topTopics: Array<{ topic: string; count: number }>;
  last7Days: Array<{ date: string; count: number }>;
}

interface Props {
  chatLoading: boolean;
  chatStats: ChatStats | null;
}

export const ChatSection: FC<Props> = ({ chatLoading, chatStats }) => (
  <div className="space-y-4">
    {chatLoading && (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    )}

    {!chatLoading && !chatStats && (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">No hay datos de chat disponibles.</p>
      </div>
    )}

    {!chatLoading && chatStats && (
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageCircle className="h-4 w-4 text-indigo-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Total sesiones</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{chatStats.total}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Resueltas</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {chatStats.total > 0 ? Math.round((chatStats.resolved / chatStats.total) * 100) : 0}%
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageCircle className="h-4 w-4 text-green-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">A WhatsApp</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{chatStats.whatsapp}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Msg promedio</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{chatStats.avgMessages}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Sesiones por rol</h3>
          <div className="space-y-2">
            {Object.entries(chatStats.byRole).map(([role, count]) => {
              const pct = chatStats.total > 0 ? Math.round((count / chatStats.total) * 100) : 0;
              const label = role === 'nurse' ? 'Enfermeras' : role === 'family' ? 'Familias' : role === 'admin' ? 'Admin' : 'Visitantes';
              const color = role === 'nurse' ? 'bg-emerald-500' : role === 'family' ? 'bg-indigo-500' : role === 'admin' ? 'bg-amber-500' : 'bg-slate-400';
              return (
                <div key={role} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600 w-20">{label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div className={`${color} h-full rounded-full flex items-center justify-end px-2`} style={{ width: `${Math.max(pct, 8)}%` }}>
                      <span className="text-[10px] font-bold text-white">{count}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {chatStats.topTopics.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Temas más consultados</h3>
            <div className="flex flex-wrap gap-2">
              {chatStats.topTopics.map((t, i) => (
                <div key={t.topic} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-bold text-indigo-400">#{i + 1}</span>
                  <span className="text-xs font-bold text-indigo-700 capitalize">{t.topic}</span>
                  <span className="text-[10px] text-indigo-400 bg-indigo-100 rounded-full px-1.5 py-0.5">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {chatStats.last7Days.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Actividad (últimos 7 días)</h3>
            <div className="flex items-end justify-between gap-2 h-32">
              {chatStats.last7Days.map((d) => {
                const maxCount = Math.max(...chatStats.last7Days.map(x => x.count), 1);
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

        {chatStats.total === 0 && (
          <div className="text-center py-8 bg-white rounded-2xl border border-slate-200">
            <p className="text-sm text-slate-500">Aún no hay sesiones de chat registradas.</p>
          </div>
        )}
      </>
    )}
  </div>
);
