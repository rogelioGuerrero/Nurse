/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FC } from 'react';
import { Search, HeartPulse } from 'lucide-react';

interface SearchFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedSpecialization: string;
  setSelectedSpecialization: (spec: string) => void;
  maxRate: number;
  setMaxRate: (rate: number) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  allSpecializations: string[];
}

export const SearchFilters: FC<SearchFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  selectedSpecialization,
  setSelectedSpecialization,
  maxRate,
  setMaxRate,
  sortBy,
  setSortBy,
  allSpecializations
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5" id="search-filters-container">
      
      {/* Primary Query Row */}
      <div className="relative">
        <span className="absolute inset-y-0 left-4 flex items-center text-slate-400">
          <Search className="h-4.5 w-4.5" />
        </span>
        <input
          type="text"
          placeholder="Buscar cuidador por nombre, bio o certificaciones..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-slate-50 hover:bg-slate-50/70 focus:bg-white text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-150 outline-none"
          id="query-text-search"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* Specialty Filter */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Especialidades Médicas
          </label>
          <div className="relative">
            <select
              value={selectedSpecialization}
              onChange={(e) => setSelectedSpecialization(e.target.value)}
              className="w-full text-slate-700 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-indigo-500 cursor-pointer outline-none transition"
              id="select-specialization"
            >
              <option value="">Todas las especialidades ({allSpecializations.length})</option>
              {allSpecializations.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Rate Filter */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Tarifa Máxima por Hora
            </label>
            <span className="text-xs font-bold text-indigo-600">US$ {maxRate}/hr</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400 font-semibold">US$ 5</span>
            <input
              type="range"
              min="5"
              max="40"
              step="1"
              value={maxRate}
              onChange={(e) => setMaxRate(Number(e.target.value))}
              className="flex-1 accent-indigo-600 cursor-pointer h-1.5"
              id="slider-filter-maxrate"
            />
            <span className="text-[10px] text-slate-400 font-semibold">US$ 40</span>
          </div>
        </div>

        {/* Sorting selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Ordenar Resultados
          </label>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full text-slate-700 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-indigo-500 cursor-pointer outline-none transition"
              id="select-sorting"
            >
              <option value="distance">Mas cercana primero (km)</option>
              <option value="rating">Mejor Calificacion</option>
              <option value="rate-asc">Precio mas bajo ($)</option>
              <option value="rate-desc">Precio mas alto ($$$)</option>
              <option value="experience">Anios de trayectoria</option>
            </select>
          </div>
        </div>

      </div>

      {/* Suggested Tags Quick Select */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
          <HeartPulse className="h-3 w-3 text-indigo-500" />
          Filtros Rápidos:
        </span>
        <button
          onClick={() => setSelectedSpecialization('')}
          className={`text-xs font-medium px-3 py-1 rounded-full border transition cursor-pointer ${
            selectedSpecialization === ''
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
          id="tag-quick-all"
        >
          Todo
        </button>
        {allSpecializations.slice(0, 5).map((spec) => (
          <button
            key={spec}
            onClick={() => setSelectedSpecialization(spec)}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition cursor-pointer ${
              selectedSpecialization === spec
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            id={`tag-quick-${spec}`}
          >
            {spec}
          </button>
        ))}
      </div>
    </div>
  );
};
