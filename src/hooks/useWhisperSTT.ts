import { useRef, useCallback, useState } from 'react';
import { supabaseUrl, supabaseAnonKey } from '../lib/supabase';

interface UseWhisperSTTOptions {
  onTranscript: (text: string) => void;
  onSilence?: () => void;
  silenceThresholdMs?: number;
  minRecordingMs?: number;
  maxRecordingMs?: number;
  prompt?: string;
}

interface UseWhisperSTTReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  hasMicrophone: boolean;
  error: string | null;
  retryCount: number;
}

const TRANSCRIBE_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const DEFAULT_MIN_RECORDING_MS = 800;
const DEFAULT_MAX_RECORDING_MS = 30_000;

/**
 * Hook para grabar audio del micrófono y transcribirlo con Groq Whisper.
 * Usa MediaRecorder (funciona en todos los navegadores modernos).
 * Incluye detección de silencio, timeout, retry y bitrate bajo para LAC.
 */
export function useWhisperSTT({
  onTranscript,
  onSilence,
  silenceThresholdMs = 3000,
  minRecordingMs = DEFAULT_MIN_RECORDING_MS,
  maxRecordingMs = DEFAULT_MAX_RECORDING_MS,
  prompt,
}: UseWhisperSTTOptions): UseWhisperSTTReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoundRef = useRef<number>(Date.now());
  const recordingStartRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onSilenceRef = useRef(onSilence);
  const promptRef = useRef(prompt);

  // Keep refs updated without re-creating callbacks
  onTranscriptRef.current = onTranscript;
  onSilenceRef.current = onSilence;
  promptRef.current = prompt;

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('[useWhisperSTT] mediaRecorder.stop() error:', e);
      }
    }
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob, attempt: number = 0) => {
    setIsTranscribing(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

    try {
      const mimeType = audioBlob.type || 'audio/webm';
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([audioBlob], `audio.${ext}`, { type: mimeType });

      const formData = new FormData();
      formData.append('audio', file);
      if (promptRef.current) {
        formData.append('prompt', promptRef.current);
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = (data.text || '').trim();

      if (text) {
        setRetryCount(0);
        onTranscriptRef.current(text);
      } else {
        throw new Error('Transcripción vacía');
      }
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        console.warn(`[useWhisperSTT] Transcription timeout (attempt ${attempt + 1})`);
      } else {
        console.error(`[useWhisperSTT] Transcription error (attempt ${attempt + 1}):`, err);
      }

      if (attempt < MAX_RETRIES) {
        setRetryCount(attempt + 1);
        const backoff = 500 * (attempt + 1);
        setTimeout(() => {
          transcribeAudio(audioBlob, attempt + 1);
        }, backoff);
      } else {
        setRetryCount(0);
        const errMsg = err instanceof Error ? err.message : 'Error de transcripción';
        setError(errMsg);
        setIsTranscribing(false);
      }
    } finally {
      if (controller.signal.aborted === false) {
        clearTimeout(timeoutId);
      }
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setRetryCount(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;
      setHasMicrophone(true);

      // Set up MediaRecorder with low bitrate for faster uploads
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : '';

      const recorderOptions: MediaRecorderOptions = {};
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      // Low bitrate: 16kHz mono = small files, faster upload on slow networks
      try {
        recorderOptions.audioBitsPerSecond = 16000;
      } catch {}

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
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
          if (blob.size > 500) {
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
      recordingStartRef.current = Date.now();
      lastSoundRef.current = Date.now();

      silenceTimerRef.current = setInterval(() => {
        if (!isRecordingRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        // Calculate average volume
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > 20) {
          // Sound detected (threshold 20 to filter background noise)
          lastSoundRef.current = Date.now();
        } else {
          // Silence — check if threshold exceeded AND minimum recording time passed
          const silenceDuration = Date.now() - lastSoundRef.current;
          const totalRecording = Date.now() - recordingStartRef.current;
          if (silenceDuration >= silenceThresholdMs && totalRecording >= minRecordingMs) {
            stopRecording();
            if (onSilenceRef.current) {
              onSilenceRef.current();
            }
          }
        }
      }, 200);

      // Safety: stop recording after maxRecordingMs
      maxRecordingTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.warn(`[useWhisperSTT] Max recording time (${maxRecordingMs}ms) reached, stopping`);
          stopRecording();
          if (onSilenceRef.current) {
            onSilenceRef.current();
          }
        }
      }, maxRecordingMs);

      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      console.error('[useWhisperSTT] Microphone error:', err);
      setHasMicrophone(false);
      setError('No se pudo acceder al micrófono');
    }
  }, [silenceThresholdMs, minRecordingMs, maxRecordingMs, stopRecording, transcribeAudio]);

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    hasMicrophone,
    error,
    retryCount,
  };
}
