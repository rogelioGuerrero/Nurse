/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import { useState, useMemo } from 'react';
import { AppContextProvider, useApp } from './context/AppContext';
import { MapComponent } from './components/MapComponent';
import { SearchFilters } from './components/SearchFilters';
import { NurseDetail } from './components/NurseDetail';
import { BookingsManager } from './components/BookingsManager';
import { ChatRoom } from './components/ChatRoom';
import { NurseProfileEdit } from './components/NurseProfileEdit';
import CareAdvice from './components/CareAdvice';
import ClinicalAI from './components/ClinicalAI';
import './lib/config-groq';
import { 
  Stethoscope, Calendar, MessageSquare, 
  MapPin, Star, Clock, Sparkles, SlidersHorizontal, ArrowUpRight,
  Heart, Users, CheckCircle2, ChevronRight, GraduationCap, Network
} from 'lucide-react';

function MarketplaceApp() {
  const { 
    nurses, 
    profiles, 
    currentUser, 
    switchUserRole, 
    activeTab, 
    setActiveTab,
    selectedNurseId,
    setSelectedNurseId
  } = useApp();

  // Search and general filtering states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>('');
  const [maxRate, setMaxRate] = useState<number>(30);
  const [sortBy, setSortBy] = useState<string>('rating');

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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(nurse => {
        const prof = profiles.find(p => p.id === nurse.user_id);
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

    // Filter by maximum rate per hour
    result = result.filter(n => n.hourly_rate <= maxRate);

    // Sort accordingly
    if (sortBy === 'rating') {
      result.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'rate-asc') {
      result.sort((a, b) => a.hourly_rate - b.hourly_rate);
    } else if (sortBy === 'rate-desc') {
      result.sort((a, b) => b.hourly_rate - a.hourly_rate);
    } else if (sortBy === 'experience') {
      result.sort((a, b) => b.experience_years - a.experience_years);
    }

    return result;
  }, [nurses, profiles, searchQuery, selectedSpecialization, maxRate, sortBy]);

  const handleNurseClick = (id: string) => {
    setSelectedNurseId(id);
  };

  const handleInspectNurse = (id: string) => {
    setSelectedNurseId(id);
    setActiveTab('nurse-detail');
  };

  const userRoleText = currentUser?.role === 'nurse' 
    ? 'Lic. Elena Gómez (Enfermera)' 
    : 'Familia Ramírez Gómez (Cliente)';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-indigo-100" id="main-layout-root">
      
      {/* Top Banner Notice - Sandbox and SQL Sync info */}
      <div className="bg-slate-900 border-b border-indigo-950 px-4 py-2 block text-center text-[11px] leading-relaxed font-bold tracking-tight text-slate-350">
        📌 <span className="text-white">Proof of Concept Interactivo</span> con datos locales persistentes en tu navegador. <span className="text-indigo-400">¿Listo para desplegar a Supabase?</span> Copia el script SQL de migración en la última pestaña.
      </div>

      {/* Main Premium Navbar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40" id="main-header">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          
          {/* Brand/Product Logo */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => { setSelectedNurseId(null); setActiveTab('home'); }}>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center transform hover:scale-105 transition-all duration-200 border border-indigo-750 shadow-sm">
              <div className="w-4.5 h-4.5 border border-white rounded-full flex items-center justify-center">
                <Stethoscope className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold font-serif italic tracking-tight text-slate-900">LocalNurse</span>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] uppercase font-extrabold tracking-widest px-2 py-0.5 rounded-full border border-indigo-100">
                  PoC v1.2
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Cuidado del Adulto Mayor</p>
            </div>
          </div>

          {/* Navigation Control Buttons */}
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs">
            <button
              onClick={() => { setSelectedNurseId(null); setActiveTab('home'); }}
              className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'home' || activeTab === 'nurse-detail'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              id="tab-btn-home"
            >
              <Heart className="h-4 w-4" />
              <span>Ver Enfermeras</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'bookings'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              id="tab-btn-bookings"
            >
              <Calendar className="h-4 w-4" />
              <span>Mis Reservas</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              id="tab-btn-chat"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Soporte & Chats</span>
            </button>

            <button
              onClick={() => setActiveTab('clinical-ai')}
              className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'clinical-ai'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              id="tab-btn-clinical-ai"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>Clínico IA</span>
            </button>

            {currentUser?.role === 'nurse' && (
              <button
                onClick={() => setActiveTab('nurse-profile-edit')}
                className={`px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'nurse-profile-edit'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                id="tab-btn-nurse-edit"
              >
                <Network className="h-4 w-4" />
                <span>Configurar mi Perfil</span>
              </button>
            )}

          </nav>

          {/* Actor Role Simulation Switcher badge */}
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 shadow-inner px-3 py-1.5 rounded-2xl w-fit self-end sm:self-auto shrink-0">
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-450 block">Probando como:</span>
              <span className="text-xs font-extrabold text-slate-800 leading-none">{userRoleText}</span>
            </div>
            <button
              onClick={() => switchUserRole(currentUser?.role === 'user' ? 'nurse' : 'user')}
              className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-xl border border-indigo-200 transition cursor-pointer shrink-0 uppercase tracking-wider"
              id="btn-switch-role"
            >
              Alternar Rol
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6" id="main-content-layout">
        
        {/* Dynamic active view routing switch */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            {/* Elegant Hero card intro */}
            <div className="bg-slate-900 border border-slate-200/20 rounded-3xl p-6 md:p-8 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 subtle-dot-grid">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none">
                <div className="absolute top-10 right-10 h-72 w-72 rounded-full border border-white" />
                <div className="absolute top-20 right-20 h-72 w-72 rounded-full border-4 border-dashed border-indigo-500 animate-spin-slow" />
              </div>

              <div className="space-y-3 z-10">
                <div className="inline-flex items-center gap-1.5 bg-indigo-600/35 border border-indigo-500/30 px-3.5 py-1.5 rounded-full text-indigo-200 font-bold tracking-wider text-[10px] uppercase">
                  <Sparkles className="h-3.5 w-3.5" />
                  Atención Profesional y Humana
                </div>
                <h1 className="text-3xl md:text-4xl font-serif italic tracking-tight font-normal">
                  Cuidado de calidad en tu hogar.
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed font-normal max-w-2xl">
                  Encuentra cuidadores geriátricos profesionales de absoluta confianza. Personal filtrado bajo controles rigurosos de experiencia y ubicación geográfica para atender a tus seres queridos.
                </p>
              </div>

              <div className="bg-slate-950/45 border border-slate-800 p-5 rounded-2xl md:max-w-xs shrink-0 backdrop-blur-sm z-10 flex flex-col justify-between">
                <div className="flex gap-3 mb-3">
                  <div className="py-2.5 px-3 bg-slate-900/50 rounded-xl text-center flex-1 border border-slate-800">
                    <span className="text-lg font-bold block text-indigo-400 font-serif italic">5</span>
                    <span className="text-[9px] uppercase text-slate-400 font-bold">Candidatos</span>
                  </div>
                  <div className="py-2.5 px-3 bg-slate-900/50 rounded-xl text-center flex-1 border border-slate-800">
                    <span className="text-lg font-bold block text-indigo-400 font-serif italic">El Salvador</span>
                    <span className="text-[9px] uppercase text-slate-400 font-bold">Cobertura</span>
                  </div>
                </div>
                <p className="text-[10px] text-justify text-slate-400 leading-normal mb-1 font-medium">
                  *Todos los enfermeros inscritos en el PoC cuentan con cédula profesional certificada bajo normativas oficiales de salud.
                </p>
              </div>
            </div>

            {/* Daily Care Advice Section */}
            <CareAdvice />

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
                  <span className="text-[10px] text-slate-400 font-medium">Actualizado hace unos instantes</span>
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
                      const profile = profiles.find(p => p.id === nurse.user_id);
                      if (!profile) return null;

                      const isSelected = selectedNurseId === nurse.id;

                      return (
                        <div
                          key={nurse.id}
                          onClick={() => handleNurseClick(nurse.id)}
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
                            />
                            <div className="absolute -bottom-2 -left-1 -right-1 bg-amber-50 rounded-full border border-amber-250 py-0.5 px-1.5 text-center flex items-center justify-center gap-0.5 shadow-sm">
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
                              </div>
                              <div className="text-slate-800 text-right shrink-0">
                                <span className="text-indigo-600 font-black text-lg block">US$ {nurse.hourly_rate}<span className="text-xs font-normal text-slate-400">/hr</span></span>
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
                  maxRate={maxRate}
                  selectedSpecialization={selectedSpecialization}
                />
              </div>

            </div>

          </div>
        )}

        {activeTab === 'nurse-detail' && (
          <NurseDetail />
        )}

        {activeTab === 'bookings' && (
          <BookingsManager />
        )}

        {activeTab === 'chat' && (
          <ChatRoom />
        )}

        {activeTab === 'clinical-ai' && (
          <ClinicalAI />
        )}

        {activeTab === 'nurse-profile-edit' && (
          <NurseProfileEdit />
        )}


      </main>

      {/* Structured Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-10 mt-12 shrink-0" id="main-footer">
        <div className="max-w-7xl mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                <Stethoscope className="h-4 w-4" />
              </div>
              <span className="text-white font-extrabold text-lg tracking-tight">LocalNurse Marketplace</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              La plataforma PoC definitiva para conectar familias con enfermeros geriátricos con total trazabilidad de agendas, tarifas dinámicas e integraciones seguras de bases de datos.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <h4 className="font-extrabold text-white text-xs uppercase tracking-widest text-[#a5b4fc] mb-1">Tecnologías Demostradas</h4>
            <p>• React 19 + Vite (Arquitectura SPA)</p>
            <p>• Supabase DB PostgreSQL Schema & RLS Security</p>
            <p>• Interactive Vector Coordinates Map Engine</p>
            <p>• TailwindCSS v4 Custom Stylings & Lucide icons</p>
          </div>

          <div className="space-y-3 text-xs leading-relaxed">
            <h4 className="font-extrabold text-white text-xs uppercase tracking-widest text-[#a5b4fc] mb-1">Controles del Simulador</h4>
            <p className="text-slate-400 font-normal">
              Usa el botón <strong className="text-indigo-400 bg-indigo-950/50 px-1 py-0.5 rounded border border-indigo-900/60 font-bold">Alternar Rol</strong> en el menú superior para intercambiar la perspectiva entre el familiar que busca apoyo y la enfermera (quien puede aprobar la visita).
            </p>
          </div>

        </div>
        <div className="max-w-7xl mx-auto px-4 md:px-6 border-t border-slate-800/80 pt-6 mt-8 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 gap-4">
          <p>© 2026 LocalNurse Inc. Todos los derechos reservados.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:underline">Políticas de Privacidad</a>
            <a href="#" className="hover:underline">Términos del Servicio</a>
            <a href="#" className="hover:underline">Soporte Médico</a>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default function App() {
  return (
    <AppContextProvider>
      <MarketplaceApp />
    </AppContextProvider>
  );
}
