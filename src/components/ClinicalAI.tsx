/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from './Toast';
import { groqChat } from '../lib/groq';
import { 
  Sparkles, MessageSquare, Send, BookOpen, AlertTriangle, 
  ChevronRight, Activity
} from 'lucide-react';

export default function ClinicalAI() {
  const { currentUser } = useApp();
  const { showToast } = useToast();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const isNurseView = currentUser?.role === 'nurse';

  const handleQuickQuestion = (q: string) => {
    setQuestion(q);
    handleAskQuestion(q);
  };

  const handleAskQuestion = async (customQ?: string) => {
    const qToSend = customQ || question;
    if (!qToSend.trim()) return;

    setLoading(true);
    setResponse('');

    const systemPrompt = isNurseView 
      ? 'Eres un consultor clínico geriatra y farmacólogo de El Salvador de altísima trayectoria. Proporcionas directrices de enfermería clínica, protocolos de prevención, dosificaciones, cuidados paliativos o de rehabilitación de alta precisión técnica, basándote en estándares de la OMS y el Consejo Superior de Salud Pública (CSSP). Sé formal, sumamente técnico, utiliza terminología de enfermería y destaca los riesgos clínicos.'
      : 'Eres un enfermero familiar geriátrico sumamente empático y experto de El Salvador. Ayudas a familiares de adultos mayores con consejos prácticos para el cuidado diario en el hogar (nutrición, prevención de caídas, agitación cognitiva, higiene). Responde con calidez, lenguaje claro y no técnico, pero con rigor de seguridad médica. Siempre aconseja consultar con un profesional ante cualquier signo de alerta.';

    try {
      const content = await groqChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: qToSend }
        ],
        { temperature: 0.6, maxTokens: 600 }
      );
      setResponse(content);
      showToast('Respuesta generada correctamente', 'success');
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_API_KEY') {
        setResponse('El asistente clínico no está disponible en este momento. Contacta al administrador.');
        showToast('Clave de IA no configurada. Contacta al administrador.', 'error');
      } else {
        setResponse('No se pudo conectar con el asistente clínico. Intenta nuevamente en unos momentos.');
        showToast('Error al conectar con el asistente de IA', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const nurseSuggestions = [
    {
      title: 'Manejo de Escaras Grado II',
      desc: 'Protocolo de curación aséptica y frecuencia de alivio por presión.',
      prompt: 'Proporciona el protocolo clínico detallado de enfermería geriátrica para el tratamiento y curación de una úlcera por presión (escala de escaras) grado II en el talón de un paciente postrado.'
    },
    {
      title: 'Crisis de Agitación Cognitiva',
      desc: 'Medidas no farmacológicas de contención conductual ante Alzheimer.',
      prompt: '¿Cuáles son las directrices de contención no farmacológica y de desescalada de conducta recomendadas para enfermeros cuando un paciente geriátrico con demencia de Alzheimer presenta una crisis de agitación psicomotora por el síndrome del ocaso?'
    },
    {
      title: 'Cálculo de Terapia de Infusión',
      desc: 'Fórmulas de cálculo de goteo para hidratación subcutánea/IV.',
      prompt: 'Explica detalladamente la fórmula de goteo de infusión intravenosa para administrar 1000ml de solución salina al 0.9% en un lapso de 12 horas en un paciente geriátrico con insuficiencia cardíaca compensada.'
    }
  ];

  const familySuggestions = [
    {
      title: 'Mi Abuelo no quiere Comer/Beber',
      desc: 'Tácticas caseras de hidratación y deglución segura.',
      prompt: 'Mi abuelo de 84 años está decaído y se niega a tomar agua o comer. ¿Qué métodos prácticos de hidratación oral segura y alimentos estimulantes de fácil deglución puedo ofrecerle en casa?'
    },
    {
      title: 'Prevención de Caídas en el Baño',
      desc: 'Acondicionamiento y traslados de apoyo para el aseo.',
      prompt: 'Quiero adaptar el cuarto de baño para mi madre de 79 años con artrosis. ¿Cuáles son las medidas clave de seguridad física, barandales y técnicas de apoyo para el traslado seguro de la ducha a la taza?'
    },
    {
      title: 'Estimulación Cognitiva Semanal',
      desc: 'Actividades mentales para retrasar deterioro cognitivo.',
      prompt: '¿Qué actividades diarias de estimulación cognitiva puedo realizar con mi abuelito con pérdida de memoria leve para mantenerlo activo mentalmente sin que se frustre?'
    }
  ];

  const suggestions = isNurseView ? nurseSuggestions : familySuggestions;

  return (
    <div className="space-y-6 animate-fade-in" id="clinical-ai-container">
      
      {/* Premium Hero Title */}
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-md">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-indigo-600/35 border border-indigo-500/30 px-3.5 py-1.5 rounded-full text-indigo-200 font-bold tracking-wider text-[10px] uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            Apoyo Clínico por Inteligencia Artificial
          </div>
          <h2 className="text-3xl font-bold font-serif italic">
            Asistente Clínico Llama-3 Geriátrico
          </h2>
          <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">
            {isNurseView 
              ? 'Tu copiloto clínico de consulta científica rápida. Resuelve dudas de protocolos de enfermería, dosificaciones e interacciones médicas geriátricas al instante.'
              : 'Asesoramiento experto para el cuidado de tus abuelitos en casa. Aprende de nutrición gerontológica, ejercicios cognitivos y seguridad física diaria de la mano de nuestra IA clínica.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Quick Sugggestions */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-500 px-1">
            <BookOpen className="h-4.5 w-4.5" />
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Casos Clínicos Frecuentes</h4>
          </div>

          <div className="space-y-3">
            {suggestions.map((s, idx) => (
              <div 
                key={idx}
                onClick={() => handleQuickQuestion(s.prompt)}
                className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-2xl p-4 cursor-pointer transition shadow-sm group"
                id={`ai-suggestion-${idx}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition">{s.title}</h5>
                    <p className="text-[11px] text-slate-400 mt-1 leading-normal font-medium">{s.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all mt-0.5" />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50/70 border border-amber-200/20 rounded-2xl p-4 space-y-2 text-[11px] text-amber-900 leading-normal font-medium">
            <div className="flex items-center gap-1.5 font-bold text-amber-950 uppercase tracking-wider text-[10px]">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>Aviso Regulatorio de Salud</span>
            </div>
            <p>
              El Asistente Clínico de IA de LocalNurse es una herramienta de consulta de segunda opinión clínica que recopila información científica pública. No sustituye las recetas médicas dadas por su centro hospitalario o médico de cabecera en El Salvador.
            </p>
          </div>
        </div>

        {/* Right Column: Chat interface */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <MessageSquare className="h-5 w-5 text-indigo-500" />
            <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Haz una pregunta clínica personalizada</h4>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <textarea 
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={isNurseView 
                  ? "Ej: ¿Cuáles son las contraindicaciones de la indometacina en un adulto de 85 años con disfunción renal?" 
                  : "Ej: ¿Qué comidas saludables son recomendadas para mi abuela que tiene disfagia y diabetes leve?"}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 focus:bg-white focus:border-indigo-500 transition resize-none leading-relaxed"
                id="textarea-ai-question"
              />
              <button 
                onClick={() => handleAskQuestion()}
                disabled={loading || !question.trim()}
                className="absolute right-3.5 bottom-3.5 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-xl transition disabled:opacity-40 cursor-pointer shadow"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            {/* Response Box */}
            {(loading || response) && (
              <div className="bg-indigo-50/20 border border-indigo-100/40 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-600 animate-pulse" />
                  <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider block">Respuesta Asistente Clínico Llama-3</span>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2.5 text-xs text-indigo-600 font-bold py-4">
                    <div className="w-4.5 h-4.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Llama-3 formulando recomendación médica profesional...</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium bg-white p-3.5 rounded-xl border border-white">
                    {response}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
