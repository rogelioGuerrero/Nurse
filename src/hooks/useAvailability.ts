import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Availability, Profile } from '../types';
import { INITIAL_NURSES } from '../data/nurses';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info') => void;

function safeParse<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch {
    console.warn(`Corrupted localStorage key "${key}", resetting to default.`);
    localStorage.removeItem(key);
    return fallback;
  }
}

export function useAvailability(currentUser: Profile | null, showToast: ShowToast) {
  const [availabilityCache, setAvailabilityCache] = useState<Availability[]>(() => {
    const saved = safeParse<Availability[] | null>('biencuidar_availability', null);
    if (saved) return saved;
    const seed: Availability[] = [];
    const today = new Date();
    for (const nurse of INITIAL_NURSES) {
      for (let d = 0; d < 30; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        if (date.getDay() === 0) continue;
        seed.push({
          id: crypto.randomUUID(),
          nurse_id: nurse.id,
          date: dateStr,
          start_time: '06:00',
          end_time: '18:00',
          is_available: true,
          created_at: today.toISOString(),
          updated_at: today.toISOString()
        });
      }
    }
    return seed;
  });

  useEffect(() => {
    if (!currentUser) {
      localStorage.setItem('biencuidar_availability', JSON.stringify(availabilityCache));
    }
  }, [availabilityCache, currentUser]);

  const getAvailability = useCallback(async (nurseId: string, startDate: string, endDate: string): Promise<Availability[]> => {
    try {
      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .eq('nurse_id', nurseId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;
      return (data || []) as Availability[];
    } catch {
      return availabilityCache.filter(
        a => a.nurse_id === nurseId &&
        a.date >= startDate &&
        a.date <= endDate &&
        a.is_available
      );
    }
  }, [availabilityCache]);

  const addAvailability = useCallback(async (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>): Promise<Availability> => {
    const newAvailability: Availability = {
      ...availabilityData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setAvailabilityCache(prev => [...prev, newAvailability]);

    try {
      const { data, error } = await supabase
        .from('availability')
        .insert(availabilityData)
        .select()
        .single();

      if (error) throw error;

      return {
        ...newAvailability,
        id: data.id,
        created_at: data.created_at,
        updated_at: data.updated_at
      } as Availability;
    } catch (err) {
      console.warn('Failed to save availability to Supabase:', err);
      showToast('No se pudo guardar la disponibilidad en el servidor.', 'error');
      return newAvailability;
    }
  }, [showToast]);

  return {
    availabilityCache,
    getAvailability,
    addAvailability,
  };
}
