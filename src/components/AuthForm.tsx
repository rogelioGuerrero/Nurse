import { useState, type FC } from 'react';
import { Stethoscope, User, Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  mode: 'login' | 'register';
  role: 'family' | 'nurse';
  onBack: () => void;
  onSuccess: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

export const AuthForm: FC<AuthFormProps> = ({ mode, role, onBack, onSuccess }) => {
  
  const [authMode, setAuthMode] = useState<AuthMode>(mode);
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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

  const handleForgotPassword = () => {
    setError('');
    setMessage('');
    
    if (!validateEmail(email)) {
      setError('Ingresa un email válido');
      return;
    }

    setLoading(true);

    try {
      // Check if email exists
      const userData = localStorage.getItem(`biencuidar_user_${email}`);
      if (!userData) {
        setError('Este email no está registrado');
        setLoading(false);
        return;
      }

      // Simulate sending reset code (in production: send email)
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem(`biencuidar_reset_${email}`, JSON.stringify({ code, expiry: Date.now() + 3600000 })); // 1 hour expiry
      
      setMessage(`Código de recuperación enviado a ${email}. Código: ${code} (demo)`);
      setAuthMode('reset-password');
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError('Error al procesar solicitud. Intenta nuevamente.');
    }
  };

  const handleResetPassword = () => {
    setError('');
    setMessage('');
    
    if (!validateEmail(email)) {
      setError('Ingresa un email válido');
      return;
    }

    if (!resetCode || resetCode.length !== 6) {
      setError('Ingresa el código de 6 dígitos');
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

    setLoading(true);

    try {
      // Verify reset code
      const resetData = localStorage.getItem(`biencuidar_reset_${email}`);
      if (!resetData) {
        setError('Código inválido o expirado');
        setLoading(false);
        return;
      }

      const parsedReset = JSON.parse(resetData);
      if (parsedReset.code !== resetCode.toUpperCase() || Date.now() > parsedReset.expiry) {
        setError('Código inválido o expirado');
        setLoading(false);
        return;
      }

      // Update password
      const userData = localStorage.getItem(`biencuidar_user_${email}`);
      if (!userData) {
        setError('Usuario no encontrado');
        setLoading(false);
        return;
      }

      const parsedUser = JSON.parse(userData);
      parsedUser.password = password;
      localStorage.setItem(`biencuidar_user_${email}`, JSON.stringify(parsedUser));
      
      // Clean up reset code
      localStorage.removeItem(`biencuidar_reset_${email}`);
      
      setMessage('Contraseña actualizada exitosamente');
      setAuthMode('login');
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError('Error al actualizar contraseña. Intenta nuevamente.');
    }
  };

  const handleSubmit = () => {
    if (authMode === 'register') {
      handleRegister();
    } else if (authMode === 'login') {
      handleLogin();
    } else if (authMode === 'forgot-password') {
      handleForgotPassword();
    } else if (authMode === 'reset-password') {
      handleResetPassword();
    }
  };

  const getTitle = () => {
    if (authMode === 'register') return 'Crear Cuenta';
    if (authMode === 'login') return 'Iniciar Sesión';
    if (authMode === 'forgot-password') return 'Recuperar Contraseña';
    if (authMode === 'reset-password') return 'Nueva Contraseña';
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
                {authMode === 'reset-password' ? 'Nueva Contraseña' : 'Contraseña'}
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

          {authMode === 'reset-password' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                Código de Recuperación (6 dígitos)
              </label>
              <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="w-full bg-transparent pl-3 pr-3 py-2.5 outline-none font-mono font-medium text-slate-800 text-sm"
                />
              </div>
            </div>
          )}

          {(authMode === 'register' || authMode === 'reset-password') && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                {authMode === 'register' ? 'Confirmar Contraseña' : 'Confirmar Nueva Contraseña'}
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
                  'Enviar Código'
                ) : authMode === 'reset-password' ? (
                  'Actualizar Contraseña'
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
            <p className="text-center text-xs text-slate-500">
              ¿Ya tienes cuenta?{' '}
              <button 
                onClick={() => setAuthMode('login')}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Inicia Sesión
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
