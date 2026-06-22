/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type FC, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { Save, Edit3, CheckCircle2, Calculator, Sun, Moon, Sunset, ShieldCheck, FileText, Crosshair, Loader2, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { SHIFTS, type ShiftType, type WeekDay } from '../types';
import { RETENTION_RATE, calculateNurseNet } from '../data/standardRates';
import { CSSPVerificationBadge } from './CSSPVerificationBadge';
import { validateCSSPRegistration } from '../lib/csspValidation';

const allSpecialtyTags = [
  'Geriatría', 'Demencia y Alzheimer', 'Inyecciones', 'Postoperatorio', 
  'Curaciones complejas', 'Fisioterapia Básica', 'Manejo de Sondas', 
  'Cuidados Paliativos', 'Monitoreo Cardíaco', 'Control de Diabetes', 'Nutrición asistida'
];

const DAY_LABELS: { day: WeekDay; label: string }[] = [
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mié' },
  { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' },
  { day: 6, label: 'Sáb' },
  { day: 0, label: 'Dom' },
];

const SHIFT_ICONS: Record<ShiftType, typeof Sun> = {
  morning: Sun,
  afternoon: Sunset,
  night: Moon,
};

export const NurseProfileEdit: FC = () => {
  const { currentNurse, currentUser, updateNurseProfile, updateProfile } = useApp();

  const [shiftRate, setShiftRate] = useState<number>(currentNurse?.shift_rate || 25);
  const [selectedShifts, setSelectedShifts] = useState<ShiftType[]>(currentNurse?.available_shifts || ['morning']);
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>(currentNurse?.available_days || [1, 2, 3, 4, 5]);
  const [bio, setBio] = useState<string>(currentNurse?.bio || '');
  const [experienceYears, setExperienceYears] = useState<number>(currentNurse?.experience_years || 5);
  const [phone, setPhone] = useState<string>(currentUser?.phone || '');
  const [locationName, setLocationName] = useState<string>(currentUser?.location_name || '');
  const [locating, setLocating] = useState(false);

  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(currentNurse?.specialization || []);
  const [customSpec, setCustomSpec] = useState<string>('');
  const [showNotify, setShowNotify] = useState(false);

  // CSSP obligatorio + verificaciones opcionales
  const [csspReg, setCsspReg] = useState<string>(currentNurse?.cssp_registration || '');
  const [csspLevel, setCsspLevel] = useState<string>(currentNurse?.cssp_level || 'Licenciada');
  const [collegeReg, setCollegeReg] = useState<string>(currentNurse?.verifications?.college_registration || '');

  // Stepper
  const [step, setStep] = useState<number>(1);
  const totalSteps = 3;

  // Secciones colapsables
  const [showCalculator, setShowCalculator] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);

  if (!currentNurse || !currentUser) return null;

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await res.json();
          const addr = data.address || {};
          const parts = [
            addr.road || addr.neighbourhood,
            addr.suburb || addr.city_district,
            addr.city || addr.town || addr.village || addr.municipality,
          ].filter(Boolean);
          setLocationName(parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(','));
        } catch {
          setLocationName(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleToggleSpec = (tag: string) => {
    setSelectedSpecs(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const handleAddCustomSpec = () => {
    if (customSpec.trim() && !selectedSpecs.includes(customSpec.trim())) {
      setSelectedSpecs(prev => [...prev, customSpec.trim()]);
      setCustomSpec('');
    }
  };

  const toggleShift = (shift: ShiftType) => {
    setSelectedShifts(prev =>
      prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift]
    );
  };

  const toggleDay = (day: WeekDay) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleProfileSave = (e: FormEvent) => {
    e.preventDefault();

    const csspValidation = validateCSSPRegistration(csspReg);
    if (!csspValidation.valid) {
      setStep(3);
      return;
    }

    updateNurseProfile({
      shift_rate: Number(shiftRate),
      available_shifts: selectedShifts,
      available_days: selectedDays,
      bio,
      experience_years: Number(experienceYears),
      specialization: selectedSpecs,
      cssp_registration: csspReg.trim(),
      cssp_level: csspLevel as 'Licenciada' | 'Tecnóloga' | 'Técnica' | 'Auxiliar',
      verifications: {
        college_registration: collegeReg.trim() || undefined,
      },
    });

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
            <Edit3 className="h-5 w-5 text-indigo-600" />
            Configurar mi Perfil de Cuidador Profesional
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Modifica tu tarifa por turno, tu ubicación y especializaciones médicas que ven las familias.
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

      {/* Stepper indicator */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
              step >= s ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
            }`}>
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            <span className={`text-[10px] font-bold ${step >= s ? 'text-slate-700' : 'text-slate-400'}`}>
              {s === 1 ? 'Datos básicos' : s === 2 ? 'Disponibilidad' : 'Registro CSSP'}
            </span>
            {s < 3 && <div className={`h-0.5 flex-1 rounded ${step > s ? 'bg-indigo-600' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <form onSubmit={handleProfileSave} className="space-y-6">

        {/* STEP 1: Datos básicos */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-2xl relative space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Tarifa por Turno (US$)
                </label>
                <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    required
                    min="10"
                    max="50"
                    value={shiftRate}
                    onChange={(e) => setShiftRate(Number(e.target.value))}
                    className="w-full bg-transparent pl-7 pr-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                    id="input-edit-rate"
                  />
                </div>
              </div>

              <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-2xl relative space-y-1.5">
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
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs font-bold">Años</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">Años de servicio formal en cuidados.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Teléfono</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+503 0000 0000"
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  id="input-edit-phone"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ubicación</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="Toca el icono para detectar..."
                      className="w-full pl-9 pr-3 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      id="input-edit-location"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={locating}
                    className="flex-shrink-0 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition flex items-center justify-center cursor-pointer disabled:opacity-50"
                    title="Usar mi ubicación"
                  >
                    {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Biografía profesional
              </label>
              <textarea
                required
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Cuéntanos sobre tu experiencia y enfoque de cuidado..."
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none leading-relaxed"
                id="input-edit-bio"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Especialidades
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
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                      id={`btn-spec-toggle-${tag}`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Agregar especialidad personalizada</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSpec}
                    onChange={(e) => setCustomSpec(e.target.value)}
                    placeholder="Ej. Oncología, Traumatología..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:border-indigo-500"
                    id="input-custom-spec"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSpec}
                    disabled={!customSpec.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                  >
                    Agregar
                  </button>
                </div>
                {selectedSpecs.filter(s => !allSpecialtyTags.includes(s)).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedSpecs.filter(s => !allSpecialtyTags.includes(s)).map(s => (
                      <span key={s} className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-100 flex items-center gap-1">
                        {s}
                        <button type="button" onClick={() => handleToggleSpec(s)} className="hover:text-emerald-900 cursor-pointer">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="bg-indigo-600 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Disponibilidad */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Turnos disponibles
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(SHIFTS) as ShiftType[]).map(shift => {
                  const Icon = SHIFT_ICONS[shift];
                  const isSelected = selectedShifts.includes(shift);
                  return (
                    <button
                      key={shift}
                      type="button"
                      onClick={() => toggleShift(shift)}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{SHIFTS[shift].label}</span>
                      <span className="text-[9px] opacity-70">{SHIFTS[shift].start}-{SHIFTS[shift].end}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Días disponibles
              </label>
              <div className="flex gap-1.5">
                {DAY_LABELS.map(({ day, label }) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="bg-slate-100 text-slate-600 font-bold text-xs px-6 py-3 rounded-xl transition cursor-pointer"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="bg-indigo-600 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Registro CSSP */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/60 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700">Registro CSSP (Obligatorio)</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Tu registro del CSSP es obligatorio para ejercer legalmente en El Salvador. Sin este registro no puedes activar tu perfil en BienCuidar.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Número de registro CSSP *</label>
                <input
                  type="text"
                  required
                  value={csspReg}
                  onChange={(e) => setCsspReg(e.target.value)}
                  placeholder="Ej: CSSP-ENF-2024-0456"
                  className={`w-full text-xs font-medium bg-slate-50 border outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:ring-1 transition ${csspReg.trim() ? 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'}`}
                />
                {csspReg.trim() && !validateCSSPRegistration(csspReg).valid && (
                  <p className="text-[10px] text-rose-600 font-medium mt-1">{validateCSSPRegistration(csspReg).message}</p>
                )}
                {csspReg.trim() && validateCSSPRegistration(csspReg).valid && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">{validateCSSPRegistration(csspReg).message}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Nivel profesional *</label>
                <select
                  value={csspLevel}
                  onChange={(e) => setCsspLevel(e.target.value)}
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                >
                  <option value="Licenciada">Licenciada en Enfermería</option>
                  <option value="Tecnóloga">Tecnóloga en Enfermería</option>
                  <option value="Técnica">Técnica en Enfermería</option>
                  <option value="Auxiliar">Auxiliar de Enfermería</option>
                </select>
              </div>
            </div>

            {/* Estado de verificación CSSP (si ya tiene registro guardado) */}
            {currentNurse && currentNurse.cssp_registration && (
              <CSSPVerificationBadge nurse={currentNurse} variant="full" />
            )}

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Registro del Colegio/Asociación (opcional)</label>
              <input
                type="text"
                value={collegeReg}
                onChange={(e) => setCollegeReg(e.target.value)}
                placeholder="Ej: ENF-2024-0123"
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="bg-slate-100 text-slate-600 font-bold text-xs px-6 py-3 rounded-xl transition cursor-pointer"
              >
                Atrás
              </button>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer"
                id="btn-edit-profile-submit"
              >
                <Save className="h-4 w-4" />
                <span>Guardar y publicar</span>
              </button>
            </div>
          </div>
        )}

      </form>

      {/* SECCION INFORMATIVA APARTE: Calculadora tributaria + pago BienCuidar (colapsables) */}
      <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">

        {/* Calculadora tributaria colapsable */}
        <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCalculator(!showCalculator)}
            className="w-full flex items-center justify-between p-4 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Calculator className="h-5 w-5 text-indigo-600 shrink-0" />
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Calculadora tributaria</span>
            </div>
            {showCalculator ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showCalculator && (
            <div className="px-4 pb-4 space-y-4">
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Retención del 10% de ISR sobre servicios profesionales independientes (Art. 156 C.T.).</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-700 font-medium">
                <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tarifa bruta / turno</span>
                  <span className="text-base font-black text-slate-800">US$ {shiftRate.toFixed(2)}</span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Retención ISR (10%)</span>
                  <span className="text-base font-black text-rose-600">-US$ {(shiftRate * 0.1).toFixed(2)}</span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-indigo-100 shadow-sm bg-indigo-50/20">
                  <span className="text-[10px] uppercase font-bold text-indigo-700 block mb-1">Neto / turno</span>
                  <span className="text-base font-black text-indigo-700">US$ {calculateNurseNet(shiftRate, true).toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Proyección mensual</span>
                <div className="grid grid-cols-3 gap-2.5 text-center text-[11px]">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-500 block text-[9px] uppercase">1 turno</span>
                    <span className="font-black text-slate-800 block mt-0.5">US$ {calculateNurseNet(shiftRate, true).toFixed(2)}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-500 block text-[9px] uppercase">1 semana (5)</span>
                    <span className="font-black text-slate-800 block mt-0.5">US$ {(calculateNurseNet(shiftRate, true) * 5).toFixed(2)}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-500 block text-[9px] uppercase">1 mes (20)</span>
                    <span className="font-black text-indigo-600 block mt-0.5">US$ {(calculateNurseNet(shiftRate, true) * 20).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cómo funciona el pago colapsable */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPaymentInfo(!showPaymentInfo)}
            className="w-full flex items-center justify-between p-4 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Cómo funciona tu pago</span>
            </div>
            {showPaymentInfo ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showPaymentInfo && (
            <div className="px-4 pb-4 space-y-4">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Hay dos caminos según lo que elija la familia al publicar la solicitud. Tú ves la preferencia antes de ofertar y puedes ajustar tu tarifa.
              </p>

              <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2">
                <div className="space-y-1 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span>Tu tarifa por turno</span>
                    <span className="font-bold text-slate-800">${shiftRate.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>ISR (10%)</span>
                    <span>-${(shiftRate * RETENTION_RATE).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-1.5 flex justify-between">
                    <span className="font-bold text-slate-700">Recibes neto</span>
                    <span className="font-black text-emerald-600">${calculateNurseNet(shiftRate, true).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">💵</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Sin factura (pago directo):</strong> La familia te paga directamente. Tú declaras tu ISR ante Hacienda por tu cuenta. BienCuidar no interviene.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">📋</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Con factura (FSEE):</strong> La familia transfiere a BienCuidar, quien retiene el 10% ISR y te transfiere el neto. BienCuidar emite la FSEE que sirve como tu comprobante de ingreso ante Hacienda, cooperativas o trámites de visa.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">💡</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Ajusta tu tarifa:</strong> Si la familia pide factura, recibes 10% menos. Puedes ofertar más alto para compensar. Si no pide factura, puedes ofertar más bajo.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">🏦</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Respaldo para microcréditos:</strong> Tu historial de servicios facturados sirve como comprobante verificable ante cooperativas y entidades financieras.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
