const LEAKED_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '1234567890', '1234567',
  'password', 'password1', 'password123', 'passw0rd', 'pass123',
  'qwerty', 'qwerty123', 'qwerty1', 'qwerty12',
  'abc123', 'abc12345', 'abcdef', 'abcdef123',
  '111111', '000000', '123123', '121212', '666666', '888888',
  'iloveyou', 'letmein', 'welcome', 'monkey', 'dragon',
  'master', 'login', 'admin', 'admin123', 'administrator',
  'root', 'toor', 'test', 'test123', 'guest', 'guest123',
  'superman', 'batman', 'trustno1', 'shadow', 'michael',
  'nursing', 'nurse123', 'enfermera', 'enfermeria',
  'salud123', 'biencuidar', 'biencuidar123',
  'familia', 'familia123', 'casa123', 'hogar123',
  'el salvador', 'elsalvador', 'elsalvador123',
  'guatemala', 'guatemala123', 'centroamerica',
  'password!', 'qwerty!', '123456!', 'abc123!',
  'Password1', 'Password123', 'Password!',
  'Qwerty123', 'Welcome1', 'Welcome123',
  'P@ssw0rd', 'P@ssword1', 'P@ss1234',
  'Admin123', 'Admin@123', 'Root123',
  'changeme', 'changeme123', 'mustchange',
  'secret', 'secret123', 'secret1',
  'hola123', 'hola1234', 'hola!', 'hola123!',
  'amor123', 'amor2024', 'amor2023',
  'flor123', 'flor2024', 'flor2023',
  'maria123', 'maria2024', 'maria2023',
  'jose123', 'jose2024', 'jose2023',
  'ana123', 'ana2024', 'ana2023',
  'luis123', 'luis2024', 'luis2023',
  'carlos123', 'carlos2024', 'carlos2023',
]);

export interface PasswordValidationResult {
  valid: boolean;
  message: string;
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'La contraseña debe tener al menos 8 caracteres',
      strength: 'weak',
    };
  }

  if (LEAKED_PASSWORDS.has(password.toLowerCase())) {
    return {
      valid: false,
      message: 'Esta contraseña es muy común y vulnerable. Usá una más segura.',
      strength: 'weak',
    };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (varietyCount < 2) {
    return {
      valid: false,
      message: 'Incluye mayúsculas, minúsculas y números',
      strength: 'weak',
    };
  }

  if (varietyCount < 3) {
    return {
      valid: true,
      message: 'Para mayor seguridad, añade símbolos (ej: !@#$)',
      strength: 'fair',
    };
  }

  if (password.length >= 12 && varietyCount >= 3) {
    return {
      valid: true,
      message: 'Contraseña segura',
      strength: 'strong',
    };
  }

  return {
    valid: true,
    message: 'Contraseña aceptable',
    strength: 'good',
  };
}

export function getPasswordStrengthColor(strength: string): string {
  switch (strength) {
    case 'weak': return 'text-red-600 bg-red-50 border-red-200';
    case 'fair': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'good': return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'strong': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

export function getPasswordStrengthLabel(strength: string): string {
  switch (strength) {
    case 'weak': return 'Débil';
    case 'fair': return 'Regular';
    case 'good': return 'Buena';
    case 'strong': return 'Fuerte';
    default: return '';
  }
}
