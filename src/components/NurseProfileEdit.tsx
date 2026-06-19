/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, Save, ShieldCheck, DollarSign, Compass, Edit3, HeartPulse, CheckCircle2 } from 'lucide-react';

export const NurseProfileEdit: React.FC = () => {
  const { currentNurse, currentUser, updateNurseProfile, updateProfile } = useApp();

  const [hourlyRate, setHourlyRate] = useState<number>(currentNurse?.hourly_rate || 200);
  const [coverageRadius, setCoverageRadius] = useState<number>(currentNurse?.coverage_radius || 5);
  const [availability, setAvailability] = useState<string>(currentNurse?.availability || 'Lunes a Viernes, Turno Completo');
  const [bio, setBio] = useState<string>(currentNurse?.bio || '');
  const [experienceYears, setExperienceYears] = useState<number>(currentNurse?.experience_years || 5);
  const [phone, setPhone] = useState<string>(currentUser?.phone || '');
  const [locationName, setLocationName] = useState<string>(currentUser?.location_name || '');

  // Tag helper selection
  const allSpecialtyTags = [
    'Geriatría', 'Demencia y Alzheimer', 'Inyecciones', 'Postoperatorio', 
    'Curaciones complejas', 'Fisioterapia Básica', 'Manejo de Sondas', 
    'Cuidados Paliativos', 'Monitoreo Cardíaco', 'Control de Diabetes', 'Nutrición asistida'
  ];
  
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(currentNurse?.specialization || []);
  const [showNotify, setShowNotify] = useState(false);

  if (!currentNurse || !currentUser) return null;

  const handleToggleSpec = (tag: string) => {
    setSelectedSpecs(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Save Nurse specific specs
    updateNurseProfile({
      hourly_rate: Number(hourlyRate),
      coverage_radius: Number(coverageRadius),
      availability,
      bio,
      experience_years: Number(experienceYears),
      specialization: selectedSpecs
    });

    // Save Profile demographics coordinates
    updateProfile({
      phone,
      location_name: locationName
    });

    setShowNotify(true);
    setTimeout(() => setShowNotify(false), 3000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6" id="nurse-profile-edit-root">
      
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <Edit3 className="h-5.5 w-5.5 text-indigo-550" />
            Configurar mi Perfil de Cuidador Profesional
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Modifica tus tarifas por hora, radio de viaje y especializaciones médicas que ven las familias de tu sector.
          </p>
        </div>

        {/* Dynamic notify card */}
        {showNotify && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 animate-fade-in" id="notify-save-success">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>¡Guardado Correctamente!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleProfileSave} className="space-y-6">
        
        {/* Core numbers parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Rate Card */}
          <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-2xl relative space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Tarifa por Hora (MXN)
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 font-bold">$</span>
              <input
                type="number"
                required
                min="50"
                max="1000"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full bg-transparent pl-7 pr-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                id="input-edit-rate"
              />
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">Se aconseja entre $150 MXN y $300 MXN dependiendo de tu especialización geriátrica.</p>
          </div>

          {/* Travel Radius km */}
          <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-2xl relative space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Radio de Cobertura (Km)
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <input
                type="number"
                required
                min="1"
                max="50"
                value={coverageRadius}
                onChange={(e) => setCoverageRadius(Number(e.target.value))}
                className="w-full bg-transparent px-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                id="input-edit-radius"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-450 text-xs font-bold">Km</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">Rango geográfico límite para traslados médicos desde tu domicilio actual.</p>
          </div>

          {/* Experience years count */}
          <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-2xl relative space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Años de Experiencia
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <input
                type="number"
                required
                min="0"
                max="50"
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="w-full bg-transparent px-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                id="input-edit-exp"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-450 text-xs font-bold">Años</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">Años de servicio formal que avalan el currículum de cuidados geriátricos.</p>
          </div>

        </div>

        {/* Demographics row controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          
          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Teléfono de Contacto</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              id="input-edit-phone"
            />
          </div>

          {/* Location Area Text */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Área de Operación Principal</label>
            <input
              type="text"
              required
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              id="input-edit-location"
            />
          </div>

        </div>

        {/* Availability details */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
            Detalle de Disponibilidad Semanal
          </label>
          <input
            type="text"
            required
            placeholder="Ej; Lunes a Sábado, Turno Vespertino o Nocturno flexible..."
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            id="input-edit-availability"
          />
        </div>

        {/* Bio description */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
            Biografía Profesional y Enfoque Geriátrico
          </label>
          <textarea
            required
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none leading-relaxed"
            id="input-edit-bio"
          />
        </div>

        {/* Speciality selections list */}
        <div className="space-y-2 pt-2 border-t border-slate-50">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Habilidades Médicas y Especializaciones Especiales (Selecciona las que dominas)
          </label>
          <div className="flex flex-wrap gap-2">
            {allSpecialtyTags.map(tag => {
              const isSelected = selectedSpecs.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => handleToggleSpec(tag)}
                  className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                      : 'bg-white text-slate-600 border-slate-250 hover:bg-slate-50'
                  }`}
                  id={`btn-spec-toggle-${tag}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-md shadow-indigo-150 flex items-center gap-2 cursor-pointer"
            id="btn-edit-profile-submit"
          >
            <Save className="h-4 w-4" />
            <span>Guardar Ajustes y Publicar</span>
          </button>
        </div>

      </form>
    </div>
  );
};
