/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { AppContextProvider, useApp } from './context/AppContext';
import { MapComponent } from './components/MapComponent';
import { SearchFilters } from './components/SearchFilters';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getDistanceKm, USER_COORDS } from './lib/distance';
import { 
  Stethoscope, Calendar, 
  Star, Sparkles,
  Heart, Users, ChevronRight, GraduationCap, Network, MapPinned, MessageCircle,
  Menu, X, Search, Inbox, ClipboardList
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
const PlanReview = lazy(() => import('./components/PlanReview').then(m => ({ default: m.PlanReview })));
const OffersReview = lazy(() => import('./components/OffersReview').then(m => ({ default: m.OffersReview })));
import { LandingPage } from './components/LandingPage';
import { AuthForm } from './components/AuthForm';

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
    careOffers
  } = useApp();

  // Search and general filtering states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>('');
  const [maxRate, setMaxRate] = useState<number>(40);
  const [sortBy, setSortBy] = useState<string>('distance');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth states
  const [authMode, setAuthMode] = useState<'landing' | 'login' | 'register'>('landing');
  const [authRole, setAuthRole] = useState<'family' | 'nurse'>('family');

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

      {/* Main Premium Navbar - hidden on landing */}
      {activeTab !== 'landing' && (
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40" id="main-header">
        <div className="max-w-2xl mx-auto px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          
          {/* Brand/Product Logo + Mobile toggle */}
          <div className="flex items-center justify-between gap-3 cursor-pointer select-none">
            <div className="flex items-center gap-3" onClick={() => { setSelectedNurseId(null); setActiveTab(currentUser?.role === 'nurse' ? 'nurse-inbox' : 'care-request'); setMobileMenuOpen(false); }}>
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center transform hover:scale-105 transition-all duration-200 border border-indigo-700 shadow-sm">
                <div className="w-4.5 h-4.5 border border-white rounded-full flex items-center justify-center">
                  <Stethoscope className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-bold font-serif italic tracking-tight text-slate-900">BienCuidar</span>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Cuidado del Adulto Mayor</p>
              </div>
            </div>

            {/* User indicator */}
            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-1 pr-3 py-1">
                <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {currentUser.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-xs font-medium text-slate-700 hidden sm:block">
                  {currentUser.full_name?.split(' ')[0] || 'Usuario'}
                </span>
              </div>
            )}
            
            {/* Mobile menu toggle button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              id="btn-mobile-menu-toggle"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Navigation Control Buttons */}
          <nav className={`flex flex-wrap items-center gap-1 sm:gap-2 text-xs ${mobileMenuOpen ? 'flex' : 'hidden sm:flex'}`}>
            
            {/* Familiar: buscar + solicitudes + plan + apoyo clinico */}
            {currentUser?.role !== 'nurse' && (
              <>
                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('care-request'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'care-request'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-care-request"
                >
                  <Search className="h-4 w-4" />
                  <span>Buscar Enfermeras</span>
                </button>

                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('bookings'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'bookings'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-bookings"
                >
                  <ClipboardList className="h-4 w-4" />
                  <span>Mis Solicitudes</span>
                </button>

                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('offers-review'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer relative ${
                    activeTab === 'offers-review'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-offers-review"
                >
                  <Inbox className="h-4 w-4" />
                  <span>Ofertas Recibidas</span>
                  {pendingOffersCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {pendingOffersCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setSelectedNurseId(null); setActiveTab('plan-review'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'plan-review'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-plan-review"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Plan de Cuidado</span>
                </button>

                <button
                  onClick={() => { setActiveTab('clinical-ai'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'clinical-ai'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-clinical-ai"
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Apoyo Clínico</span>
                </button>
              </>
            )}

            {/* Enfermera: solicitudes + perfil + servicios + apoyo clinico */}
            {currentUser?.role === 'nurse' && (
              <>
                <button
                  onClick={() => { setActiveTab('nurse-inbox'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'nurse-inbox'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-nurse-inbox"
                >
                  <Inbox className="h-4 w-4" />
                  <span>Solicitudes</span>
                </button>

                <button
                  onClick={() => { setActiveTab('nurse-profile-edit'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'nurse-profile-edit'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-nurse-edit"
                >
                  <Network className="h-4 w-4" />
                  <span>Mi Perfil</span>
                </button>

                <button
                  onClick={() => { setActiveTab('bookings'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'bookings'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-bookings"
                >
                  <ClipboardList className="h-4 w-4" />
                  <span>Mis Servicios</span>
                </button>

                <button
                  onClick={() => { setActiveTab('clinical-ai'); setMobileMenuOpen(false); }}
                  className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'clinical-ai'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  id="tab-btn-clinical-ai"
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Apoyo Clínico</span>
                </button>
              </>
            )}

          </nav>

        </div>
      </header>
      )}

      {/* Main Content Pane */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4" id="main-content-layout">
        
        {/* Landing page when no user */}
        {activeTab === 'landing' && (
          <>
            {authMode === 'landing' ? (
              <LandingPage
                onFamily={() => { setActiveTab('care-request'); setAuthMode('landing'); }}
                onNurse={() => { setAuthRole('nurse'); setAuthMode('register'); }}
              />
            ) : (
              <AuthForm
                mode={authMode}
                role={authRole}
                onBack={() => setAuthMode('landing')}
                onSuccess={() => {
                  setAuthMode('landing');
                  // Redirigir al tab correcto según rol
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

        {activeTab === 'plan-review' && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <PlanReview />
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

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-8 mt-12 shrink-0">
        <div className="max-w-2xl mx-auto px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Stethoscope className="h-3.5 w-3.5" />
            </div>
            <span className="text-white font-bold text-sm">BienCuidar</span>
            <span className="text-slate-600">| Cuidado del Adulto Mayor en El Salvador</span>
          </div>
          <p>© 2026 BienCuidar · Hecho en El Salvador</p>
        </div>
      </footer>

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
