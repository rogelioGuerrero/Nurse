import { type FC } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Clock, Shield } from 'lucide-react';
import type { Nurse } from '../types';

interface CSSPVerificationBadgeProps {
  nurse: Nurse;
  variant?: 'full' | 'compact';
}

interface BadgeConfig {
  icon: typeof ShieldCheck;
  bg: string;
  text: string;
  label: string;
  sublabel: string;
}

function getBadgeConfig(nurse: Nurse): BadgeConfig {
  const status = nurse.cssp_verification_status || 'unverified';

  switch (status) {
    case 'auto_verified':
      return {
        icon: ShieldCheck,
        bg: 'bg-emerald-50 border-emerald-200',
        text: 'text-emerald-700',
        label: 'CSSP Verificado',
        sublabel: 'Registro confirmado automáticamente',
      };
    case 'manual_verified':
      return {
        icon: ShieldCheck,
        bg: 'bg-blue-50 border-blue-200',
        text: 'text-blue-700',
        label: 'CSSP Verificado',
        sublabel: 'Verificado por BienCuidar',
      };
    case 'pending':
      return {
        icon: Clock,
        bg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-700',
        label: 'Verificación en proceso',
        sublabel: 'Verifica en el portal del CSSP antes de contratar',
      };
    case 'rejected':
      return {
        icon: ShieldX,
        bg: 'bg-rose-50 border-rose-200',
        text: 'text-rose-700',
        label: 'Registro no confirmado',
        sublabel: 'Contrata bajo tu responsabilidad',
      };
    default:
      return {
        icon: ShieldAlert,
        bg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-700',
        label: 'No verificado automáticamente',
        sublabel: 'Verifica en el portal del CSSP antes de contratar',
      };
  }
}

export const CSSPVerificationBadge: FC<CSSPVerificationBadgeProps> = ({ nurse, variant = 'full' }) => {
  const config = getBadgeConfig(nurse);
  const Icon = config.icon;

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${config.bg}`}>
        <Icon className={`h-3 w-3 ${config.text} shrink-0`} />
        <span className={`text-[10px] font-bold ${config.text}`}>{config.label}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${config.bg}`}>
      <Icon className={`h-5 w-5 ${config.text} shrink-0 mt-0.5`} />
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${config.text}`}>{config.label}</span>
          <span className="text-[10px] text-slate-500 font-mono">{nurse.cssp_registration}</span>
        </div>
        <p className={`text-[10px] ${config.text} opacity-80 leading-relaxed`}>{config.sublabel}</p>
        {(nurse.cssp_verification_status === 'unverified' ||
          nurse.cssp_verification_status === 'pending' ||
          nurse.cssp_verification_status === 'rejected') && (
          <a
            href="https://cssp.gob.sv/profesionales/faces/consulta/buscar.xhtml"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-indigo-600 font-bold hover:underline inline-flex items-center gap-0.5"
          >
            <Shield className="h-3 w-3" />
            Verificar en portal CSSP →
          </a>
        )}
      </div>
    </div>
  );
};
