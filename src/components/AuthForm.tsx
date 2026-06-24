import { useState, useEffect, type FC } from 'react';
import { Stethoscope, User, Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle, FileText, ShieldAlert, BadgeCheck } from 'lucide-react';
import type { Nurse } from '../types';
import { supabase } from '../lib/supabase';
import { TermsAndConditions } from './TermsAndConditions';
import { validateCSSPRegistration } from '../lib/csspValidation';

interface AuthFormProps {
  mode: 'login' | 'register';
  role: 'family' | 'nurse';
  onBack: () => void;
  onSuccess: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot-password';

export const AuthForm: FC<AuthFormProps> = ({ mode, role, onBack, onSuccess }) => {
  
  const [authMode, setAuthMode] = useState<AuthMode>(mode);
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [csspRegistration, setCsspRegistration] = useState('');
  const [csspLevel, setCsspLevel] = useState<'Licenciada' | 'Tecnóloga' | 'Técnica' | 'Auxiliar'>('Técnica');

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const validatePassword = (value: string): boolean => {
    return value.length >= 6;
  };

  const handleRegister = async () => {
    setError('');
    
    if (!fullName.trim()) {
      setError('Ingresa tu nombre completo');
      return;
    }

    if (!validateEmail(email)) {
      setError('Ingresa un email válido');
      return;
    }

    if (!validatePassword(password)) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (!acceptedTerms) {
      setError('Debes aceptar los Términos y Condiciones para registrarte');
      return;
    }

    if (role === 'nurse') {
      const csspCheck = validateCSSPRegistration(csspRegistration);
      if (!csspCheck.valid) {
        setError(csspCheck.message);
        return;
      }
    }

    setLoading(true);

    try {
      // Register with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role === 'nurse' ? 'nurse' : 'user'
          }
        }
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Error al crear cuenta');
        setLoading(false);
        return;
      }

      // Create profile in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: email,
          full_name: fullName,
          role: role === 'nurse' ? 'nurse' : 'user',
          phone: '',
          location_name: ''
        });

      if (profileError) {
        setError('Error al crear perfil: ' + profileError.message);
        setLoading(false);
        return;
      }

      // If nurse, create Nurse profile
      if (role === 'nurse') {
        const { error: nurseError } = await supabase
          .from('nurses')
          .insert({
            user_id: authData.user.id,
            specialization: [],
            shift_rate: 15,
            coverage_radius: 10,
            available_shifts: ['morning'],
            available_days: [1, 2, 3, 4, 5],
            rating: 0,
            review_count: 0,
            lat: 13.6929,
            lng: -89.2182,
            bio: '',
            experience_years: 0,
            certifications: ['CSSP'],
            cssp_registration: csspRegistration,
            cssp_level: csspLevel,
            cssp_verification_status: 'unverified',
            cssp_verified: false
          });

        if (nurseError) {
          setError('Error al crear perfil de enfermera: ' + nurseError.message);
          setLoading(false);
          return;
        }
      }
      
      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setError('Error al crear cuenta. Intenta nuevamente.');
    }
  };

  const handleLogin = async () => {
    setError('');
    
    if (!validateEmail(email)) {
      setError('Ingresa un email válido');
      return;
    }

    if (!validatePassword(password)) {
      setError('Ingresa tu contraseña');
      return;
    }

    setLoading(true);

    try {
      // Login with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Error al iniciar sesión');
        setLoading(false);
        return;
      }

      // Get profile from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        setError('Perfil no encontrado');
        setLoading(false);
        return;
      }

      // Check role matches
      if ((role === 'nurse' && profile.role !== 'nurse') || 
          (role === 'family' && profile.role === 'nurse')) {
        setError('Esta cuenta no tiene el rol correcto');
        setLoading(false);
        return;
      }

      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setError('Error al iniciar sesión. Intenta nuevamente.');
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setMessage('');
    
    if (!validateEmail(email)) {
      setError('Ingresa un email válido');
      return;
    }

    setLoading(true);

    try {
      // Send password reset email via Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });

      if (error) {
        setError('Error al enviar email de recuperación: ' + error.message);
        setLoading(false);
        return;
      }
      
      setMessage('Email de recuperación enviado. Revisa tu bandeja de entrada.');
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError('Error al procesar solicitud. Intenta nuevamente.');
    }
  };

  const handleSubmit = () => {
    if (authMode === 'register') {
      handleRegister();
    } else if (authMode === 'login') {
      handleLogin();
    } else if (authMode === 'forgot-password') {
      handleForgotPassword();
    }
  };

  const getTitle = () => {
    if (authMode === 'register') return 'Crear Cuenta';
    if (authMode === 'login') return 'Iniciar Sesión';
    if (authMode === 'forgot-password') return 'Recuperar Contraseña';
    return '';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="w-full max-w-sm space-y-6">
        
        {/* Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold text-sm cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>

        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            {role === 'nurse' ? (
              <Stethoscope className="h-7 w-7 text-white" />
            ) : (
              <User className="h-7 w-7 text-white" />
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1">
              {getTitle()}
            </p>
            <p className="text-sm font-bold text-slate-700 mt-2">
              {role === 'nurse' ? 'Enfermera' : 'Familia'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          
          {authMode === 'register' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                Nombre Completo
              </label>
              <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                <div className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="María García"
                  className="w-full bg-transparent pl-10 pr-3 py-2.5 outline-none font-medium text-slate-800 text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Correo Electrónico
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <div className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@gmail.com"
                className="w-full bg-transparent pl-10 pr-3 py-2.5 outline-none font-medium text-slate-800 text-sm"
              />
            </div>
          </div>

          {authMode !== 'forgot-password' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                Contraseña
              </label>
              <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                <div className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  minLength={6}
                  className="w-full bg-transparent pl-10 pr-3 py-2.5 outline-none font-medium text-slate-800 text-sm"
                />
              </div>
            </div>
          )}

          {authMode === 'register' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                Confirmar Contraseña
              </label>
              <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                <div className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  minLength={6}
                  className="w-full bg-transparent pl-10 pr-3 py-2.5 outline-none font-medium text-slate-800 text-sm"
                />
              </div>
            </div>
          )}

          {authMode === 'register' && role === 'nurse' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Número de Registro CSSP *
                </label>
                <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                  <div className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <BadgeCheck className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={csspRegistration}
                    onChange={(e) => setCsspRegistration(e.target.value)}
                    placeholder="CSSP-ENF-2024-0456"
                    className="w-full bg-transparent pl-10 pr-3 py-2.5 outline-none font-medium text-slate-800 text-sm"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Obligatorio por ley. Será verificado por el administrador.</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Nivel Profesional
                </label>
                <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                  <select
                    value={csspLevel}
                    onChange={(e) => setCsspLevel(e.target.value as typeof csspLevel)}
                    className="w-full bg-transparent pl-3 pr-3 py-2.5 outline-none font-medium text-slate-800 text-sm appearance-none"
                  >
                    <option value="Licenciada">Licenciada</option>
                    <option value="Tecnóloga">Tecnóloga</option>
                    <option value="Técnica">Técnica</option>
                    <option value="Auxiliar">Auxiliar</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">{error}</p>
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 leading-relaxed">{message}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                {authMode === 'register' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Crear Cuenta
                  </>
                ) : authMode === 'forgot-password' ? (
                  'Enviar Email'
                ) : (
                  'Iniciar Sesión'
                )}
              </>
            )}
          </button>

          {authMode === 'login' && (
            <p className="text-center text-xs text-slate-500">
              ¿Olvidaste tu contraseña?{' '}
              <button 
                onClick={() => setAuthMode('forgot-password')}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Recuperar
              </button>
            </p>
          )}

          {authMode === 'forgot-password' && (
            <p className="text-center text-xs text-slate-500">
              <button 
                onClick={() => setAuthMode('login')}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Volver a Iniciar Sesión
              </button>
            </p>
          )}

          {authMode === 'login' && (
            <p className="text-center text-xs text-slate-500">
              ¿No tienes cuenta?{' '}
              <button 
                onClick={() => setAuthMode('register')}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Regístrate
              </button>
            </p>
          )}

          {authMode === 'register' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  BienCuidar es una plataforma de intermediación tecnológica. No es empleador ni responsable
                  de los actos clínicos de las enfermeras. El contrato de servicios se celebra directamente
                  entre la familia y la enfermera.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                  <span className="text-[11px] text-slate-600 leading-relaxed">
                    Acepto los{' '}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-0.5"
                    >
                      <FileText className="h-3 w-3" />
                      Términos y Condiciones
                    </button>{' '}
                    y comprendo que BienCuidar es una plataforma de intermediación, no empleadora.
                  </span>
                </label>
              </div>

              <p className="text-center text-xs text-slate-500">
                ¿Ya tienes cuenta?{' '}
                <button
                  onClick={() => setAuthMode('login')}
                  className="text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  Inicia Sesión
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      <TermsAndConditions
        open={showTerms}
        onClose={() => setShowTerms(false)}
        role={role}
      />
    </div>
  );
};
