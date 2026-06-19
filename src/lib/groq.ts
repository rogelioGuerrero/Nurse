/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    prompt_time: number;
    completion_tokens: number;
    completion_time: number;
    total_tokens: number;
    total_time: number;
  };
}

export interface CareTip {
  title: string;
  content: string;
  category: 'nutrition' | 'safety' | 'wellness' | 'medication' | 'social';
  icon: string;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function generateDailyCareTip(): Promise<CareTip> {
  const apiKey = localStorage.getItem('groq_api_key');
  
  if (!apiKey) {
    throw new Error('Groq API key not configured. Please set it in localStorage with key: groq_api_key');
  }

  const systemPrompt = `Eres un experto en cuidado de adultos mayores y geriatría. Genera un consejo práctico y útil para familiares que cuidan a adultos mayores en casa.
  
Responde en formato JSON con esta estructura:
{
  "title": "Título corto y llamativo (máximo 60 caracteres)",
  "content": "Consejo detallado y práctico (150-200 palabras)",
  "category": "nutrition|safety|wellness|medication|social",
  "icon": "emoji relacionado con el consejo"
}

Categorías disponibles:
- nutrition: alimentación, hidratación, dietas especiales
- safety: prevención de caídas, seguridad en el hogar
- wellness: ejercicio, sueño, salud mental
- medication: administración de medicamentos, recordatorios
- social: compañía, actividades, estimulación cognitiva

Solo devuelve el JSON, sin texto adicional.`;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Genera un consejo práctico de cuidado de adultos mayores para hoy.' }
  ];

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data: GroqResponse = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    const tip: CareTip = JSON.parse(content);
    return tip;
  } catch (error) {
    throw new Error('Failed to parse Groq response');
  }
}

export async function getCachedCareTip(): Promise<CareTip> {
  const cacheKey = 'care_tip_cache';
  const cacheData = localStorage.getItem(cacheKey);
  
  if (cacheData) {
    try {
      const { tip, timestamp } = JSON.parse(cacheData);
      const cacheAge = Date.now() - timestamp;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      if (cacheAge < twentyFourHours) {
        return tip;
      }
    } catch (error) {
      console.error('Error reading cache:', error);
    }
  }
  
  // Generate new tip
  const tip = await generateDailyCareTip();
  
  // Cache for 24 hours
  localStorage.setItem(cacheKey, JSON.stringify({
    tip,
    timestamp: Date.now()
  }));
  
  return tip;
}
