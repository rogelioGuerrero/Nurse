/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Set Groq API key from environment variable or localStorage
export function configureGroqAPIKey() {
  const apiKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
  if (apiKey) {
    localStorage.setItem('groq_api_key', apiKey);
    console.log('Groq API key configured from environment variable');
  }
}

// Get Groq API key from localStorage
export function getGroqAPIKey(): string | null {
  return localStorage.getItem('groq_api_key');
}

// Auto-configure on import (for development)
if (typeof window !== 'undefined' && (import.meta as any).env?.VITE_GROQ_API_KEY && !localStorage.getItem('groq_api_key')) {
  configureGroqAPIKey();
}
