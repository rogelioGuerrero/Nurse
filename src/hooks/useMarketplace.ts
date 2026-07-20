import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  CareRequest, CareRequestStatus, CareRequestSlot, ExpectedDuration,
  CareOffer, CareOfferStatus, Nurse, Profile, Booking,
} from '../types';
import { getResponseDeadline } from '../data/platformSettings';
import { notifyNewOffer, notifyOfferAccepted } from '../lib/notifications';
import { notifyMarketplace } from '../lib/marketplace-notify';
import { track } from '../lib/analytics';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info') => void;

interface UseMarketplaceArgs {
  currentUser: Profile | null;
  nurses: Nurse[];
  profiles: Profile[];
  showToast: ShowToast;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  bookingsRef: React.MutableRefObject<Booking[]>;
}

export function useMarketplace({ currentUser, nurses, profiles, showToast, setBookings, bookingsRef }: UseMarketplaceArgs) {
  const [careRequests, setCareRequests] = useState<CareRequest[]>([]);
  const [careOffers, setCareOffers] = useState<CareOffer[]>([]);

  const careRequestsRef = useRef<CareRequest[]>([]);
  const careOffersRef = useRef<CareOffer[]>([]);

  useEffect(() => { careRequestsRef.current = careRequests; }, [careRequests]);
  useEffect(() => { careOffersRef.current = careOffers; }, [careOffers]);

  const createCareRequest = useCallback((data: Omit<CareRequest, 'id' | 'user_id' | 'created_at' | 'status' | 'response_deadline'>): CareRequest => {
    if (!currentUser) throw new Error('Debes iniciar sesión para publicar una solicitud.');

    const activeRequestsCount = careRequests.filter(r => r.user_id === currentUser.id && r.status === 'open').length;
    if (activeRequestsCount >= 2) {
      throw new Error('Por seguridad y control de calidad en fase de arranque, solo puedes tener un máximo de 2 solicitudes activas simultáneamente.');
    }

    const now = new Date().toISOString();
    const newRequest: CareRequest = {
      ...data,
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      status: 'open',
      response_deadline: getResponseDeadline(now),
      created_at: now
    };
    setCareRequests(prev => [newRequest, ...prev]);
    supabase.from('care_requests').insert({
      id: newRequest.id,
      user_id: currentUser.id,
      patient_name: data.patient_name,
      patient_condition: data.patient_condition,
      patient_age_range: data.patient_age_range || null,
      patient_gender: data.patient_gender || null,
      patient_data: data.patient_data ? JSON.stringify(data.patient_data) : null,
      nurse_summary: data.nurse_summary || null,
      urgency: data.urgency || null,
      specialization_needed: data.specialization_needed,
      slots: JSON.stringify(data.slots),
      location_name: data.location_name,
      lat: data.lat,
      lng: data.lng,
      notes: data.notes || null,
      wants_invoice: data.wants_invoice,
      expected_duration: data.expected_duration || 'shifts',
      status: 'open',
      response_deadline: newRequest.response_deadline,
      created_at: now
    }).then(({ error }) => {
      if (error) {
        console.warn('Failed to save care request to Supabase:', error.message);
        setCareRequests(prev => prev.filter(r => r.id !== newRequest.id));
        showToast('No se pudo publicar la solicitud. Revisa tu conexión e intenta de nuevo.', 'error');
      } else {
        notifyMarketplace({ type: 'new_request', request_id: newRequest.id });
      }
    });
    track.careRequestSubmit(data.specialization_needed, data.urgency);
    return newRequest;
  }, [currentUser, careRequests, showToast]);

  const closeCareRequest = useCallback((requestId: string) => {
    const prevRequests = careRequests;
    const prevOffers = careOffers;
    setCareRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'closed' as CareRequestStatus } : r));
    setCareOffers(prev => prev.map(o => o.request_id === requestId && o.status === 'pending' ? { ...o, status: 'rejected' as CareOfferStatus, reject_reason: 'auto' } : o));
    Promise.all([
      supabase.from('care_requests').update({ status: 'closed' }).eq('id', requestId),
      supabase.from('care_offers').update({ status: 'rejected', reject_reason: 'auto' }).eq('request_id', requestId).eq('status', 'pending')
    ]).then(([reqRes, offerRes]) => {
      if (reqRes.error || offerRes.error) {
        console.warn('closeCareRequest sync error:', reqRes.error?.message, offerRes.error?.message);
        setCareRequests(prevRequests);
        setCareOffers(prevOffers);
        showToast('No se pudo cerrar la solicitud en el servidor.', 'error');
      }
    });
  }, [careRequests, careOffers, showToast]);

  const republisheCareRequest = useCallback((requestId: string, newSlots?: CareRequestSlot[], newDuration?: ExpectedDuration) => {
    const original = careRequests.find(r => r.id === requestId);
    if (!original) return;
    const now = new Date().toISOString();
    const newRequest: CareRequest = {
      ...original,
      id: crypto.randomUUID(),
      status: 'open',
      slots: newSlots || original.slots,
      expected_duration: newDuration || original.expected_duration,
      response_deadline: getResponseDeadline(now),
      created_at: now,
    };
    setCareRequests(prev => [newRequest, ...prev]);
    supabase.from('care_requests').insert({
      id: newRequest.id,
      user_id: newRequest.user_id,
      patient_name: newRequest.patient_name,
      patient_condition: newRequest.patient_condition,
      patient_age_range: newRequest.patient_age_range || null,
      patient_gender: newRequest.patient_gender || null,
      patient_data: newRequest.patient_data ? JSON.stringify(newRequest.patient_data) : null,
      nurse_summary: newRequest.nurse_summary || null,
      urgency: newRequest.urgency || null,
      specialization_needed: newRequest.specialization_needed,
      slots: JSON.stringify(newRequest.slots),
      location_name: newRequest.location_name,
      lat: newRequest.lat,
      lng: newRequest.lng,
      notes: newRequest.notes,
      wants_invoice: newRequest.wants_invoice,
      status: 'open',
      response_deadline: newRequest.response_deadline,
      created_at: now
    }).then(({ error }) => {
      if (error) { console.warn('Failed to republish care request:', error.message); showToast('No se pudo republicar la solicitud. Intenta de nuevo.', 'error'); }
    });
  }, [careRequests, showToast]);

  const createCareOffer = useCallback((data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }): CareOffer => {
    const newOffer: CareOffer = {
      ...data,
      id: crypto.randomUUID(),
      status: data.status || 'pending',
      created_at: new Date().toISOString()
    };
    setCareOffers(prev => [newOffer, ...prev]);
    supabase.from('care_offers').insert({
      id: newOffer.id,
      request_id: data.request_id,
      nurse_id: data.nurse_id,
      slot_index: data.slot_index,
      offered_rate: data.offered_rate,
      status: data.status || 'pending',
      notes: data.message || null,
      created_at: newOffer.created_at
    }).then(({ error }) => {
      if (error) {
        console.warn('Failed to save care offer to Supabase:', error.message);
        setCareOffers(prev => prev.filter(o => o.id !== newOffer.id));
        showToast('No se pudo enviar tu oferta. Intenta de nuevo.', 'error');
      } else {
        const request = careRequests.find(r => r.id === data.request_id);
        if (request && currentUser?.id !== request.user_id) {
          const nurse = nurses.find(n => n.id === data.nurse_id);
          const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
          notifyNewOffer(nurseProfile?.full_name || 'Una enfermera', request.patient_name, request.user_id);
          notifyMarketplace({ type: 'new_offer', offer_id: newOffer.id });
          track.offerSubmit(Number(data.offered_rate));
        }
      }
    });
    return newOffer;
  }, [careRequests, currentUser, nurses, profiles, showToast]);

  const withdrawCareOffer = useCallback((offerId: string) => {
    const prevOffers = careOffers;
    setCareOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'rejected' as CareOfferStatus, reject_reason: 'voluntary' } : o));
    supabase.from('care_offers').update({ status: 'rejected', reject_reason: 'voluntary' }).eq('id', offerId).then(({ error }) => {
      if (error) {
        console.warn('withdrawCareOffer sync error:', error.message);
        setCareOffers(prevOffers);
        showToast('No se pudo retirar la oferta del servidor.', 'error');
      }
    });
  }, [careOffers, showToast]);

  const acceptCareOffer = useCallback(async (offerId: string) => {
    const offer = careOffers.find(o => o.id === offerId);
    if (!offer) return;

    try {
      const { data, error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCareOffers(prev => prev.map(o => {
        if (o.id === offerId) return { ...o, status: 'accepted' as CareOfferStatus };
        if (o.request_id === offer.request_id && o.status === 'pending')
          return { ...o, status: 'rejected' as CareOfferStatus, reject_reason: 'auto' };
        const req = careRequests.find(r => r.id === o.request_id);
        const acceptedReq = careRequests.find(r => r.id === offer.request_id);
        if (req && acceptedReq && o.nurse_id === offer.nurse_id && o.status === 'pending') {
          const otherSlot = req.slots[o.slot_index];
          const acceptedSlot = acceptedReq.slots[offer.slot_index];
          if (otherSlot && acceptedSlot && otherSlot.date === acceptedSlot.date)
            return { ...o, status: 'rejected' as CareOfferStatus, reject_reason: 'auto' };
        }
        return o;
      }));

      setCareRequests(prev => prev.map(r =>
        r.id === offer.request_id ? { ...r, status: 'matched' as CareRequestStatus } : r
      ));

      if (data?.booking_id) {
        const { data: newBooking } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', data.booking_id)
          .single();
        if (newBooking) {
          setBookings(prev => [newBooking as Booking, ...prev]);
        }
      }

      notifyMarketplace({ type: 'offer_accepted', offer_id: offer.id });
      track.offerAccepted();

      const request = careRequests.find(r => r.id === offer.request_id);
      const nurse = nurses.find(n => n.id === offer.nurse_id);
      if (nurse && currentUser?.id !== nurse.user_id && request) {
        notifyOfferAccepted(request.patient_name, nurse.user_id);
      }

      showToast('Oferta aceptada. Se ha creado el servicio.', 'success');
    } catch (err) {
      console.warn('acceptCareOffer RPC error:', err);
      showToast('No se pudo aceptar la oferta. Intenta de nuevo.', 'error');
    }
  }, [careOffers, careRequests, nurses, currentUser, showToast, setBookings]);

  const updatePatientName = useCallback(async (requestId: string, patientName: string, patientAge?: string, emergencyContact?: string) => {
    const prevRequests = careRequests;
    setCareRequests(prev => prev.map(r => r.id === requestId ? {
      ...r,
      patient_name: patientName,
      patient_data: {
        ...(r.patient_data || { diagnosis: '', autonomy: '', allergies: '', medications: '', emergency_contact: '' }),
        emergency_contact: emergencyContact ?? r.patient_data?.emergency_contact ?? '',
      }
    } : r));
    setBookings(prev => {
      const req = careRequests.find(r => r.id === requestId);
      if (req && (prev.find(b => b.id === '')?.patient_name === 'Por confirmar')) {
        // no-op placeholder — actual matching done below
      }
      return prev.map(b => {
        if (req && (b.patient_name === 'Por confirmar' || b.patient_name === req.patient_name)) {
          return {
            ...b,
            patient_name: patientName,
            patient_age: patientAge || b.patient_age,
            emergency_contact: emergencyContact || b.emergency_contact,
          };
        }
        return b;
      });
    });

    try {
      const updateData: Record<string, unknown> = { patient_name: patientName };
      if (emergencyContact !== undefined) {
        const request = careRequests.find(r => r.id === requestId);
        const patientData = {
          ...(request?.patient_data || { diagnosis: '', autonomy: '', allergies: '', medications: '', emergency_contact: '' }),
          emergency_contact: emergencyContact
        };
        updateData.patient_data = JSON.stringify(patientData);
      }
      await supabase.from('care_requests').update(updateData).eq('id', requestId);
      const request = careRequests.find(r => r.id === requestId);
      const relatedBookings = bookingsRef.current.filter(b =>
        request && (b.patient_name === 'Por confirmar' || b.patient_name === request.patient_name)
      );
      for (const b of relatedBookings) {
        await supabase.from('bookings').update({
          patient_name: patientName,
          patient_age: patientAge || null,
          emergency_contact: emergencyContact || null,
        }).eq('id', b.id);
      }
    } catch (err) {
      setCareRequests(prevRequests);
      console.warn('Patient name update failed, rolled back:', err);
      showToast('No se pudo actualizar el nombre del paciente. Revertido.', 'error');
    }
  }, [careRequests, showToast, setBookings]);

  const updateRequestLocation = useCallback(async (requestId: string, lat: number, lng: number, locationName: string) => {
    const prevRequests = careRequests;
    setCareRequests(prev => prev.map(r => r.id === requestId ? { ...r, lat, lng, location_name: locationName } : r));
    setBookings(prev => prev.map(b => {
      const req = careRequests.find(r => r.id === requestId);
      if (req && (b.patient_name === 'Por confirmar' || b.patient_name === req.patient_name)) {
        return { ...b, lat, lng, location_name: locationName };
      }
      return b;
    }));

    try {
      await supabase.from('care_requests').update({ lat, lng, location_name: locationName }).eq('id', requestId);
      const request = careRequests.find(r => r.id === requestId);
      const relatedBookings = bookingsRef.current.filter(b =>
        request && (b.patient_name === 'Por confirmar' || b.patient_name === request.patient_name)
      );
      for (const b of relatedBookings) {
        await supabase.from('bookings').update({ lat, lng, location_name: locationName }).eq('id', b.id);
      }
    } catch (err) {
      setCareRequests(prevRequests);
      console.warn('Location update failed, rolled back:', err);
      showToast('No se pudo actualizar la ubicacion. Revertido.', 'error');
    }
  }, [careRequests, showToast, setBookings]);

  // Auto-expire care requests past their response_deadline (client-side mirror only)
  useEffect(() => {
    const checkExpired = () => {
      const now = Date.now();
      const expiredRequests = careRequestsRef.current.filter(r =>
        r.status === 'open' &&
        new Date(r.response_deadline).getTime() <= now
      );
      if (expiredRequests.length > 0) {
        const expiredIds = expiredRequests.map(r => r.id);
        setCareRequests(prev => prev.map(r =>
          expiredIds.includes(r.id) ? { ...r, status: 'expired' as CareRequestStatus } : r
        ));
        setCareOffers(prev => prev.map(o =>
          expiredIds.includes(o.request_id) && o.status === 'pending'
            ? { ...o, status: 'rejected' as CareOfferStatus, reject_reason: 'auto' }
            : o
        ));
      }
    };

    checkExpired();
    const interval = setInterval(checkExpired, 300000);
    return () => clearInterval(interval);
  }, []);

  // Auto-withdraw nurse's pending offers when one is accepted
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'nurse') return;

    const acceptedNurseIds = new Set(
      careOffers.filter(o => o.status === 'accepted').map(o => o.nurse_id)
    );
    if (acceptedNurseIds.size === 0) return;

    const offersToWithdraw = careOffers.filter(o =>
      o.status === 'pending' && acceptedNurseIds.has(o.nurse_id)
    );
    if (offersToWithdraw.length === 0) return;

    const acceptedOffersByNurse = new Map<string, CareOffer[]>();
    careOffers.forEach(o => {
      if (o.status === 'accepted') {
        const list = acceptedOffersByNurse.get(o.nurse_id) || [];
        list.push(o);
        acceptedOffersByNurse.set(o.nurse_id, list);
      }
    });

    const toWithdrawIds: string[] = [];
    offersToWithdraw.forEach(o => {
      const accepted = acceptedOffersByNurse.get(o.nurse_id) || [];
      const request = careRequests.find(r => r.id === o.request_id);
      if (!request) return;
      const offerSlot = request.slots[o.slot_index];
      if (!offerSlot) return;

      const shouldWithdraw = accepted.some(ao => {
        const acceptedReq = careRequests.find(r => r.id === ao.request_id);
        if (!acceptedReq) return false;
        const acceptedSlot = acceptedReq.slots[ao.slot_index];
        if (!acceptedSlot) return false;
        return acceptedSlot.date === offerSlot.date;
      });

      if (shouldWithdraw) toWithdrawIds.push(o.id);
    });

    if (toWithdrawIds.length > 0) {
      setCareOffers(prev => prev.map(o =>
        toWithdrawIds.includes(o.id)
          ? { ...o, status: 'rejected' as CareOfferStatus, reject_reason: 'auto' }
          : o
      ));
    }
  }, [careOffers, careRequests, currentUser]);

  return {
    careRequests,
    setCareRequests,
    careOffers,
    setCareOffers,
    careRequestsRef,
    createCareRequest,
    closeCareRequest,
    republisheCareRequest,
    createCareOffer,
    withdrawCareOffer,
    acceptCareOffer,
    updatePatientName,
    updateRequestLocation,
  };
}
