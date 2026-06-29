import { useRef, useCallback, useState } from 'react';
import { supabaseUrl, supabaseAnonKey } from '../lib/supabase';

interface UseWhisperSTTOptions {
  onTranscript: (text: string) => void;
  onSilence?: () => void;
  silenceThresholdMs?: number;
}

interface UseWhisperSTTReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  hasMicrophone: boolean;
  error: string | null;
}

/**
 * Hook para grabar audio del micrófono y transcribirlo con Groq Whisper.
 * Usa MediaRecorder (funciona en todos los navegadores modernos).
 * Incluye detección de silencio para parar automáticamente.
 */
export function useWhisperSTT({
  onTranscript,
  onSilence,
  silenceThresholdMs = 3000,
}: UseWhisperSTTOptions): UseWhisperSTTReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSoundRef = useRef<number>(Date.now());
  const isRecordingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onSilenceRef = useRef(onSilence);

  // Keep refs updated without re-creating callbacks
  onTranscriptRef.current = onTranscript;
  onSilenceRef.current = onSilence;

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError(null);
    try {
      // Convert blob to file with proper extension
      const mimeType = audioBlob.type || 'audio/webm';
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([audioBlob], `audio.${ext}`, { type: mimeType });

      const formData = new FormData();
      formData.append('audio', file);

      const res = await fetch(`${supabaseUrl}/functions/v1/stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = (data.text || '').trim();

      if (text) {
        onTranscriptRef.current(text);
      }
    } catch (err) {
      console.error('[useWhisperSTT] Transcription error:', err);
      setError(err instanceof Error ? err.message : 'Error de transcripción');
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasMicrophone(true);

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
          try { audioContextRef.current.close(); } catch {}
          audioContextRef.current = null;
        }

        // Transcribe if we have audio
        const chunks = audioChunksRef.current;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          // Only transcribe if recording was long enough (at least 500ms of audio)
          if (blob.size > 1000) {
            transcribeAudio(blob);
          }
        }
        audioChunksRef.current = [];
      };

      // Set up audio analysis for silence detection
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      lastSoundRef.current = Date.now();

      silenceTimerRef.current = setInterval(() => {
        if (!isRecordingRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        // Calculate average volume
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > 10) {
          // Sound detected
          lastSoundRef.current = Date.now();
        } else {
          // Silence — check if threshold exceeded
          const silenceDuration = Date.now() - lastSoundRef.current;
          if (silenceDuration >= silenceThresholdMs) {
            stopRecording();
            if (onSilenceRef.current) {
              onSilenceRef.current();
            }
          }
        }
      }, 200);

      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      console.error('[useWhisperSTT] Microphone error:', err);
      setHasMicrophone(false);
      setError('No se pudo acceder al micrófono');
    }
  }, [silenceThresholdMs, stopRecording, transcribeAudio]);

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    hasMicrophone,
    error,
  };
}
