/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'user' | 'nurse' | 'admin';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

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
  hourly_rate: number; // Tariff hourly rate in local currency (e.g. MXN, COP, USD)
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
  created_at: string;
}

export interface Message {
  id: string;
  chat_room_id: string; // composite user_id + nurse_id or single key
  sender_id: string;
  content: string;
  created_at: string;
  is_read?: boolean;
  read_at?: string;
  is_urgent?: boolean;
  booking_id?: string; // Link message to specific booking
}

export interface ChatRoom {
  id: string;
  user_id: string;
  nurse_id: string;
  last_message_content?: string;
  last_message_time?: string;
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
