/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'user' | 'nurse' | 'admin';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type CareRequestStatus = 'open' | 'matched' | 'closed' | 'expired';

export type CareOfferStatus = 'pending' | 'accepted' | 'rejected' | 'declined';

export interface Profile {
  id: string; // auth.user FK
  email: string;
  role: UserRole;
  full_name: string;
  avatar_url: string;
  phone?: string;
  location_name?: string;
  updated_at: string;
}

export type ShiftType = 'morning' | 'afternoon' | 'night';

export const SHIFTS: Record<ShiftType, { label: string; start: string; end: string; hours: number }> = {
  morning:   { label: 'Mañana',  start: '07:00', end: '15:00', hours: 8 },
  afternoon: { label: 'Tarde',   start: '15:00', end: '23:00', hours: 8 },
  night:     { label: 'Noche',   start: '23:00', end: '07:00', hours: 8 },
};

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Dom ... 6=Sab

export type CSSPVerificationStatus = 'unverified' | 'pending' | 'auto_verified' | 'manual_verified' | 'rejected';

export interface Nurse {
  id: string; // UUID
  user_id: string; // profiles FK
  specialization: string[]; // List of specializations, e.g., ["Geriatría", "Postoperatorio", "Demencia"]
  shift_rate: number; // Tariff per 8-hour shift in USD
  coverage_radius: number; // in kilometers (km)
  available_shifts: ShiftType[]; // which shifts the nurse can work
  available_days: WeekDay[]; // which days of the week (0=Sun ... 6=Sat)
  rating: number;
  review_count: number;
  lat: number; // geographic coordinates for map simulation
  lng: number;
  bio: string;
  experience_years: number;
  certifications: string[];
  // Verificaciones: CSSP obligatorio, demas opcionales
  cssp_registration: string; // Número de registro CSSP (OBLIGATORIO por ley)
  cssp_level: 'Licenciada' | 'Tecnóloga' | 'Técnica' | 'Auxiliar';
  cssp_verification_status?: CSSPVerificationStatus; // estado de verificación automatizada + manual
  cssp_verified?: boolean; // true solo cuando está verificada (auto o manual)
  cssp_verification_date?: string; // ISO date de última verificación
  cssp_verification_notes?: string; // notas del revisor manual
  verifications?: {
    college_registration?: string; // Número de registro del colegio/asociación
  };
  // FSE y retencion 10% ISR son automaticos para todas las enfermeras en BienCuidar
}

export interface Booking {
  id: string;
  user_id: string; // profile who booked
  nurse_id: string; // nurse booked
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  hours: number;
  status: BookingStatus;
  total_price: number;
  notes?: string;
  patient_name: string;
  patient_condition: string;
  patient_data?: {
    diagnosis: string;
    autonomy: string;
    allergies: string;
    medications: string;
    emergency_contact: string;
  };
  created_at: string;
  // Location
  lat?: number;
  lng?: number;
  // Check-in / Check-out GPS
  check_in_at?: string;
  check_in_lat?: number;
  check_in_lng?: number;
  check_in_address?: string;
  check_out_at?: string;
  check_out_lat?: number;
  check_out_lng?: number;
  address_mismatch?: boolean;
  // Payment
  payment_status?: 'pending' | 'paid';
}

export interface Availability {
  id: string;
  nurse_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  is_available: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CareRequestSlot {
  date: string; // YYYY-MM-DD
  shift: ShiftType; // morning | afternoon | night
}

export interface CareRequest {
  id: string;
  user_id: string; // family profile who posted
  patient_name: string;
  patient_condition: string;
  patient_data?: {
    diagnosis: string;
    autonomy: string;
    allergies: string;
    medications: string;
    emergency_contact: string;
  };
  specialization_needed: string; // e.g., "Geriatría"
  slots: CareRequestSlot[]; // multiple dates/times needed
  location_name: string;
  lat?: number;
  lng?: number;
  notes?: string;
  wants_invoice: boolean;
  status: CareRequestStatus;
  response_deadline: string; // ISO datetime when the response window closes
  created_at: string;
}

export interface CareOffer {
  id: string;
  request_id: string; // CareRequest FK
  nurse_id: string; // nurse who offered
  slot_index: number; // which slot in CareRequest.slots this offer is for
  message: string;
  offered_rate: number; // rate offered by nurse for this specific request
  status: CareOfferStatus;
  created_at: string;
  reject_reason?: 'voluntary' | 'auto';
}

export interface NurseReview {
  id: string;
  booking_id: string;
  nurse_id: string;
  user_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}
