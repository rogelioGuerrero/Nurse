/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, type FC, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from './Toast';
import { Save, Edit3, CheckCircle2, Calculator, Sun, Moon, Clock, ShieldCheck, FileText, Crosshair, Loader2, MapPin, ChevronDown, ChevronUp, BookOpen, DollarSign, Star, User, XCircle } from 'lucide-react';
import { SHIFTS, type ShiftType, type WeekDay, type AssignmentAvailability, type PaymentPreference } from '../types';
import { RETENTION_RATE, calculateNurseNet } from '../data/standardRates';
import { CSSPVerificationBadge } from './CSSPVerificationBadge';
import { validateCSSPRegistration } from '../lib/csspValidation';
import { verifyCSSP } from '../lib/csspVerify';

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
  day: Sun,
  night: Moon,
  full_day: Clock,
};

export const NurseProfileEdit: FC = () => {
  const { currentNurse, currentUser, updateNurseProfile, updateProfile, bookings, careLogs, nurseReviews, nurses, profiles } = useApp();
  const { showToast } = useToast();

  const [shiftRate, setShiftRate] = useState<number>(currentNurse?.shift_rate || 25);
  const [selectedShifts, setSelectedShifts] = useState<ShiftType[]>(currentNurse?.available_shifts || ['day']);
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>(currentNurse?.available_days || [1, 2, 3, 4, 5]);
  const [bio, setBio] = useState<string>(currentNurse?.bio || '');
  const [experienceYears, setExperienceYears] = useState<number>(currentNurse?.experience_years || 5);
  const [phone, setPhone] = useState<string>(currentUser?.phone || '');
  const [locationName, setLocationName] = useState<string>(currentUser?.location_name || '');
  const [locating, setLocating] = useState(false);

  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(currentNurse?.specialization || []);
  const [customSpec, setCustomSpec] = useState<string>('');
  const [showNotify, setShowNotify] = useState(false);
  const [csspError, setCsspError] = useState<string>('');

  // CSSP obligatorio + verificaciones opcionales
  const [csspReg, setCsspReg] = useState<string>(currentNurse?.cssp_registration || '');
  const [csspLevel, setCsspLevel] = useState<string>(currentNurse?.cssp_level || 'Licenciada');
  const [assignmentAvailability, setAssignmentAvailability] = useState<AssignmentAvailability>(currentNurse?.assignment_availability || 'shifts_only');
  const [paymentPreference, setPaymentPreference] = useState<PaymentPreference>(currentNurse?.payment_preference || 'per_shift');

  // Stepper
  const [step, setStep] = useState<number>(1);
  const totalSteps = 3;

  // Secciones colapsables
  const [showCalculator, setShowCalculator] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [showBenefits, setShowBenefits] = useState(false);
  const [showBitacora, setShowBitacora] = useState(false);

  // Bitácora data
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const myBookings = useMemo(() => {
    if (!currentNurse) return [];
    return bookings
      .filter(b => b.nurse_id === currentNurse.id)
      .sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
  }, [bookings, currentNurse]);

  const bitacoraStats = useMemo(() => {
    const completed = myBookings.filter(b => b.status === 'completed');
    const totalHours = completed.reduce((sum, b) => sum + b.hours, 0);
    const totalEarnings = completed.reduce((sum, b) => {
      const nurseRate = b.wants_invoice ? b.total_price - 5 * 1.13 : b.total_price;
      return sum + nurseRate;
    }, 0);
    const reportsCount = completed.filter(b => careLogs[b.id]).length;
    const myReviews = nurseReviews.filter(r => currentNurse && r.nurse_id === currentNurse.id);
    const avgRating = myReviews.length > 0 ? myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length : 0;
    return { total: myBookings.length, completed: completed.length, totalHours, totalEarnings, reportsCount, avgRating };
  }, [myBookings, careLogs, nurseReviews, currentNurse]);

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
      setCsspError(csspValidation.message);
      setStep(3);
      return;
    }
    setCsspError('');

    const csspChanged = currentNurse?.cssp_registration !== csspReg.trim() || currentNurse?.cssp_level !== csspLevel;

    updateNurseProfile({
      shift_rate: Number(shiftRate),
      available_shifts: selectedShifts,
      available_days: selectedDays,
      bio,
      experience_years: Number(experienceYears),
      specialization: selectedSpecs,
      cssp_registration: csspReg.trim(),
      cssp_level: csspLevel as 'Licenciada' | 'Tecnóloga' | 'Técnica' | 'Auxiliar',
      assignment_availability: assignmentAvailability,
      payment_preference: paymentPreference,
      verifications: {
        college_registration: currentNurse?.verifications?.college_registration || undefined,
      },
    });

    updateProfile({
      phone,
      location_name: locationName
    });

    // Re-disparar verificación CSSP si cambió el registro o nivel
    if (csspChanged && currentNurse?.id) {
      verifyCSSP(currentNurse.id, csspReg.trim(), currentUser?.full_name, csspLevel)
        .then(result => console.log('[NurseProfileEdit] CSSP verify result:', result.status, result.message))
        .catch(err => { console.error('[NurseProfileEdit] CSSP verify failed:', err); showToast('No se pudo verificar el CSSP. Intenta mas tarde.', 'error'); });
    }

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
                {csspError && !csspReg.trim() && (
                  <p className="text-[10px] text-rose-600 font-medium mt-1">{csspError}</p>
                )}
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

            {/* Disponibilidad y modelo de pago */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Disponibilidad con una misma familia</label>
                <select
                  value={assignmentAvailability}
                  onChange={(e) => setAssignmentAvailability(e.target.value as AssignmentAvailability)}
                  className="w-full text-xs font-medium bg-white border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                >
                  <option value="shifts_only">Solo por turnos (1 a 3 días)</option>
                  <option value="up_to_2_weeks">Hasta 2 semanas (7 a 15 días)</option>
                  <option value="up_to_1_month">Hasta 1 mes o más (30+ días)</option>
                  <option value="flexible">Flexible — cualquier duración</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Modelo de pago preferido</label>
                <select
                  value={paymentPreference}
                  onChange={(e) => setPaymentPreference(e.target.value as PaymentPreference)}
                  className="w-full text-xs font-medium bg-white border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                >
                  <option value="per_shift">Pago por turno</option>
                  <option value="service_contract">Contrato de servicios profesionales</option>
                  <option value="both">Ambos me funcionan</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Esto nos ayuda a saber con quién contar para asignaciones largas.</p>
              </div>
            </div>

            {/* Estado de verificación CSSP (si ya tiene registro guardado) */}
            {currentNurse && currentNurse.cssp_registration && (
              <CSSPVerificationBadge nurse={currentNurse} variant="full" />
            )}

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
                    <strong>Con factura:</strong> La familia transfiere a BienCuidar, quien retiene el 10% ISR y te transfiere el saldo neto. Se emite Factura a la familia y FSEE a ti como comprobante de ingreso ante el Ministerio de Hacienda; ese 10% retenido te sirve como pago anticipado de tu impuesto anual, lo que te facilita aplicar a devoluciones de dinero al final del año.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">💡</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Ajusta tu tarifa:</strong> Si la familia pide factura, recibes 10% menos. Puedes ofertar más alto para compensar. Si no pide factura, puedes ofertar más bajo.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Beneficios de ingresos comprobables */}
        <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBenefits(!showBenefits)}
            className="w-full flex items-center justify-between p-4 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Beneficios de tus ingresos comprobables</span>
            </div>
            {showBenefits ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {showBenefits && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Al recibir tus pagos de forma segura dentro de nuestra plataforma, obtienes beneficios que el efectivo nunca te dará:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">🏦</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Acceso a créditos y financiamiento:</strong> Tu historial de servicios y las FSEE acumuladas en la plataforma generan un registro financiero formal. Esto te sirve como comprobante de ingresos en entidades financieras, comerciales, cajas de crédito y cooperativas para solicitar préstamos, microcréditos o tarjetas.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">🏠</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Casa propia:</strong> Tus comprobantes digitales te sirven para aplicar a los créditos de vivienda para independientes del Fondo Social para la Vivienda (FSV).
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">🏥</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Seguro y pensión:</strong> Podrás comprobar tus ingresos para inscribirte al ISSS y cotizar en la AFP para tu futuro.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">💳</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Banca sin límites:</strong> Con tus facturas justificas legalmente el origen de tus fondos. Olvídate de cuentas bancarias bloqueadas por límites de lavado de dinero.
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px]">📜</span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <strong>Tu currículum de oro:</strong> Te emitimos constancias de tus turnos completados y calificaciones, sirviendo como currículum verificado para aplicar a hospitales o clínicas privadas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Bitácora colapsable */}
      <div className="mt-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBitacora(!showBitacora)}
          className="w-full flex items-center justify-between p-4 cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-indigo-600 shrink-0" />
            <div className="text-left">
              <span className="text-sm font-bold text-slate-800 block">Mi Bitácora</span>
              <span className="text-[10px] text-slate-500">Historial de servicios prestados</span>
            </div>
          </div>
          {showBitacora ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showBitacora && (
          <div className="px-4 pb-4 space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase">Servicios</p>
                <p className="text-lg font-black text-slate-800">{bitacoraStats.total}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase">Turnos</p>
                <p className="text-lg font-black text-slate-800">{bitacoraStats.completed}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase">Ingresos</p>
                <p className="text-lg font-black text-emerald-600">${bitacoraStats.totalEarnings.toFixed(0)}</p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-indigo-600" />
                <span className="text-[10px] font-bold text-indigo-700">{bitacoraStats.completed} completados</span>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] font-bold text-amber-700">{bitacoraStats.reportsCount} reportes</span>
              </div>
              {bitacoraStats.avgRating > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                  <Star className="h-3 w-3 text-emerald-600 fill-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-700">{bitacoraStats.avgRating.toFixed(1)} promedio</span>
                </div>
              )}
            </div>

            {/* Empty state */}
            {myBookings.length === 0 && (
              <div className="text-center py-6">
                <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No hay registros en tu bitácora</p>
                <p className="text-[10px] text-slate-400 mt-1">Cuando completes servicios, aparecerán aquí.</p>
              </div>
            )}

            {/* History list */}
            {myBookings.map((b) => {
              const log = careLogs[b.id];
              const review = nurseReviews.find(r => r.booking_id === b.id);
              const familyProfile = profileMap.get(b.user_id);
              const nurseRate = b.wants_invoice ? b.total_price - 5 * 1.13 : b.total_price;

              return (
                <div key={b.id} className={`bg-slate-50/70 border rounded-xl overflow-hidden ${b.status === 'cancelled' ? 'border-slate-200 opacity-75' : 'border-slate-200'}`}>
                  <div className="px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white flex flex-col items-center justify-center border border-slate-200">
                        <span className="text-xs font-black text-slate-700">{new Date(b.date + 'T00:00:00').getDate()}</span>
                        <span className="text-[7px] font-bold text-slate-500 uppercase">{['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][new Date(b.date + 'T00:00:00').getMonth()]}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs truncate">{familyProfile?.full_name || 'Familia'}</h4>
                        <div className="flex items-center gap-1 text-[9px] text-slate-500">
                          <span>{b.start_time}-{b.end_time}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        {b.status === 'completed' ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : b.status === 'cancelled' ? <XCircle className="h-3 w-3 text-rose-500" /> : <FileText className="h-3 w-3 text-indigo-500" />}
                        <span className="text-[9px] font-bold text-slate-600">{b.status === 'completed' ? 'Completado' : b.status === 'cancelled' ? 'Cancelado' : 'Confirmado'}</span>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600">${nurseRate.toFixed(0)}</span>
                    </div>
                  </div>

                  <div className="px-3 py-1.5 bg-white/50 border-t border-slate-100 text-[10px]">
                    <div className="flex items-center gap-1 text-slate-600">
                      <User className="h-2.5 w-2.5 text-indigo-400" />
                      <span className="font-bold">{b.patient_name}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 truncate">{b.patient_condition}</span>
                    </div>
                  </div>

                  {b.status === 'completed' && log && (
                    <div className="px-3 py-2 border-t border-slate-100">
                      <div className="flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3 text-amber-600" />
                        <span className="text-[9px] font-bold text-slate-600 uppercase">Reporte</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed line-clamp-3">{log.narrativeReport || `Llegada a las ${log.arrivalTime}, paciente en estado ${log.patientConditionOnArrival.toLowerCase()}.`}</p>
                    </div>
                  )}

                  {(b.status === 'completed' || b.status === 'confirmed') && (
                    <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between text-[9px]">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-slate-400" />
                        <span className={`font-bold ${b.payment_status === 'paid' ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {b.wants_invoice ? (b.payment_status === 'paid' ? 'Pagado' : 'Pendiente') : 'Pago directo'}
                        </span>
                      </div>
                      {review && (
                        <div className="flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-amber-700">{review.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
