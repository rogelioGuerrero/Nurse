import { type FC } from 'react';
import { Stethoscope, Search, ShieldCheck } from 'lucide-react';

interface LandingPageProps {
  onFamily: () => void;
  onNurse: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ onFamily, onNurse }) => {
  return (
    <div className="min-h-[100vh] flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Stethoscope className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-serif italic tracking-tight text-slate-900">BienCuidar</h1>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1">Cuidado del Adulto Mayor</p>
          </div>
        </div>

        {/* Tagline */}
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800 leading-snug">
            Enfermeras profesionales<br />al cuido de tu familiar
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Registradas ante el CSSP.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={onFamily}
            className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-bold text-sm shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Search className="h-5 w-5" />
            Buscar Enfermera
          </button>

          <button
            onClick={onNurse}
            className="w-full bg-white text-slate-700 border border-slate-200 rounded-2xl py-4 font-bold text-sm shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Stethoscope className="h-5 w-5 text-indigo-600" />
            Enfermera registro/ingreso
          </button>
        </div>

        {/* Trust badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>Profesionales registradas ante el Ministerio de Salud</span>
        </div>

      </div>
    </div>
  );
};
