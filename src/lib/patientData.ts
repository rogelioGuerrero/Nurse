import type { Booking } from '../types';

export interface ParsedPatientData {
  raw: string;
  diagnosis: string;
  autonomy: string;
  allergies: string;
  medications: string;
  emergency: string;
}

export function parsePatientCondition(condition: string): ParsedPatientData {
  if (!condition) {
    return {
      raw: '',
      diagnosis: 'No especificado',
      autonomy: 'No especificada',
      allergies: 'Ninguna',
      medications: 'Ninguna',
      emergency: 'No proporcionado'
    };
  }

  try {
    const diagMatch = condition.match(/^([^[]+)/);
    const autonomyMatch = condition.match(/\[Autonom[ií]a:\s*([^\]]+)\]/);
    const allergiesMatch = condition.match(/\[Alerg[ií]as:\s*([^\]]+)\]/);
    const medsMatch = condition.match(/\[Medicamentos:\s*([^\]]+)\]/);
    const emergencyMatch = condition.match(/\[Emergencia:\s*([^\]]+)\]/);

    return {
      raw: condition,
      diagnosis: diagMatch ? diagMatch[1].trim() : condition,
      autonomy: autonomyMatch ? autonomyMatch[1].trim() : 'No especificada',
      allergies: allergiesMatch ? allergiesMatch[1].trim() : 'Ninguna',
      medications: medsMatch ? medsMatch[1].trim() : 'Ninguno',
      emergency: emergencyMatch ? emergencyMatch[1].trim() : 'No proporcionado'
    };
  } catch {
    return {
      raw: condition,
      diagnosis: condition,
      autonomy: 'No especificada',
      allergies: 'Ninguna',
      medications: 'Ninguna',
      emergency: 'No proporcionado'
    };
  }
}

export function getPatientData(booking: Booking): ParsedPatientData {
  if (booking.patient_data) {
    return {
      raw: booking.patient_condition,
      diagnosis: booking.patient_data.diagnosis,
      autonomy: booking.patient_data.autonomy,
      allergies: booking.patient_data.allergies,
      medications: booking.patient_data.medications,
      emergency: booking.patient_data.emergency_contact
    };
  }
  return parsePatientCondition(booking.patient_condition);
}
