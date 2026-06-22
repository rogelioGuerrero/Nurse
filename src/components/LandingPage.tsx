import { type FC, useState } from 'react';
import { Stethoscope, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LandingPageProps {
  onFamily: () => void;
  onNurse: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ onFamily, onNurse }) => {
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemoLogin = async (role: 'family' | 'nurse') => {
    setDemoLoading(true);
    
    const email = role === 'family' ? 'familia@biencudar.com' : 'enfermera@biencudar.com';
    const password = 'demo123';
    const fullName = role === 'family' ? 'María García (Demo)' : 'Ana Martínez (Demo)';

    try {
      // Try to sign up (will fail if user exists)
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role === 'nurse' ? 'nurse' : 'user'
          }
        }
      });

      // If user already exists, just log in
      if (signUpError && !signUpError.message.includes('already registered')) {
        console.error('Demo signup error:', signUpError);
      }

      // Log in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error('Demo login error:', signInError);
        setDemoLoading(false);
        return;
      }

      // Reload to trigger AppContext to load user
      window.location.reload();
    } catch (err) {
      console.error('Demo login error:', err);
      setDemoLoading(false);
    }
  };
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

        {/* Demo Buttons */}
        <div className="space-y-2">
          <button
            onClick={() => handleDemoLogin('family')}
            disabled={demoLoading}
            className="w-full bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-600 font-bold py-3 rounded-xl transition text-xs cursor-pointer"
          >
            {demoLoading ? 'Cargando...' : 'Demo Paciente'}
          </button>
          <button
            onClick={() => handleDemoLogin('nurse')}
            disabled={demoLoading}
            className="w-full bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-600 font-bold py-3 rounded-xl transition text-xs cursor-pointer"
          >
            {demoLoading ? 'Cargando...' : 'Demo Enfermera'}
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
