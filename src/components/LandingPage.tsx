import { type FC, useState, useRef } from 'react';
import { Stethoscope, Search, ShieldCheck, Calendar, DollarSign, ChevronDown, ChevronUp, UserCheck, Clock, MapPin, FileText, CheckCircle2, MessageCircle, Heart, LogIn, PlayCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SupportChat } from './SupportChat';

interface LandingPageProps {
  onFamily: () => void;
  onNurse: () => void;
  onAdminAccess?: () => void;
  onLogin?: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ onFamily, onNurse, onAdminAccess, onLogin }) => {
  const [demoLoading, setDemoLoading] = useState(false);
  const [showFaq, setShowFaq] = useState<number | null>(null);
  const [showFaqSection, setShowFaqSection] = useState(false);
  const [showBenefit, setShowBenefit] = useState<number | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [viewMode, setViewMode] = useState<'nurse' | 'family'>('nurse');
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
    const email = role === 'family' ? 'familia@biencuidar.com' : 'enfermera@biencuidar.com';
    const password = 'demo123';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { console.error('Demo login error:', error.message); setDemoLoading(false); return; }
      window.location.reload();
    } catch (err) { console.error('Demo login error:', err); setDemoLoading(false); }
  };

  const faqs = viewMode === 'nurse' ? [
    { q: '¿BienCuidar es una agencia de enfermería?', a: 'No. Somos una plataforma que conecta enfermeras con familias. Tú eres independiente, decides tus turnos y tu tarifa.' },
    { q: '¿Necesito tener CSSP?', a: 'Sí. El registro CSSP es obligatorio por ley. Nosotros lo verificamos para que las familias confíen en ti.' },
    { q: '¿Cuánto cobro por mi servicio?', a: 'Tú defines tu tarifa por turno. Nosotros no te decimos cuánto cobrar.' },
    { q: '¿Tengo que pagar para registrarme?', a: 'No. El registro es gratis. BienCuidar cobra una pequeña comisión por gestión solo cuando hay factura.' },
    { q: '¿Estoy obligada a aceptar solicitudes?', a: 'No. Ves las solicitudes en la app y decides cuáles aceptar. Puedes rechazar todas si no te convienen.' },
    { q: '¿Puedo cobrar directo sin factura?', a: 'Sí. Si prefieres cobrar directo a la familia, también se puede. La factura y FSEE son opcionales.' },
    { q: '¿Qué pasa si ya tengo trabajo?', a: 'Perfecto. BienCuidar es para complementar tus ingresos. Aceptas turnos solo cuando tengas tiempo libre.' },
    { q: '¿En qué parte de El Salvador funciona?', a: 'En todo el país. Las familias publican solicitudes con su ubicación y tú decides si te queda cerca.' },
    { q: '¿Cómo me contactan las familias?', a: 'Todo se hace dentro de la plataforma de BienCuidar. Las familias publican solicitudes de cuidado y a ti te llegan en la bandeja de la app. Ves los detalles del paciente, horarios y ubicación, y decides si aceptas o rechazas. No necesitas dar tu número a nadie directamente — solo después de aceptar una solicitud se comparte la información de contacto para la visita.' },
    { q: '¿Tengo que dar mi número de teléfono?', a: 'No directamente. Toda la coordinación inicial se hace dentro de la plataforma de BienCuidar. Solo después de que aceptes una solicitud de cuidado se comparten los datos de contacto entre la familia y tú para coordinar la visita.' },
    { q: '¿Hay plazas disponibles?', a: 'No manejamos "plazas" como un empleo tradicional. Las familias publican solicitudes de cuidado cuando las necesitan, y tú decides cuáles aceptar. No hay límite de cupo para registrarte — siempre hay nuevas solicitudes llegando.' },
    { q: '¿Los hombres pueden registrarse?', a: 'Sí. BienCuidar está abierto a todos los profesionales de enfermería registrados ante el CSSP, sin importar género. Lo que importa es tu registro vigente y tu disposición para cuidar.' },
  ] : [
    { q: '¿Qué es BienCuidar?', a: 'Una plataforma que conecta familias con enfermeras profesionales verificadas en El Salvador. Nosotros verificamos las credenciales, tú eliges a la enfermera.' },
    { q: '¿Las enfermeras están verificadas?', a: 'Sí. Verificamos el registro CSSP de cada enfermera ante el portal oficial del Ministerio de Salud. Nadie cuida a tu ser querido sin pasar por nuestra verificación.' },
    { q: '¿Cuánto cuesta?', a: 'La tarifa la define cada enfermera según su especialidad y experiencia. Tú ves el precio antes de aceptar cualquier oferta. Sin sorpresas.' },
    { q: '¿Tengo que pagar para publicar mi necesidad?', a: 'No. Publicar es gratis. Solo pagas a la enfermera cuando aceptas una oferta que te convenza.' },
    { q: '¿Cómo funciona?', a: 'Publicas la necesidad de cuidado (condición, fechas, ubicación), las enfermeras verificadas te envían ofertas con su tarifa, y tú eliges la que prefieras.' },
    { q: '¿Puedo ver el perfil de la enfermera antes de aceptar?', a: 'Sí. Ves su especialidad, años de experiencia, calificaciones de otras familias y tarifa por turno. Todo transparente antes de decidir.' },
    { q: '¿Y si no me gusta ninguna oferta?', a: 'Puedes rechazar todas sin compromiso. Publicas de nuevo cuando quieras, las veces que necesites. No hay contratos forzados.' },
    { q: '¿Cómo pago a la enfermera?', a: 'Dos opciones: pago directo (efectivo o transferencia a la enfermera) o pago con factura a través de BienCuidar, donde actuamos como agente de retención.' },
    { q: '¿Puedo cancelar?', a: 'Sí, sin costo hasta 24 horas antes del turno. Menos de 24 horas tiene un cargo del 50% del turno (solo en modalidad con factura).' },
    { q: '¿Qué tipo de cuidados puedo solicitar?', a: 'Geriatría, postoperatorio, cuidados paliativos, heridas crónicas, sondaje, oxígeno permanente, acompañamiento y más. Cualquier necesidad de cuidado en casa.' },
    { q: '¿Mis datos están seguros?', a: 'Sí. Tu información solo se comparte con la enfermera cuya oferta aceptes. Nadie más ve tus datos de contacto hasta que tú decidas.' },
    { q: '¿En qué parte de El Salvador funciona?', a: 'En todo el país. Publicas con tu ubicación y las enfermeras deciden si les queda cerca para ofrecer sus servicios.' },
    { q: '¿Quién es responsable del servicio?', a: 'La enfermera es única responsable de sus actos clínicos. BienCuidar es una plataforma de intermediación y no es parte del contrato entre tú y la enfermera.' },
    { q: '¿Qué pasa si tengo un problema con la enfermera?', a: 'Cualquier disputa se resuelve directamente con la enfermera. BienCuidar puede mediar a solicitud tuya, pero no tiene obligación de hacerlo.' },
    { q: '¿Puedo cambiar de enfermera?', a: 'Sí. Si aún no has aceptado una oferta, puedes rechazar todas y publicar de nuevo. Si ya aceptaste, puedes cancelar sin costo hasta 24 horas antes del turno.' },
    { q: '¿BienCuidar me cobra algo?', a: 'No. Publicar es gratis. Si eliges pagar con factura, hay un cobro por gestión fiscal de US$ 5 por turno. Si pagas directo a la enfermera, no hay ningún cobro.' },
    { q: '¿Qué pasa si la enfermera no llega?', a: 'La coordinación de la visita es directamente entre tú y la enfermera. Si hay problemas, puedes escribirnos a info@agtisa.com y podemos mediar, pero la responsabilidad es de la enfermera.' },
  ];

  const benefits = viewMode === 'nurse' ? [
    { icon: Calendar, title: 'Flexibilidad total', desc: 'Elige turnos, días y duración. Desde 1 turno hasta 1 mes.' },
    { icon: ShieldCheck, title: 'CSSP verificado', desc: 'Tu registro verificado = más confianza de las familias = más ofertas.' },
    { icon: DollarSign, title: 'Tú defines tu tarifa', desc: 'Nadie te dice cuánto cobrar. Tú pones tu precio por turno.' },
    { icon: MapPin, title: 'Sabes a quién cuidas', desc: 'Ves la información de la familia y el paciente antes de aceptar.' },
    { icon: FileText, title: 'Formalidad opcional', desc: '¿Factura y FSEE? Te gestionamos todo. ¿Prefieres cobrar directo? También.' },
    { icon: Clock, title: 'Sin renunciar a nada', desc: 'Complementa tus ingresos. Aceptas turnos solo cuando tengas tiempo.' },
  ] : [
    { icon: ShieldCheck, title: 'Verificadas de verdad', desc: 'Verificamos el registro CSSP de cada enfermera ante el Ministerio de Salud. Nadie cuida a tu ser querido sin pasar por nuestra verificación.' },
    { icon: CheckCircle2, title: 'Tú decides', desc: 'Ves perfiles, tarifas y experiencia antes de aceptar. Nadie te impone una enfermera. Tú comparas y eliges.' },
    { icon: DollarSign, title: 'Transparencia total', desc: 'Cada enfermera pone su precio por turno. Tú ves la tarifa antes de aceptar. Sin sorpresas, sin costos ocultos.' },
    { icon: Heart, title: 'Para cualquier necesidad', desc: 'Geriatría, postoperatorio, paliativos, heridas crónicas, acompañamiento. Cualquier cuidado que tu familia necesite en casa.' },
    { icon: MapPin, title: 'En todo El Salvador', desc: 'Desde San Salvador hasta el oriente. Publicas con tu ubicación y llegan ofertas de enfermeras cercanas.' },
    { icon: FileText, title: 'Sin compromiso', desc: 'Publicas gratis, rechazas las ofertas que no te convenzan. Sin contratos forzados, sin letra pequeña.' },
  ];

  const steps = viewMode === 'nurse' ? [
    { icon: UserCheck, title: 'Regístrate', desc: 'Crea tu cuenta con tus datos profesionales y número de CSSP.' },
    { icon: ShieldCheck, title: 'Verificamos tu CSSP', desc: 'Confirmamos tu registro ante el CSSP. Las familias ven tu sello de verificación.' },
    { icon: Stethoscope, title: 'Recibe solicitudes', desc: 'Las familias publican solicitudes. Tú ves los detalles y decides cuáles aceptar.' },
  ] : [
    { icon: Search, title: 'Publica tu necesidad', desc: 'Describe el caso, los días y la ubicación. Toma menos de 2 minutos y es gratis.' },
    { icon: MessageCircle, title: 'Recibe ofertas', desc: 'Enfermeras verificadas te envían su tarifa y disponibilidad. Tú comparas perfiles.' },
    { icon: UserCheck, title: 'Elige y coordina', desc: 'Aceptas la oferta que prefieras. Los datos de contacto se comparten para coordinar la visita.' },
  ];

  return (
    <div className="min-h-[100vh] bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-md mx-auto px-5 py-8 space-y-10">

        {/* Logo - 5 clicks to reveal admin login */}
        <div className="text-center space-y-2">
          <div onClick={handleLogoClick} className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/25 cursor-pointer select-none ring-1 ring-white/30 backdrop-blur-sm">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <div onClick={handleLogoClick} className="cursor-pointer select-none">
            <h1 className="text-2xl font-serif italic tracking-tight text-slate-900">BienCuidar</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Cuidado de la salud en El Salvador</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="relative flex bg-white/40 backdrop-blur-xl rounded-full p-1 border border-white/50 shadow-sm">
          <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-md transition-transform duration-300 ease-out ${viewMode === 'nurse' ? 'translate-x-0' : 'translate-x-[calc(100%+0px)]'}`} />
          <button
            onClick={() => setViewMode('nurse')}
            className={`relative flex-1 py-2.5 rounded-full text-xs font-bold transition-colors duration-200 cursor-pointer z-10 ${
              viewMode === 'nurse' ? 'text-indigo-600' : 'text-slate-500'
            }`}
          >
            Soy Enfermera
          </button>
          <button
            onClick={() => setViewMode('family')}
            className={`relative flex-1 py-2.5 rounded-full text-xs font-bold transition-colors duration-200 cursor-pointer z-10 ${
              viewMode === 'family' ? 'text-indigo-600' : 'text-slate-500'
            }`}
          >
            Soy Familia
          </button>
        </div>

        {/* Hero - dynamic by view */}
        <div className="text-center space-y-4">
          {viewMode === 'nurse' ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-[10px] font-bold text-emerald-700">Registro gratis para enfermeras</p>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
              <p className="text-[10px] font-bold text-rose-700">Enfermeras verificadas para tu ser querido</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">
            {viewMode === 'nurse' ? (
              <>Tú eliges cuándo.<br />Nosotros conseguimos los pacientes.</>
            ) : (
              <>¿Necesitas una enfermera<br />de confianza en casa?<br />Publicas, ellas te contactan. Tú eliges.</>
            )}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {viewMode === 'nurse'
              ? 'BienCuidar conecta enfermeras profesionales con familias que necesitan cuidado a domicilio en El Salvador.'
              : 'Publica la necesidad de cuidado de tu ser querido. Enfermeras profesionales verificadas te contactan con su tarifa. Tú comparas perfiles y eliges. Sin compromiso.'}
          </p>
          <div className="space-y-2.5 pt-2">
            {viewMode === 'nurse' ? (
              <>
                <button
                  onClick={onNurse}
                  className="w-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl py-4 font-bold text-sm shadow-lg shadow-indigo-500/25 ring-1 ring-white/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Stethoscope className="h-5 w-5" />
                  Soy enfermera - Regístrate gratis
                </button>
                <button
                  onClick={onFamily}
                  className="w-full bg-white/60 backdrop-blur-md text-slate-700 border border-white/50 rounded-2xl py-3.5 font-bold text-sm shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="h-5 w-5 text-indigo-600" />
                  Buscar enfermera para mi familia
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onFamily}
                  className="w-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl py-4 font-bold text-sm shadow-lg shadow-indigo-500/25 ring-1 ring-white/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="h-5 w-5" />
                  Buscar enfermera para mi familia
                </button>
                <button
                  onClick={onNurse}
                  className="w-full bg-white/60 backdrop-blur-md text-slate-700 border border-white/50 rounded-2xl py-3.5 font-bold text-sm shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Stethoscope className="h-5 w-5 text-indigo-600" />
                  Soy enfermera - Regístrate gratis
                </button>
              </>
            )}
          </div>
        </div>

        {/* Login link */}
        {onLogin && (
          <div className="text-center">
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-500 text-xs font-bold transition cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5" />
              ¿Ya tenés cuenta? Iniciar sesión
            </button>
          </div>
        )}

        {/* How it works */}
        <div className="space-y-3">
          <h3 className="text-center text-sm font-bold text-slate-800 uppercase tracking-wide">Cómo funciona</h3>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-indigo-600" />
                  </div>
                  {i < steps.length - 1 && <div className="w-px h-5 bg-slate-200 mt-1" />}
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-indigo-600">PASO {i + 1}</span>
                    <p className="text-sm font-bold text-slate-800">{step.title}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="space-y-3">
          <h3 className="text-center text-sm font-bold text-slate-800 uppercase tracking-wide">
            {viewMode === 'nurse' ? 'Por qué unirte a BienCuidar' : 'Por qué elegir BienCuidar'}
          </h3>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {benefits.map((b, i) => (
              <div
                key={i}
                onClick={() => setShowBenefit(showBenefit === i ? null : i)}
                className="p-3 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 ${viewMode === 'nurse' ? 'bg-emerald-50' : 'bg-indigo-50'} rounded-lg flex items-center justify-center shrink-0`}>
                    <b.icon className={`h-4 w-4 ${viewMode === 'nurse' ? 'text-emerald-600' : 'text-indigo-600'}`} />
                  </div>
                  <p className="text-xs font-bold text-slate-800 flex-1">{b.title}</p>
                  {showBenefit === i ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                </div>
                {showBenefit === i && (
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed pl-9">{b.desc}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-2">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowFaqSection(!showFaqSection)}
              className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">Preguntas frecuentes</span>
              {showFaqSection ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
            </button>
            {showFaqSection && (
              <div className="px-3 pb-3 space-y-2">
                {faqs.map((faq, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowFaq(showFaq === i ? null : i)}
                      className="w-full px-3 py-2.5 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-bold text-slate-700 pr-2">{faq.q}</span>
                      {showFaq === i ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                    </button>
                    {showFaq === i && (
                      <div className="px-3 pb-2.5">
                        <p className="text-xs text-slate-500 leading-relaxed">{faq.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Final CTA */}
        <div className="bg-indigo-600 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-bold text-white leading-tight flex-1 pr-3">
            {viewMode === 'nurse' ? '¿Lista para empezar?' : '¿Necesitas una enfermera?'}
          </p>
          <button
            onClick={viewMode === 'nurse' ? onNurse : onFamily}
            className="bg-white text-indigo-600 rounded-lg px-4 py-2 font-bold text-xs shrink-0 active:scale-[0.98] transition cursor-pointer"
          >
            {viewMode === 'nurse' ? 'Registrarme' : 'Publicar'}
          </button>
        </div>

        {/* Trust badge, Video & Demo */}
        <div className="space-y-3 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Profesionales registradas ante el Ministerio de Salud</span>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setShowVideo(!showVideo)}
              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-500 text-[10px] font-bold transition cursor-pointer"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              {showVideo ? 'Ocultar video' : 'Ver video'}
            </button>
            <span className="text-slate-200">|</span>
            <button
              onClick={() => setShowDemo(!showDemo)}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-500 text-[10px] font-bold transition cursor-pointer"
            >
              {showDemo ? 'Ocultar demo' : 'Demo'}
            </button>
          </div>
          {showVideo && (
            <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-black" style={{ aspectRatio: '16/9' }}>
              <iframe
                src="https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fv%2F1K72qmzudT%2F&show_text=false&show_posts=false&autoplay=false&mute=true"
                className="absolute inset-0 w-full h-full"
                style={{ border: 'none' }}
                scrolling="no"
                frameBorder="0"
                allowFullScreen
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                title="Cómo funciona BienCuidar"
                loading="lazy"
              />
            </div>
          )}
          {showDemo && (
            <div className="flex gap-2 max-w-[200px] mx-auto">
              <button
                onClick={() => handleDemoLogin('family')}
                disabled={demoLoading}
                className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-600 font-bold py-2 rounded-lg transition text-[10px] cursor-pointer"
              >
                {demoLoading ? '...' : 'Paciente'}
              </button>
              <button
                onClick={() => handleDemoLogin('nurse')}
                disabled={demoLoading}
                className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 disabled:cursor-not-allowed text-slate-600 font-bold py-2 rounded-lg transition text-[10px] cursor-pointer"
              >
                {demoLoading ? '...' : 'Enfermera'}
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Support chat widget for visitors */}
      <SupportChat userRole="visitor" />
    </div>
  );
};
