import { type FC, useState, useRef } from 'react';
import { Stethoscope, Search, ShieldCheck, Calendar, DollarSign, ChevronDown, ChevronUp, UserCheck, Clock, MapPin, FileText, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LandingPageProps {
  onFamily: () => void;
  onNurse: () => void;
  onAdminAccess?: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ onFamily, onNurse, onAdminAccess }) => {
  const [demoLoading, setDemoLoading] = useState(false);
  const [showFaq, setShowFaq] = useState<number | null>(null);
  const logoClicks = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = () => {
    logoClicks.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      if (logoClicks.current >= 5 && onAdminAccess) {
        onAdminAccess();
      }
      logoClicks.current = 0;
    }, 800);
  };

  const handleDemoLogin = async (role: 'family' | 'nurse') => {
    setDemoLoading(true);
    const email = role === 'family' ? 'familia@biencudar.com' : 'enfermera@biencudar.com';
    const password = 'demo123';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { console.error('Demo login error:', error.message); setDemoLoading(false); return; }
      window.location.reload();
    } catch (err) { console.error('Demo login error:', err); setDemoLoading(false); }
  };

  const faqs = [
    { q: '¿BienCuidar es una agencia de enfermería?', a: 'No. Somos una plataforma que conecta enfermeras con familias. Tú eres independiente, decides tus turnos y tu tarifa.' },
    { q: '¿Necesito tener CSSP?', a: 'Sí. El registro CSSP es obligatorio por ley. Nosotros lo verificamos para que las familias confíen en ti.' },
    { q: '¿Cuánto cobro por mi servicio?', a: 'Tú defines tu tarifa por turno. Nosotros no te decimos cuánto cobrar.' },
    { q: '¿Tengo que pagar para registrarme?', a: 'No. El registro es gratis. BienCuidar cobra una pequeña comisión por gestión solo cuando hay factura.' },
    { q: '¿Estoy obligada a aceptar solicitudes?', a: 'No. Ves las solicitudes en la app y decides cuáles aceptar. Puedes rechazar todas si no te convienen.' },
    { q: '¿Puedo cobrar directo sin factura?', a: 'Sí. Si prefieres cobrar directo a la familia, también se puede. La factura y FSEE son opcionales.' },
    { q: '¿Qué pasa si ya tengo trabajo?', a: 'Perfecto. BienCuidar es para complementar tus ingresos. Aceptas turnos solo cuando tengas tiempo libre.' },
    { q: '¿En qué parte de El Salvador funciona?', a: 'En todo el país. Las familias publican solicitudes con su ubicación y tú decides si te queda cerca.' },
  ];

  const benefits = [
    { icon: Calendar, title: 'Flexibilidad total', desc: 'Elige turnos, días y duración. Desde 1 turno hasta 1 mes.' },
    { icon: ShieldCheck, title: 'CSSP verificado', desc: 'Tu registro verificado = más confianza de las familias = más ofertas.' },
    { icon: DollarSign, title: 'Tú defines tu tarifa', desc: 'Nadie te dice cuánto cobrar. Tú pones tu precio por turno.' },
    { icon: MapPin, title: 'Sabes a quién cuidas', desc: 'Ves la información de la familia y el paciente antes de aceptar.' },
    { icon: FileText, title: 'Formalidad opcional', desc: '¿Factura y FSEE? Te gestionamos todo. ¿Prefieres cobrar directo? También.' },
    { icon: Clock, title: 'Sin renunciar a nada', desc: 'Complementa tus ingresos. Aceptas turnos solo cuando tengas tiempo.' },
  ];

  const steps = [
    { icon: UserCheck, title: 'Regístrate', desc: 'Crea tu cuenta con tus datos profesionales y número de CSSP.' },
    { icon: ShieldCheck, title: 'Verificamos tu CSSP', desc: 'Confirmamos tu registro ante el CSSP. Las familias ven tu badge de verificación.' },
    { icon: Stethoscope, title: 'Recibe solicitudes', desc: 'Las familias publican solicitudes. Tú ves los detalles y decides cuáles aceptar.' },
  ];

  return (
    <div className="min-h-[100vh] bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-md mx-auto px-5 py-8 space-y-10">

        {/* Logo - 5 clicks to reveal admin login */}
        <div className="text-center space-y-2">
          <div onClick={handleLogoClick} className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm cursor-pointer select-none">
            <Stethoscope className="h-7 w-7 text-white" />
          </div>
          <div onClick={handleLogoClick} className="cursor-pointer select-none">
            <h1 className="text-2xl font-serif italic tracking-tight text-slate-900">BienCuidar</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Cuidado de la salud en El Salvador</p>
          </div>
        </div>

        {/* Hero - Nurse first */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <p className="text-[10px] font-bold text-emerald-700">Registro gratis para enfermeras</p>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">
            Tú eliges cuándo.<br />Nosotros conseguimos los pacientes.
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            BienCuidar conecta enfermeras profesionales con familias que necesitan cuidado a domicilio en El Salvador.
          </p>
          <div className="space-y-2.5 pt-2">
            <button
              onClick={onNurse}
              className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-bold text-sm shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Stethoscope className="h-5 w-5" />
              Soy enfermera - Regístrate gratis
            </button>
            <button
              onClick={onFamily}
              className="w-full bg-white text-slate-700 border border-slate-200 rounded-2xl py-3.5 font-bold text-sm shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search className="h-5 w-5 text-indigo-600" />
              Buscar enfermera para mi familia
            </button>
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-4">
          <h3 className="text-center text-sm font-bold text-slate-800 uppercase tracking-wide">Cómo funciona</h3>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-4">
                <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                  <step.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-indigo-600">PASO {i + 1}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{step.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="space-y-4">
          <h3 className="text-center text-sm font-bold text-slate-800 uppercase tracking-wide">Por qué unirte a BienCuidar</h3>
          <div className="grid grid-cols-1 gap-3">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3.5">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                  <b.icon className="h-4.5 w-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{b.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-4">
          <h3 className="text-center text-sm font-bold text-slate-800 uppercase tracking-wide">Preguntas frecuentes</h3>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowFaq(showFaq === i ? null : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-700 pr-2">{faq.q}</span>
                  {showFaq === i ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                </button>
                {showFaq === i && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-slate-500 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="bg-indigo-600 rounded-2xl p-6 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 text-white mx-auto" />
          <p className="text-lg font-bold text-white">¿Lista para empezar?</p>
          <p className="text-xs text-indigo-100">Regístrate gratis y recibe solicitudes de familias en tu área.</p>
          <button
            onClick={onNurse}
            className="w-full bg-white text-indigo-600 rounded-xl py-3.5 font-bold text-sm active:scale-[0.98] transition cursor-pointer"
          >
            Regístrate gratis
          </button>
        </div>

        {/* Demo Buttons */}
        <div className="space-y-2">
          <p className="text-center text-[10px] text-slate-400 uppercase font-bold tracking-wide">Demo (solo para pruebas)</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDemoLogin('family')}
              disabled={demoLoading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-600 font-bold py-2.5 rounded-xl transition text-[11px] cursor-pointer"
            >
              {demoLoading ? 'Cargando...' : 'Demo Paciente'}
            </button>
            <button
              onClick={() => handleDemoLogin('nurse')}
              disabled={demoLoading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-600 font-bold py-2.5 rounded-xl transition text-[11px] cursor-pointer"
            >
              {demoLoading ? 'Cargando...' : 'Demo Enfermera'}
            </button>
          </div>
        </div>

        {/* Trust badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 pb-6">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>Profesionales registradas ante el Ministerio de Salud</span>
        </div>

      </div>
    </div>
  );
};
