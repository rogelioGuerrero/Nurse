/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Availability } from '../types';

interface AvailabilityCalendarProps {
  nurseId: string;
  isEditable?: boolean;
}

export default function AvailabilityCalendar({ nurseId, isEditable = false }: AvailabilityCalendarProps) {
  const { getAvailability, addAvailability } = useApp();
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAvailability, setNewAvailability] = useState({
    date: '',
    start_time: '08:00',
    end_time: '18:00',
    is_available: true,
    notes: ''
  });

  const loadAvailability = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      const data = await getAvailability(
        nurseId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setAvailability(data);
    } catch (error) {
      console.error('Error loading availability:', error);
    } finally {
      setLoading(false);
    }
  }, [nurseId, currentMonth, getAvailability]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const getAvailabilityForDay = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return availability.filter(a => a.date === dateStr);
  };

  const handleAddAvailability = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await addAvailability({
        nurse_id: nurseId,
        date: newAvailability.date,
        start_time: newAvailability.start_time,
        end_time: newAvailability.end_time,
        is_available: newAvailability.is_available,
        notes: newAvailability.notes
      });
      setShowAddModal(false);
      setNewAvailability({
        date: '',
        start_time: '08:00',
        end_time: '18:00',
        is_available: true,
        notes: ''
      });
      loadAvailability();
    } catch (error) {
      console.error('Error adding availability:', error);
    }
  };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Calendar className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Calendario de Disponibilidad</h3>
            <p className="text-sm text-slate-500">Gestiona tus horarios disponibles</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            ←
          </button>
          <span className="font-semibold text-slate-700 min-w-[150px] text-center">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            →
          </button>
          {isEditable && (
            <button
              onClick={() => setShowAddModal(true)}
              className="ml-4 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-slate-500 py-2">
              {day}
            </div>
          ))}
          
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="h-24" />
          ))}
          
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayAvailability = getAvailabilityForDay(day);
            const hasAvailability = dayAvailability.length > 0;
            const isFullyAvailable = hasAvailability && dayAvailability.every(a => a.is_available);
            const isPartiallyAvailable = hasAvailability && dayAvailability.some(a => a.is_available) && !isFullyAvailable;

            return (
              <div
                key={day}
                className={`h-24 border rounded-lg p-2 ${
                  hasAvailability
                    ? isFullyAvailable
                      ? 'bg-emerald-50 border-emerald-200'
                      : isPartiallyAvailable
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-rose-50 border-rose-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-semibold text-sm mb-1">{day}</div>
                {hasAvailability && (
                  <div className="space-y-1">
                    {dayAvailability.slice(0, 2).map(avail => (
                      <div
                        key={avail.id}
                        className={`text-xs p-1 rounded ${
                          avail.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {avail.start_time} - {avail.end_time}
                      </div>
                    ))}
                    {dayAvailability.length > 2 && (
                      <div className="text-xs text-slate-500">
                        +{dayAvailability.length - 2} más
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="font-bold text-lg mb-4">Agregar Disponibilidad</h3>
            <form onSubmit={handleAddAvailability} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
                <input
                  type="date"
                  value={newAvailability.date}
                  onChange={(e) => setNewAvailability({ ...newAvailability, date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hora inicio</label>
                  <input
                    type="time"
                    value={newAvailability.start_time}
                    onChange={(e) => setNewAvailability({ ...newAvailability, start_time: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hora fin</label>
                  <input
                    type="time"
                    value={newAvailability.end_time}
                    onChange={(e) => setNewAvailability({ ...newAvailability, end_time: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newAvailability.is_available}
                    onChange={(e) => setNewAvailability({ ...newAvailability, is_available: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">Disponible</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <textarea
                  value={newAvailability.notes}
                  onChange={(e) => setNewAvailability({ ...newAvailability, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Agregar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
