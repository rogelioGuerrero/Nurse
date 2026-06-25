/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { AppContextProvider, useApp } from './context/AppContext';
import { supabase } from './lib/supabase';
import { openSupport } from './lib/support';
import { MapComponent } from './components/MapComponent';
import { SearchFilters } from './components/SearchFilters';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getDistanceKm, USER_COORDS, requestUserLocation } from './lib/distance';
import { 
  Stethoscope, 
  Star, Sparkles,
  Heart, Users, ChevronRight, GraduationCap, Network, MapPinned, MessageCircle,
  Search, Inbox, ClipboardList, ShieldCheck, User, LogOut, Lock, CheckCircle2, AlertCircle
} from 'lucide-react';

const LoadingSpinner = () => (
  <div className="flex justify-center py-20">
    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const NurseDetail = lazy(() => import('./components/NurseDetail').then(m => ({ default: m.NurseDetail })));
const BookingsManager = lazy(() => import('./components/BookingsManager').then(m => ({ default: m.BookingsManager })));
const NurseProfileEdit = lazy(() => import('./components/NurseProfileEdit').then(m => ({ default: m.NurseProfileEdit })));
const ClinicalAI = lazy(() => import('./components/ClinicalAI'));
const CareRequestForm = lazy(() => import('./components/CareRequestForm').then(m => ({ default: m.CareRequestForm })));
const NurseInbox = lazy(() => import('./components/NurseInbox').then(m => ({ default: m.NurseInbox })));
const OffersReview = lazy(() => import('./components/OffersReview').then(m => ({ default: m.OffersReview })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const FamilyProfileEdit = lazy(() => import('./components/FamilyProfileEdit').then(m => ({ default: m.FamilyProfileEdit })));
import { LandingPage } from './components/LandingPage';
import { AuthForm } from './components/AuthForm';
import { LegalDisclaimer } from './components/LegalDisclaimer';

function PasswordRecoveryForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setMessage('');

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      setMessage('Contraseña actualizada correctamente. Redirigiendo...');
      setLoading(false);
      setTimeout(() => onSuccess(), 1500);
    } catch {
      setError('Error al actualizar la contraseña. Intenta nuevamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Recuperar Contraseña</h1>
          <p className="text-xs text-slate-500">Ingresa tu nueva contraseña</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-lg">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-2 rounded-lg">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Nueva Contraseña
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Confirmar Contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleSubmit(); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Repite la contraseña"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Actualizar Contraseña
              </>
            )}
          </button>

          <button
            onClick={onCancel}
            className="w-full text-xs text-slate-500 font-bold hover:text-slate-700 transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketplaceApp() {
  const { 
    nurses, 
    profiles, 
    currentUser,
    activeTab, 
    setActiveTab,
    selectedNurseId,
    setSelectedNurseId,
    careRequests,
    careOffers,
    passwordRecoveryMode,
    setPasswordRecoveryMode
  } = useApp();

  // Search and general filtering states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>('');
  const [maxRate, setMaxRate] = useState<number>(40);
  const [sortBy, setSortBy] = useState<string>('distance');

  // Auth states
  const [authMode, setAuthMode] = useState<'landing' | 'login' | 'register'>('landing');
  const [authRole, setAuthRole] = useState<'family' | 'nurse'>('family');
  const [isAdminAccess, setIsAdminAccess] = useState(false);

  // Detect /?admin=true for hidden admin login
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      setIsAdminAccess(true);
      setAuthMode('login');
    }
    // Request real geolocation on mount
    requestUserLocation();
  }, []);

  // Calcular ofertas pendientes para badge
  const pendingOffersCount = useMemo(() => {
    if (!currentUser || currentUser.role === 'nurse') return 0;
    const myRequestIds = careRequests
      .filter(r => r.user_id === currentUser.id && r.status === 'open')
      .map(r => r.id);
    return careOffers.filter(o => 
      myRequestIds.includes(o.request_id) && o.status === 'pending'
    ).length;
  }, [careRequests, careOffers, currentUser]);

  // Si no hay usuario, mostrar landing page
  useEffect(() => {
    if (!currentUser) {
      setActiveTab('landing');
    }
  }, [currentUser]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Profile lookup map for O(1) access instead of find() in loops
  const profileMap = useMemo(() => {
    const map = new Map<string, typeof profiles[number]>();
    profiles.forEach(p => map.set(p.id, p));
    return map;
  }, [profiles]);

  // Extract all distinct specializations for robust select dropdowns
  const allSpecializations = useMemo(() => {
    const specsSet = new Set<string>();
    nurses.forEach(n => {
      n.specialization.forEach(spec => specsSet.add(spec));
    });
    return Array.from(specsSet);
  }, [nurses]);

  // Compute filtered nurses catalog
  const filteredNurses = useMemo(() => {
    let result = [...nurses];

    // Filter by name, bio, certifications
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(nurse => {
        const prof = profileMap.get(nurse.user_id);
        const nameMatch = prof?.full_name.toLowerCase().includes(q) || false;
        const bioMatch = nurse.bio.toLowerCase().includes(q);
        const certMatch = nurse.certifications.some(c => c.toLowerCase().includes(q));
        const specMatch = nurse.specialization.some(s => s.toLowerCase().includes(q));
        return nameMatch || bioMatch || certMatch || specMatch;
      });
    }

    // Filter by specialization
    if (selectedSpecialization) {
      result = result.filter(n => n.specialization.includes(selectedSpecialization));
    }

    // Filter by maximum rate per shift
    result = result.filter(n => n.shift_rate <= maxRate);

    // Sort accordingly
    if (sortBy === 'distance') {
      result.sort((a, b) => getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, a.lat, a.lng) - getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, b.lat, b.lng));
    } else if (sortBy === 'rating') {
      result.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'rate-asc') {
      result.sort((a, b) => a.shift_rate - b.shift_rate);
    } else if (sortBy === 'rate-desc') {
      result.sort((a, b) => b.shift_rate - a.shift_rate);
    } else if (sortBy === 'experience') {
      result.sort((a, b) => b.experience_years - a.experience_years);
    }

    return result;
  }, [nurses, profileMap, debouncedSearch, selectedSpecialization, maxRate, sortBy]);

  const handleInspectNurse = (id: string) => {
    setSelectedNurseId(id);
    setActiveTab('nurse-detail');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-indigo-100" id="main-layout-root">

      {/* Compact Header - logo + avatar only */}
      {activeTab !== 'landing' && currentUser?.role !== 'admin' && (
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40" id="main-header">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => { setSelectedNurseId(null); setActiveTab(currentUser?.role === 'nurse' ? 'nurse-inbox' : 'care-request'); }}>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center transform hover:scale-105 transition-all duration-200 border border-indigo-700 shadow-sm">
              <div className="w-4.5 h-4.5 border border-white rounded-full flex items-center justify-center">
                <Stethoscope className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold font-serif italic tracking-tight text-slate-900">BienCuidar</span>
            </div>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-1 pr-3 py-1">
              <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {currentUser.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-xs font-medium text-slate-700">
                {currentUser.full_name?.split(' ')[0] || 'Usuario'}
              </span>
            </div>
          )}
        </div>
      </header>
      )}

      {/* Admin Bar - solo para admin */}
      {currentUser?.role === 'admin' && activeTab !== 'landing' && (
        <div className="bg-indigo-900 text-white text-xs py-2 px-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
            <span className="font-bold flex items-center gap-1.5 shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
              Panel de Administración
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setActiveTab('admin-panel'); }}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  activeTab === 'admin-panel'
                    ? 'bg-white text-indigo-900'
                    : 'bg-indigo-800 hover:bg-indigo-700 text-white'
                }`}
              >
                Panel
              </button>
              <button
                onClick={async () => { await supabase.auth.signOut(); }}
                className="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer bg-rose-600 hover:bg-rose-500 text-white"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Pane */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 pb-24" id="main-content-layout">
        
        {/* Landing page when no user */}
        {activeTab === 'landing' && (
          <>
            {passwordRecoveryMode ? (
              <PasswordRecoveryForm
                onSuccess={() => {
                  setPasswordRecoveryMode(false);
                  setAuthMode('login');
                  window.location.reload();
                }}
                onCancel={() => {
                  setPasswordRecoveryMode(false);
                  setAuthMode('landing');
                }}
              />
            ) : isAdminAccess ? (
              <div className="min-h-[80vh] flex items-center justify-center px-5 py-8">
                <div className="w-full max-w-sm space-y-4">
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                      <ShieldCheck className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-lg font-bold text-slate-800">Acceso Administradores</h1>
                    <p className="text-xs text-slate-500">BienCuidar · Panel de administración</p>
                  </div>
                  <AuthForm
                    mode="login"
                    role="family"
                    onBack={() => { setIsAdminAccess(false); setAuthMode('landing'); }}
                    onSuccess={() => {
                      setIsAdminAccess(false);
                      setAuthMode('landing');
                      window.location.reload();
                    }}
                  />
                </div>
              </div>
            ) : authMode === 'landing' ? (
              <LandingPage
                onFamily={() => { setActiveTab('care-request'); setAuthMode('landing'); }}
                onNurse={() => { setAuthRole('nurse'); setAuthMode('register'); }}
                onAdminAccess={() => { setIsAdminAccess(true); setAuthMode('login'); }}
              />
            ) : (
              <AuthForm
                mode={authMode}
                role={authRole}
                onBack={() => setAuthMode('landing')}
                onSuccess={() => {
                  setAuthMode('landing');
                  if (authRole === 'nurse') {
                    setActiveTab('nurse-profile-edit');
                  } else {
                    setActiveTab('care-request');
                  }
                  window.location.reload();
                }}
              />
            )}
          </>
        )}

        {/* Dynamic active view routing switch */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            {/* Elegant Hero card intro */}
            <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-md">
              <div className="space-y-3 z-10">
                <h1 className="text-3xl md:text-4xl font-serif italic tracking-tight font-normal">
                  Cuidado de calidad en tu hogar.
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                  Enfermeras profesionales verificadas para el cuidado de tus seres queridos. Filtra por cercanía, precio y especialidad.
                </p>
              </div>
            </div>

            {/* Comprehensive Search & Multi-Filters Panel */}
            <SearchFilters 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedSpecialization={selectedSpecialization}
              setSelectedSpecialization={setSelectedSpecialization}
              maxRate={maxRate}
              setMaxRate={setMaxRate}
              sortBy={sortBy}
              setSortBy={setSortBy}
              allSpecializations={allSpecializations}
            />

            {/* Split Dual-Pane View: Caregiver list and custom interactive map */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Caregiver list column (Left pane) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex justify-between items-center bg-slate-100 p-2 rounded-xl">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-widest pl-2">
                    Resultados ({filteredNurses.length})
                  </span>
                </div>

                {filteredNurses.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-medium" id="search-results-empty">
                    <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-700 font-semibold">No se encontraron cuidadores con estos filtros.</p>
                    <p className="text-xs mt-1">Prueba relajando las tarifas o cambiando la especialidad consultada.</p>
                  </div>
                ) : (
                  <div className="space-y-4" id="nurses-catalog-list">
                    {filteredNurses.map((nurse) => {
                      const profile = profileMap.get(nurse.user_id);
                      if (!profile) return null;

                      const isSelected = selectedNurseId === nurse.id;

                      return (
                        <div
                          key={nurse.id}
                          onClick={() => handleInspectNurse(nurse.id)}
                          className={`bg-white border rounded-2xl p-5 shadow-sm transition flex flex-col sm:flex-row gap-4 items-center sm:items-start cursor-pointer group ${
                            isSelected 
                              ? 'border-indigo-600 ring-1 ring-indigo-500' 
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                          id={`nurse-card-${nurse.id}`}
                        >
                          {/* Image box and rating summary */}
                          <div className="relative shrink-0 select-none">
                            <img 
                              src={profile.avatar_url} 
                              alt={profile.full_name} 
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-slate-200 shadow-sm"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                            <div className="absolute -bottom-2 -left-1 -right-1 bg-amber-50 rounded-full border border-amber-200 py-0.5 px-1.5 text-center flex items-center justify-center gap-0.5 shadow-sm">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                              <span className="text-[10px] font-black text-amber-800">{nurse.rating.toFixed(1)}</span>
                            </div>
                          </div>

                          {/* Profile information */}
                          <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <div>
                                <h3 className="font-bold text-slate-900 font-serif italic text-base leading-snug group-hover:text-indigo-600 transition">
                                  {profile.full_name}
                                </h3>
                                <p className="text-[10px] text-indigo-600 font-bold flex items-center justify-center sm:justify-start gap-1">
                                  <GraduationCap className="h-3.5 w-3.5" />
                                  Exp: {nurse.experience_years} años profesionales
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold flex items-center justify-center sm:justify-start gap-1">
                                  <MapPinned className="h-3.5 w-3.5 text-indigo-400" />
                                  {getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, nurse.lat, nurse.lng).toFixed(1)} km de ti
                                </p>
                              </div>
                              <div className="text-slate-800 text-right shrink-0">
                                <span className="text-indigo-600 font-black text-lg block">US$ {nurse.shift_rate}<span className="text-xs font-normal text-slate-400">/turno</span></span>
                              </div>
                            </div>

                            <p className="text-xs text-slate-500 overflow-hidden text-ellipsis line-clamp-2 leading-relaxed">
                              {nurse.bio}
                            </p>

                            {/* Specialty badges mapping */}
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-1">
                              {nurse.specialization.slice(0, 3).map((spec) => (
                                <span 
                                  key={spec} 
                                  className="bg-slate-50 text-slate-700 font-semibold px-2.5 py-1 rounded-xl text-[10px] border border-slate-200"
                                >
                                  {spec}
                                </span>
                              ))}
                              {nurse.specialization.length > 3 && (
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50/50 px-2 py-1 rounded-xl">
                                  +{nurse.specialization.length - 3} más
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Detail navigational arrow column */}
                          <div className="shrink-0 flex sm:flex-col justify-end items-end h-full gap-2 self-stretch pt-2 sm:pt-0">
                            {profile.phone && (
                              <a
                                href={`https://wa.me/503${profile.phone.replace(/[^0-9]/g, '').replace(/^503/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold w-full sm:w-auto px-4 py-2 rounded-xl transition flex items-center justify-center gap-1 shadow-sm"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspectNurse(nurse.id);
                              }}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 text-xs font-bold w-full sm:w-auto px-4 py-2 rounded-xl transition flex items-center justify-center gap-1 shadow-sm"
                              id={`btn-inspect-${nurse.id}`}
                            >
                              <span>Ver Perfil</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Interactive custom coordinates map (Right pane) */}
              <div className="lg:col-span-5 h-full lg:sticky lg:top-28">
                <MapComponent 
                  filteredNurses={filteredNurses}
                />
              </div>

            </div>

          </div>
        )}

        {activeTab === 'care-request' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <CareRequestForm />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'nurse-inbox' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <NurseInbox />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'offers-review' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <OffersReview />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'nurse-detail' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <NurseDetail />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'bookings' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <BookingsManager />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'clinical-ai' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <ClinicalAI />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'nurse-profile-edit' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <NurseProfileEdit />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'family-profile-edit' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <FamilyProfileEdit />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'admin-panel' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <AdminPanel />
            </Suspense>
          </ErrorBoundary>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-8 mt-12 shrink-0 pb-24">
        <div className="max-w-2xl mx-auto px-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                <Stethoscope className="h-3.5 w-3.5" />
              </div>
              <span className="text-white font-bold text-sm">BienCuidar</span>
              <span className="text-slate-600">| Servicios de intermediación en el cuidado de la salud</span>
            </div>
            <p className="text-[11px] text-slate-500">© 2026 BienCuidar · Hecho en El Salvador</p>
            <p className="text-[11px] text-slate-500">Operado y respaldo legal por AGTI, S.A. de C.V.</p>
          </div>
          <div className="border-t border-slate-800 pt-4">
            <LegalDisclaimer variant="compact" />
          </div>
        </div>
      </footer>

      {/* Bottom Navigation Bar - mobile-first, always visible */}
      {activeTab !== 'landing' && currentUser?.role !== 'admin' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 safe-area-pb" id="bottom-nav">
          <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-1.5">
            {currentUser?.role !== 'nurse' ? (
              <>
                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('care-request'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'care-request' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Search className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Buscar</span>
                </button>
                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('bookings'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'bookings' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <ClipboardList className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Solicitudes</span>
                </button>
                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('offers-review'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer relative ${
                    activeTab === 'offers-review' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Inbox className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Ofertas</span>
                  {pendingOffersCount > 0 && (
                    <span className="absolute -top-0.5 right-0 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {pendingOffersCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setActiveTab('family-profile-edit'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'family-profile-edit' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <User className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Perfil</span>
                </button>
                <button
                  onClick={() => { setActiveTab('clinical-ai'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'clinical-ai' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <span className="text-[9px] font-bold">Apoyo</span>
                </button>
                <button
                  onClick={async () => { await supabase.auth.signOut(); }}
                  className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer text-slate-400 hover:text-rose-600"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Salir</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setActiveTab('nurse-inbox'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'nurse-inbox' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Inbox className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Solicitudes</span>
                </button>
                <button
                  onClick={() => { setActiveTab('bookings'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'bookings' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <ClipboardList className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Servicios</span>
                </button>
                <button
                  onClick={() => { setActiveTab('nurse-profile-edit'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'nurse-profile-edit' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Network className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Perfil</span>
                </button>
                <button
                  onClick={() => { setActiveTab('clinical-ai'); }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'clinical-ai' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <span className="text-[9px] font-bold">Apoyo</span>
                </button>
                <button
                  onClick={async () => { await supabase.auth.signOut(); }}
                  className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition cursor-pointer text-slate-400 hover:text-rose-600"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Salir</span>
                </button>
              </>
            )}
          </div>
        </nav>
      )}

      {/* Floating WhatsApp support button - visible on all screens when logged in */}
      {currentUser && (
        <button
          onClick={() => openSupport(currentUser.role === 'nurse' ? 'Hola, soy enfermera en BienCuidar y necesito ayuda' : 'Hola, necesito ayuda con BienCuidar')}
          className="fixed bottom-20 right-4 w-12 h-12 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition z-40 cursor-pointer"
          aria-label="Soporte por WhatsApp"
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </button>
      )}

    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContextProvider>
        <MarketplaceApp />
      </AppContextProvider>
    </ToastProvider>
  );
}
