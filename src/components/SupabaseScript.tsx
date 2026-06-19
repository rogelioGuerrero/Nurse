/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Copy, Check, Database, ShieldAlert, Zap, Layers } from 'lucide-react';

export const SupabaseScript: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const sqlScript = `-- ---------------------------------------------------------------------
-- LOCALNURSE DATABASE SCHEMA - SUPABASE POSTGRESQL MIGRATION
-- ---------------------------------------------------------------------

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS DEFINITIONS
CREATE TYPE user_role AS ENUM ('user', 'nurse', 'admin');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

-- 3. PROFILES TABLE (Extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  location_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. NURSES TABLE
CREATE TABLE IF NOT EXISTS public.nurses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  specialization TEXT[] NOT NULL DEFAULT '{}',
  hourly_rate NUMERIC(10, 2) NOT NULL CHECK (hourly_rate > 0),
  coverage_radius INT NOT NULL DEFAULT 5 CHECK (coverage_radius > 0),
  availability TEXT NOT NULL,
  rating NUMERIC(3, 2) DEFAULT 5.0 CHECK (rating >= 1.0 AND rating <= 5.0),
  review_count INT DEFAULT 0 CHECK (review_count >= 0),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  bio TEXT NOT NULL,
  experience_years INT NOT NULL DEFAULT 0,
  certifications TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. CHAT ROOMS
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.nurses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, nurse_id)
);

-- 6. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.nurses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  hours NUMERIC(4, 2) NOT NULL CHECK (hours > 0),
  status booking_status NOT NULL DEFAULT 'pending',
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
  notes TEXT,
  patient_name TEXT NOT NULL,
  patient_condition TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Allow public read access to profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Allow users to update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Nurses policies
CREATE POLICY "Allow public read access to nurses list" ON public.nurses
  FOR SELECT USING (true);

CREATE POLICY "Allow nurses to update own nurse data" ON public.nurses
  FOR UPDATE USING (auth.uid() = user_id);

-- Bookings policies
CREATE POLICY "Users can view their own bookings" ON public.bookings
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = (SELECT user_id FROM public.nurses WHERE id = bookings.nurse_id)
  );

CREATE POLICY "Users can create bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update booking status" ON public.bookings
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    auth.uid() = (SELECT user_id FROM public.nurses WHERE id = bookings.nurse_id)
  );

-- Chat room & Messages policies
CREATE POLICY "View own chat rooms" ON public.chat_rooms
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = (SELECT user_id FROM public.nurses WHERE id = chat_rooms.nurse_id)
  );

CREATE POLICY "View chat room messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_rooms CR 
      WHERE CR.id = messages.chat_room_id AND (
        CR.user_id = auth.uid() OR 
        CR.nurse_id = (SELECT id FROM public.nurses WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Insert messages in own rooms" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.chat_rooms CR 
      WHERE CR.id = chat_room_id AND (
        CR.user_id = auth.uid() OR 
        CR.nurse_id = (SELECT id FROM public.nurses WHERE user_id = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------
-- AUTOMATIC PROFILE CREATION ON SIGNUP (SUPABASE TRIGGER)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'),
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'user'::user_role),
    COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-xl overflow-hidden" id="supabase-script-container">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-medium text-sm tracking-wider uppercase mb-1">
            <Layers className="h-4 w-4" />
            <span>Infraestructura & Base de Datos</span>
          </div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Database className="h-6 w-6 text-indigo-500" />
            Supabase Schema DDL
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Este script SQL automatiza el aprovisionamiento de las bases de datos en Postgres. Crea todas las relaciones, tipos de enumeraciones e integra triggers para que se sincronicen automáticamente los perfiles al registrarse en el sistema de Supabase Auth.
          </p>
        </div>
        <button
          onClick={copyToClipboard}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-xl transition cursor-pointer text-sm"
          id="btn-copy-sql"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-emerald-300" />
              <span>¡Copiado de memoria!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>Copiar Script SQL</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h4 className="font-semibold text-sm text-slate-200">Trigger Automático</h4>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Escucha la tabla interna <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded text-[10px]">auth.users</code> y clona automáticamente los datos demográficos en la tabla pública <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded text-[10px]">profiles</code> con el rol y avatar por defecto.
          </p>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-indigo-400" />
            <h4 className="font-semibold text-sm text-slate-200">Row Level Security (RLS)</h4>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Políticas estrictas que aseguran que las familias solo accedan a sus propias correspondencias y reservas, y prohíbe que extraños alteren las tarifas o los calendarios de los enfermeros.
          </p>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-teal-400" />
            <h4 className="font-semibold text-sm text-slate-200">Integridad Referencial</h4>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Establece llaves foráneas con eliminaciones en cascada (<code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded text-[10px]">ON DELETE CASCADE</code>) protegiendo el almacenamiento de registros huérfanos si se da de baja un usuario.
          </p>
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-slate-800">
        <div className="absolute top-3 right-3 bg-slate-800 text-[10px] uppercase tracking-wider font-semibold text-slate-400 px-2 py-1 rounded">
          PostgreSQL
        </div>
        <pre className="text-[11px] font-mono leading-relaxed bg-slate-950 p-5 overflow-x-auto text-indigo-200 h-96 select-all scrollbar-thin scrollbar-thumb-slate-800">
          {sqlScript}
        </pre>
      </div>

      <div className="mt-5 p-4 rounded-xl bg-indigo-950/30 border border-indigo-900/40 text-xs text-indigo-300 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-indigo-400" />
        <div>
          <p className="font-semibold text-white">Instrucciones de Despliegue en Supabase:</p>
          <ol className="list-decimal list-inside mt-1.5 space-y-1 text-slate-300">
            <li>Crea un proyecto gratis en <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline text-indigo-400 font-medium hover:text-indigo-300">supabase.com</a>.</li>
            <li>Ingresa a la sección de tu panel llamada <strong>SQL Editor</strong>.</li>
            <li>Crea una nueva consulta vacía, pega el script de arriba y presiona <strong>Run</strong>.</li>
            <li>¡Listo! Tu base de datos y políticas de seguridad RLS estarán robustamente creadas en segundos.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
