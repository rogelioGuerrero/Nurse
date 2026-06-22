/**
 * Valida el formato de un número de registro CSSP de El Salvador.
 * Formatos aceptados (flexible, ya que el CSSP no publica un formato oficial estandarizado):
 * - CSSP-ENF-2016-0142
 * - CSSP-ENF-2024-0456
 * - JVPE-2016-0142
 * - Números puros de 4-8 dígitos
 *
 * @param registration - El número de registro a validar
 * @returns { valid: boolean, message: string }
 */
export function validateCSSPRegistration(registration: string): { valid: boolean; message: string } {
  const trimmed = registration.trim();

  if (!trimmed) {
    return { valid: false, message: 'El número de registro CSSP es obligatorio' };
  }

  if (trimmed.length < 4) {
    return { valid: false, message: 'El número de registro parece demasiado corto' };
  }

  if (trimmed.length > 30) {
    return { valid: false, message: 'El número de registro parece demasiado largo' };
  }

  // Formato con prefijo: CSSP-ENF-YYYY-NNNN o JVPE-YYYY-NNNN
  const prefixedFormat = /^[A-Z]{3,4}-[A-Z]{0,4}-?\d{0,4}-?\d{2,8}$/i;

  // Solo números: 4-8 dígitos
  const numericFormat = /^\d{4,8}$/;

  // Alfanumérico con guiones: permite variaciones
  const alphanumericFormat = /^[A-Z0-9-]+$/i;

  if (prefixedFormat.test(trimmed) || numericFormat.test(trimmed)) {
    return { valid: true, message: 'Formato válido' };
  }

  if (alphanumericFormat.test(trimmed)) {
    return { valid: true, message: 'Formato aceptado (verificar manualmente)' };
  }

  return { valid: false, message: 'Formato no reconocido. Usa el formato de tu carnet CSSP.' };
}
