/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Profile, Nurse, ShiftType, WeekDay } from '../types';

export const INITIAL_PROFILES: Profile[] = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'elena.gomez@biencuidar.com',
    role: 'nurse',
    full_name: 'Lic. Elena Gómez',
    avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
    phone: '+503 2222 1234',
    location_name: 'San Salvador',
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carlos.mendoza@biencuidar.com',
    role: 'nurse',
    full_name: 'Enf. Carlos Mendoza',
    avatar_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=200',
    phone: '+503 2222 5678',
    location_name: 'Santa Ana',
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'sofia.rodriguez@biencuidar.com',
    role: 'nurse',
    full_name: 'Mtra. Sofía Rodríguez',
    avatar_url: 'https://images.unsplash.com/photo-1594824813573-246434de83fb?auto=format&fit=crop&q=80&w=200',
    phone: '+503 2222 9012',
    location_name: 'San Miguel',
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'miguel.angel@biencuidar.com',
    role: 'nurse',
    full_name: 'Enf. Miguel Ángel Ramos',
    avatar_url: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=200',
    phone: '+503 2222 3456',
    location_name: 'Santa Tecla',
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    email: 'isabel.castro@biencuidar.com',
    role: 'nurse',
    full_name: 'Dra. Isabel Castro',
    avatar_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=200',
    phone: '+503 2222 7890',
    location_name: 'San Salvador',
    updated_at: new Date().toISOString(),
  },
];

export const INITIAL_NURSES: Nurse[] = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    user_id: '00000000-0000-0000-0000-000000000002',
    specialization: ['Geriatría', 'Demencia y Alzheimer', 'Inyecciones'],
    shift_rate: 25,
    coverage_radius: 8,
    available_shifts: ['morning', 'afternoon'] as ShiftType[],
    available_days: [1, 2, 3, 4, 5] as WeekDay[],
    rating: 4.9,
    review_count: 24,
    lat: 13.6929,
    lng: -89.2182,
    bio: 'Enfermera licenciada con más de 8 años de experiencia especializada exclusivamente en el cuidado del adulto mayor con trastornos cognitivos como Alzheimer. Ofrezco terapia ocupacional básica, administración precisa de medicamentos y acompañamiento cognitivo.',
    experience_years: 8,
    certifications: [
      'Licenciatura en Enfermería',
      'Diplomado en Cuidado Integral del Adulto Mayor',
      'Certificación internacional de atención en Alzheimer y Demencias'
    ],
    cssp_registration: 'CSSP-ENF-2016-0142',
    cssp_level: 'Licenciada'
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    user_id: '00000000-0000-0000-0000-000000000003',
    specialization: ['Postoperatorio', 'Curaciones complejas', 'Fisioterapia Básica'],
    shift_rate: 30,
    coverage_radius: 5,
    available_shifts: ['night'] as ShiftType[],
    available_days: [1, 2, 3, 4, 5, 6] as WeekDay[],
    rating: 4.8,
    review_count: 18,
    lat: 13.9919,
    lng: -89.5561,
    bio: 'Especialista en curaciones de heridas posquirúrgicas, movilización de pacientes con movilidad reducida y rehabilitación física básica tras fracturas. Comprometido con la comodidad, seguridad y el trato empático y respetuoso del adulto mayor.',
    experience_years: 6,
    certifications: [
      'Técnico Superior Universitario en Enfermería',
      'Certificación avalada en Soporte Vital Avanzado (ACLS)',
      'Especialista en Cuidados Críticos y Terapia de Infusión'
    ],
    cssp_registration: 'CSSP-ENF-2018-0387',
    cssp_level: 'Técnica'
  },
  {
    id: '00000000-0000-0000-0000-000000000013',
    user_id: '00000000-0000-0000-0000-000000000004',
    specialization: ['Geriatría', 'Manejo de Sondas', 'Cuidados Paliativos'],
    shift_rate: 35,
    coverage_radius: 12,
    available_shifts: ['morning', 'afternoon', 'night'] as ShiftType[],
    available_days: [0, 6] as WeekDay[],
    rating: 5.0,
    review_count: 32,
    lat: 13.4833,
    lng: -88.1833,
    bio: 'Maestría en Tanatología y enfermería paliativa avanzada. Ofrezco acompañamiento cálido y control del dolor para pacientes con enfermedades en etapas avanzadas, manejo e instalación de sondas enterales, vesicales y asistencia nutricional de alta precisión.',
    experience_years: 12,
    certifications: [
      'Licenciatura en Enfermería y Obstetricia',
      'Maestría en Tanatología y Acompañamiento Emocional',
      'Curso Superior Universitario de Farmacología en Terapia Paliativa'
    ],
    cssp_registration: 'CSSP-ENF-2012-0094',
    cssp_level: 'Licenciada'
  },
  {
    id: '00000000-0000-0000-0000-000000000014',
    user_id: '00000000-0000-0000-0000-000000000005',
    specialization: ['Monitoreo Cardíaco', 'Postoperatorio', 'Control de Diabetes'],
    shift_rate: 32,
    coverage_radius: 6,
    available_shifts: ['morning', 'afternoon', 'night'] as ShiftType[],
    available_days: [1, 2, 3, 4, 5, 6, 0] as WeekDay[],
    rating: 4.7,
    review_count: 15,
    lat: 13.6742,
    lng: -89.2921,
    bio: 'Experiencia en cuidados cardiovasculares crónicos y monitoreo de constantes vitales en pacientes con hipertensión severa o insuficiencia cardíaca. Experto en control riguroso de diabetes (curva de insulina, glucometrías seriadas y nutrición adaptada).',
    experience_years: 5,
    certifications: [
      'Licenciatura y Cédula Profesional Federal de Enfermería',
      'Certificado en Atención Integral al Paciente Diabético',
      'Taller Avanzado en RCP y Primeros Auxilios'
    ],
    cssp_registration: 'CSSP-ENF-2019-0521',
    cssp_level: 'Tecnóloga'
  },
  {
    id: '00000000-0000-0000-0000-000000000015',
    user_id: '00000000-0000-0000-0000-000000000006',
    specialization: ['Geriatría', 'Nutrición asistida', 'Demencia y Alzheimer'],
    shift_rate: 28,
    coverage_radius: 10,
    available_shifts: ['morning'] as ShiftType[],
    available_days: [1, 2, 3, 4, 5] as WeekDay[],
    rating: 4.9,
    review_count: 40,
    lat: 13.6929,
    lng: -89.2182,
    bio: 'Médico graduada reconvertida con pasión al cuidado directo de enfermería gerontológica personalizada. Combino sólida comprensión clínica con una inigualable calidad humana para estructurar planes diarios de caminatas, estimulación mental y hábitos de vida saludables.',
    experience_years: 15,
    certifications: [
      'Título Profesional en Medicina y Enfermería',
      'Especialidad Certificada en Nutrición Clínica del Adulto Mayor',
      'Registro y Cédula del Consejo de Gerontología'
    ],
    cssp_registration: 'CSSP-ENF-2009-0078',
    cssp_level: 'Licenciada'
  }
];
