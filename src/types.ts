/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'user' | 'nurse' | 'admin';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type CareRequestStatus = 'open' | 'matched' | 'closed' | 'expired';

export type CareOfferStatus = 'pending' | 'accepted' | 'rejected';

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

export interface Nurse {
  id: string; // UUID
  user_id: string; // profiles FK
  specialization: string[]; // List of specializations, e.g., ["Geriatría", "Postoperatorio", "Demencia"]
  hourly_rate: number; // Tariff hourly rate in USD
  coverage_radius: number; // in kilometers (km)
  availability: string; // descriptive text or simple JSON, e.g., "Lunes a Viernes, Turno Completo"
  rating: number;
  review_count: number;
  lat: number; // geographic coordinates for map simulation
  lng: number;
  bio: string;
  experience_years: number;
  certifications: string[];
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
  start_time: string; // HH:MM
  end_time: string; // HH:MM
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
  notes?: string;
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
  status: CareOfferStatus;
  created_at: string;
}
