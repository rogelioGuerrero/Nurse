import { type FC } from 'react';
import { Mail, Loader2 } from 'lucide-react';

interface SupportEmail {
  id: string;
  from_email: string;
  subject: string;
  body: string;
  classification: string;
  auto_replied: boolean;
  auto_reply_body: string | null;
  needs_human: boolean;
  created_at: string;
}

interface Props {
  supportLoading: boolean;
  supportEmails: SupportEmail[];
  supportFilter: 'needs_human' | 'all' | 'auto_replied';
  setSupportFilter: (f: 'needs_human' | 'all' | 'auto_replied') => void;
  markEmailResolved: (id: string) => void;
}

export const SupportSection: FC<Props> = ({
  supportLoading, supportEmails, supportFilter, setSupportFilter, markEmailResolved
}) => (
  <div className="space-y-4">
    <div className="flex gap-2">
      {[
        { key: 'needs_human' as const, label: 'Necesitan respuesta' },
        { key: 'auto_replied' as const, label: 'Auto-respondidos' },
        { key: 'all' as const, label: 'Todos' },
      ].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSupportFilter(key)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
            supportFilter === key ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          {label}
          {key === 'needs_human' && supportEmails.filter(e => e.needs_human).length > 0 && (
            <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1.5 py-0.5">{supportEmails.filter(e => e.needs_human).length}</span>
          )}
        </button>
      ))}
    </div>

    {supportLoading && (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    )}

    {!supportLoading && (() => {
      const filtered = supportEmails.filter(e => {
        if (supportFilter === 'needs_human') return e.needs_human;
        if (supportFilter === 'auto_replied') return e.auto_replied;
        return true;
      });

      if (filtered.length === 0) {
        return (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <Mail className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {supportFilter === 'needs_human' ? 'No hay correos pendientes de respuesta.' : 'No hay correos registrados.'}
            </p>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {filtered.map((email) => (
            <div key={email.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-800 truncate">{email.subject || '(sin asunto)'}</p>
                    {email.needs_human && (
                      <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">Requiere atención</span>
                    )}
                    {email.auto_replied && (
                      <span className="bg-emerald-100 text-emerald-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">Auto-respondido</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">De: {email.from_email} · {new Date(email.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>
                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full shrink-0 capitalize">{email.classification}</span>
              </div>
              {email.body && (
                <p className="text-[11px] text-slate-600 line-clamp-3">{email.body.substring(0, 300)}</p>
              )}
              {email.auto_reply_body && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Respuesta enviada:</p>
                  <p className="text-[11px] text-slate-600 line-clamp-3">{email.auto_reply_body.replace(/<[^>]*>/g, '').substring(0, 200)}</p>
                </div>
              )}
              {email.needs_human && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400">Respondé desde Hostinger \u2192 info@agtisa.com</p>
                  <button
                    onClick={() => markEmailResolved(email.id)}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 cursor-pointer"
                  >
                    Marcar como resuelto
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      );
    })()}
  </div>
);
