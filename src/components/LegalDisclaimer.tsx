import { type FC } from 'react';
import { ShieldAlert } from 'lucide-react';

interface LegalDisclaimerProps {
  variant?: 'compact' | 'full';
}

export const LegalDisclaimer: FC<LegalDisclaimerProps> = ({ variant = 'compact' }) => {
  if (variant === 'full') {
    return (
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Aviso de Responsabilidad
            </h4>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              BienCuidar es una plataforma de intermediación tecnológica. El contrato de servicios
              se celebra <strong>directamente entre la familia y la enfermera</strong>.
              BienCuidar no es empleador ni responsable de los actos clínicos.
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              La enfermera es <strong>única responsable</strong> de su ejercicio profesional.
              Cualquier reclamación debe dirigirse contra la enfermera prestadora del servicio.
              Verifica el registro CSSP antes de contratar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 px-1">
      <ShieldAlert className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[9px] text-slate-400 leading-relaxed">
        BienCuidar es intermediario tecnológico, no empleador. La enfermera responde por sus
        actos clínicos. Verifica su registro CSSP antes de contratar.
      </p>
    </div>
  );
};
