import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Booking, BookingStatus, Nurse, Profile } from '../types';
import { notifyCheckIn, notifyCheckOut, notifyPaymentConfirmed } from '../lib/notifications';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info') => void;

export type ServiceLogType = 'clinical' | 'physio' | 'companion';

export interface CareLog {
  bookingId: string;
  serviceType: ServiceLogType;
  arrivalTime: string;
  departureTime: string;
  patientConditionOnArrival: 'Bien' | 'Regular' | 'Deteriorado' | 'Crítico';
  patientConditionOnDeparture: 'Mejoró' | 'Igual' | 'Empeoró';
  activities: string[];
  observations: string;
  narrativeReport: string;
  familyReport: string;
  updatedAt: string;
}

interface UseBookingsArgs {
  currentUser: Profile | null;
  nurses: Nurse[];
  profiles: Profile[];
  showToast: ShowToast;
}

export function useBookings({ currentUser, nurses, profiles, showToast }: UseBookingsArgs) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [careLogs, setCareLogs] = useState<Record<string, CareLog>>({});

  const saveCareLog = useCallback((bookingId: string, log: Omit<CareLog, 'bookingId' | 'updatedAt'>) => {
    const updatedLog = {
      ...log,
      bookingId,
      updatedAt: new Date().toISOString()
    };
    setCareLogs(prev => ({
      ...prev,
      [bookingId]: updatedLog
    }));
    supabase.from('care_logs').upsert({
      booking_id: bookingId,
      service_type: log.serviceType,
      arrival_time: log.arrivalTime,
      departure_time: log.departureTime,
      patient_condition_on_arrival: log.patientConditionOnArrival,
      patient_condition_on_departure: log.patientConditionOnDeparture,
      activities: JSON.stringify(log.activities),
      observations: log.observations,
      narrative_report: log.narrativeReport,
      family_report: log.familyReport,
      updated_at: updatedLog.updatedAt
    }, { onConflict: 'booking_id' }).then(({ error }) => {
      if (error) {
        console.warn('Failed to save care log to Supabase:', error.message);
        showToast('No se pudo guardar el registro de cuidado. Intenta de nuevo.', 'error');
      }
    });
  }, [showToast]);

  const createBooking = useCallback(async (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'> & { status?: Booking['status'] }): Promise<Booking> => {
    if (!currentUser) throw new Error('Debes iniciar sesión para agendar.');

    const overlapping = bookings.find(b =>
      b.nurse_id === bookingData.nurse_id &&
      b.date === bookingData.date &&
      b.status !== 'cancelled' &&
      b.shift === bookingData.shift
    );
    if (overlapping) {
      throw new Error('Esta enfermera ya tiene una reserva para ese turno. Elige otra fecha u hora.');
    }

    const bookingStatus = bookingData.status || 'confirmed';
    const newBooking: Booking = {
      ...bookingData,
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      status: bookingStatus,
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: currentUser.id,
          nurse_id: bookingData.nurse_id,
          date: bookingData.date,
          shift: bookingData.shift || null,
          start_time: bookingData.start_time || null,
          end_time: bookingData.end_time || null,
          hours: bookingData.hours || null,
          status: bookingStatus,
          total_price: bookingData.total_price,
          notes: bookingData.notes,
          patient_name: bookingData.patient_name,
          patient_condition: bookingData.patient_condition,
          wants_invoice: bookingData.wants_invoice ?? false,
          location_name: bookingData.location_name || null,
          lat: bookingData.lat || null,
          lng: bookingData.lng || null
        })
        .select()
        .single();

      if (error) throw error;

      const created = { ...newBooking, id: data.id, created_at: data.created_at } as Booking;
      setBookings(prev => [created, ...prev]);
      return created;
    } catch {
      throw new Error('No se pudo crear la reserva. Verifica tu conexión e intenta nuevamente.');
    }
  }, [currentUser, bookings]);

  const updateBookingStatus = useCallback(async (bookingId: string, status: BookingStatus) => {
    const prevBookings = bookings;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId);

      if (error) throw error;
    } catch {
      setBookings(prevBookings);
      console.warn('Booking status update failed, rolled back to previous state.');
      showToast('No se pudo actualizar el estado del servicio. Revertido.', 'error');
    }
  }, [bookings, showToast]);

  const checkInBooking = useCallback(async (bookingId: string, lat: number, lng: number, address: string, mismatch: boolean) => {
    const prevBookings = bookings;
    const now = new Date().toISOString();
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, check_in_at: now, check_in_lat: lat, check_in_lng: lng, check_in_address: address, address_mismatch: mismatch } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ check_in_at: now, check_in_lat: lat, check_in_lng: lng, check_in_address: address, address_mismatch: mismatch })
        .eq('id', bookingId);

      if (error) throw error;
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        const nurse = nurses.find(n => n.id === booking.nurse_id);
        const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
        if (currentUser?.id !== booking.user_id) {
          notifyCheckIn(nurseProfile?.full_name || 'La enfermera', booking.user_id);
        }
      }
    } catch {
      setBookings(prevBookings);
      console.warn('Check-in failed, rolled back.');
      showToast('No se pudo registrar el check-in. Revertido.', 'error');
    }
  }, [bookings, nurses, profiles, currentUser, showToast]);

  const checkOutBooking = useCallback(async (bookingId: string, lat: number, lng: number) => {
    const prevBookings = bookings;
    const now = new Date().toISOString();
    const booking = bookings.find(b => b.id === bookingId);
    const paymentUpdate = booking && !booking.wants_invoice ? { payment_status: 'paid' as const } : {};
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, check_out_at: now, check_out_lat: lat, check_out_lng: lng, status: 'completed', ...paymentUpdate } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ check_out_at: now, check_out_lat: lat, check_out_lng: lng, status: 'completed', ...paymentUpdate })
        .eq('id', bookingId);

      if (error) throw error;
      if (booking) {
        const nurse = nurses.find(n => n.id === booking.nurse_id);
        const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
        if (currentUser?.id !== booking.user_id) {
          notifyCheckOut(nurseProfile?.full_name || 'La enfermera', booking.user_id);
        }
      }
    } catch {
      setBookings(prevBookings);
      console.warn('Check-out failed, rolled back.');
      showToast('No se pudo registrar el check-out. Revertido.', 'error');
    }
  }, [bookings, nurses, profiles, currentUser, showToast]);

  const confirmPayment = useCallback(async (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    const newStatus = booking?.status === 'pending_payment' ? 'confirmed' : booking?.status;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_status: 'paid', status: newStatus || b.status } : b));
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ payment_status: 'paid', status: newStatus })
        .eq('id', bookingId);
      if (error) throw error;
      if (booking) {
        const nurse = nurses.find(n => n.id === booking.nurse_id);
        if (nurse && currentUser?.id !== nurse.user_id) {
          notifyPaymentConfirmed(booking.patient_name, nurse.user_id);
        }
      }
    } catch (err) {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_status: 'pending', status: booking?.status || b.status } : b));
      console.warn('Payment confirmation failed, rolled back:', err);
      showToast('No se pudo confirmar el pago. Se ha revertido el estado.', 'error');
    }
  }, [bookings, nurses, currentUser, showToast]);

  return {
    bookings,
    setBookings,
    careLogs,
    setCareLogs,
    saveCareLog,
    createBooking,
    updateBookingStatus,
    checkInBooking,
    checkOutBooking,
    confirmPayment,
  };
}
