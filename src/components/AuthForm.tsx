import { useState, type FC } from 'react';
import { Stethoscope, User, Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  mode: 'login' | 'register';
  role: 'family' | 'nurse';
  onBack: () => void;
  onSuccess: () => void;
}

export const AuthForm: FC<AuthFormProps> = ({ mode, role, onBack, onSuccess }) => {
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const validatePassword = (value: string): boolean => {
    return value.length >= 6;
  };

  const handleRegister = () => {
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

    // Check if email already exists in localStorage
    const existingUser = localStorage.getItem(`biencuidar_user_${email}`);
    if (existingUser) {
      setError('Este email ya está registrado');
      return;
    }

    setLoading(true);

    try {
      // Create new profile
      const newProfile = {
        id: `p-${Date.now()}`,
        full_name: fullName,
        phone: '',
        email: email,
        role: role === 'nurse' ? 'nurse' : 'user',
        location_name: '',
        created_at: new Date().toISOString()
      };

      // Store user data with password (in production: hash this!)
      const userData = {
        ...newProfile,
        password: password
      };

      localStorage.setItem(`biencuidar_user_${email}`, JSON.stringify(userData));
      
      // Set current user
      localStorage.setItem('biencuidar_current_user', JSON.stringify(newProfile));
      
      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setError('Error al crear cuenta. Intenta nuevamente.');
    }
  };

  const handleLogin = () => {
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
      // Check stored user data
      const userData = localStorage.getItem(`biencuidar_user_${email}`);
      if (!userData) {
        setError('Email no registrado');
        setLoading(false);
        return;
      }

      const parsedUser = JSON.parse(userData);
      if (parsedUser.password !== password) {
        setError('Contraseña incorrecta');
        setLoading(false);
        return;
      }

      // Check role matches
      if ((role === 'nurse' && parsedUser.role !== 'nurse') || 
          (role === 'family' && parsedUser.role === 'nurse')) {
        setError('Esta cuenta no tiene el rol correcto');
        setLoading(false);
        return;
      }

      // Login successful - set current user
      const userProfile = {
        id: parsedUser.id || `p-${Date.now()}`,
        full_name: parsedUser.full_name,
        phone: parsedUser.phone || '',
        email: parsedUser.email,
        role: parsedUser.role,
        location_name: parsedUser.location_name || '',
        created_at: parsedUser.created_at
      };

      localStorage.setItem('biencuidar_current_user', JSON.stringify(userProfile));
      
      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setError('Error al iniciar sesión. Intenta nuevamente.');
    }
  };

  const handleSubmit = () => {
    if (mode === 'register') {
      handleRegister();
    } else {
      handleLogin();
    }
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
            <h1 className="text-2xl font-serif italic tracking-tight text-slate-900">BienCuidar</h1>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1">
              {mode === 'register' ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </p>
            <p className="text-sm font-bold text-slate-700 mt-2">
              {role === 'nurse' ? 'Enfermera' : 'Familia'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          
          {mode === 'register' && (
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

          {mode === 'register' && (
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

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">{error}</p>
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
                {mode === 'register' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Crear Cuenta
                  </>
                ) : (
                  'Iniciar Sesión'
                )}
              </>
            )}
          </button>

          {mode === 'login' && (
            <p className="text-center text-xs text-slate-500">
              ¿No tienes cuenta?{' '}
              <button 
                onClick={() => window.location.reload()}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Regístrate
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
