import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { NurseReview, FamilyReview, Profile } from '../types';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info') => void;

export function useReviews(currentUser: Profile | null, showToast: ShowToast) {
  const [nurseReviews, setNurseReviews] = useState<NurseReview[]>([]);
  const [familyReviews, setFamilyReviews] = useState<FamilyReview[]>([]);

  const submitReview = useCallback(async (bookingId: string, nurseId: string, rating: number, comment?: string) => {
    if (!currentUser) return;
    const newReview: NurseReview = {
      id: crypto.randomUUID(),
      booking_id: bookingId,
      nurse_id: nurseId,
      user_id: currentUser.id,
      rating,
      comment,
      created_at: new Date().toISOString(),
    };
    setNurseReviews(prev => [...prev, newReview]);

    try {
      const { error } = await supabase
        .from('nurse_reviews')
        .insert({
          booking_id: bookingId,
          nurse_id: nurseId,
          user_id: currentUser.id,
          rating,
          comment: comment || null,
        });
      if (error) throw error;
    } catch {
      console.warn('Failed to save review to Supabase');
      showToast('No se pudo guardar la resena. Intenta de nuevo.', 'error');
    }
  }, [currentUser, showToast]);

  const submitFamilyReview = useCallback(async (bookingId: string, nurseId: string, userId: string, rating: number, comment?: string) => {
    if (!currentUser) return;
    const newReview: FamilyReview = {
      id: crypto.randomUUID(),
      booking_id: bookingId,
      nurse_id: nurseId,
      user_id: userId,
      rating,
      comment,
      created_at: new Date().toISOString(),
    };
    setFamilyReviews(prev => [...prev, newReview]);

    try {
      const { error } = await supabase
        .from('family_reviews')
        .insert({
          booking_id: bookingId,
          nurse_id: nurseId,
          user_id: userId,
          rating,
          comment: comment || null,
        });
      if (error) throw error;
    } catch {
      console.warn('Failed to save family review to Supabase');
      showToast('No se pudo guardar la resena familiar.', 'error');
    }
  }, [currentUser, showToast]);

  return {
    nurseReviews,
    setNurseReviews,
    familyReviews,
    setFamilyReviews,
    submitReview,
    submitFamilyReview,
  };
}
