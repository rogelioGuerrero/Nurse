import { supabaseUrl, supabaseAnonKey } from './supabase';
import type { PatientAgeRange, PatientGender, UrgencyLevel } from '../types';

const EDGE_FUNCTION_PATH = '/functions/v1/triage-request';
const REQUEST_TIMEOUT_MS = 20000;

export interface TriageInput {
  patient_name: string;
  patient_age_range?: PatientAgeRange;
  patient_gender?: PatientGender;
  help_needs: string[];
  help_needs_other?: string;
  situation: string;
}

export interface TriageResult {
  specialization_suggested: string;
  specialization_confidence: number;
  urgency: UrgencyLevel;
  patient_data: {
    diagnosis: string;
    autonomy: string;
    allergies: string;
    medications: string;
    emergency_contact: string;
  };
  nurse_summary: string;
}

export async function triageRequest(input: TriageInput): Promise<TriageResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}${EDGE_FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Triage service error: ${response.status}`);
    }

    const data = await response.json();
    return data as TriageResult;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
