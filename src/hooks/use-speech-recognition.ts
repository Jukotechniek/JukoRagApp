import { useState, useEffect, useRef, useCallback } from 'react';

// TypeScript types for Web Speech API
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface UseSpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    language = 'nl-NL',
    continuous = false,
    interimResults = true,
    onResult,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isInitializedRef = useRef(false);

  // Check browser support
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionConstructor) {
      setIsSupported(true);
      try {
        const recognition = new SpeechRecognitionConstructor() as SpeechRecognition;
        recognition.lang = language;
        recognition.continuous = continuous;
        recognition.interimResults = interimResults;

        // Handle recognition results
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          // Call onResult callback with interim or final transcript
          if (onResult) {
            if (finalTranscript) {
              onResult(finalTranscript.trim(), true);
            } else if (interimTranscript) {
              onResult(interimTranscript.trim(), false);
            }
          }
        };

        // Handle errors
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          let errorMessage = 'Speech recognition error';
          
          switch (event.error) {
            case 'no-speech':
              errorMessage = 'Geen spraak gedetecteerd. Probeer het opnieuw.';
              break;
            case 'aborted':
              // User stopped recognition, not a real error
              return;
            case 'audio-capture':
              errorMessage = 'Microfoon niet gevonden. Controleer uw microfoon instellingen.';
              break;
            case 'network':
              errorMessage = 'Netwerk fout. Controleer uw internetverbinding.';
              break;
            case 'not-allowed':
              errorMessage = 'Microfoon toegang geweigerd. Sta microfoon toegang toe in uw browser instellingen.';
              break;
            case 'service-not-allowed':
              errorMessage = 'Spraakherkenning service niet beschikbaar.';
              break;
            default:
              errorMessage = `Spraakherkenning fout: ${event.error}`;
          }

          setError(errorMessage);
          setIsListening(false);
          
          if (onError) {
            onError(errorMessage);
          }
        };

        // Handle end of recognition
        recognition.onend = () => {
          setIsListening(false);
        };

        // Handle start
        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        recognitionRef.current = recognition;
        isInitializedRef.current = true;
      } catch (err: any) {
        console.error('Error initializing speech recognition:', err);
        setIsSupported(false);
        setError('Spraakherkenning kon niet worden geïnitialiseerd.');
      }
    } else {
      setIsSupported(false);
      setError('Uw browser ondersteunt geen spraakherkenning. Gebruik Chrome of Edge voor deze functionaliteit.');
    }
  }, [language, continuous, interimResults, onResult, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [isListening]);

  const startListening = useCallback(async () => {
    if (!isSupported || !recognitionRef.current) {
      setError('Spraakherkenning wordt niet ondersteund door uw browser.');
      return;
    }

    if (isListening) {
      return;
    }

    // First request microphone permission explicitly using getUserMedia
    // This ensures the browser shows a permission popup if needed
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          // Request microphone permission explicitly
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop the stream immediately - we only needed it for permission
          stream.getTracks().forEach(track => track.stop());
        } catch (mediaError: any) {
          // If permission is denied, show error and return
          if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
            const errorMsg = 'Microfoon toegang geweigerd. Klik op het slotje naast de URL in de adresbalk en sta microfoon toegang toe.';
            setError(errorMsg);
            if (onError) {
              onError(errorMsg);
            }
            return;
          }
          // For other errors, continue - speech recognition might still work
          console.warn('Microfoon permissie check fout:', mediaError);
        }
      }
    } catch (err) {
      // If getUserMedia is not available, continue anyway
      console.warn('getUserMedia niet beschikbaar:', err);
    }

    // Now start speech recognition
    try {
      recognitionRef.current.start();
    } catch (err: any) {
      // If already started, ignore error
      if (err.name !== 'InvalidStateError') {
        const errorMsg = 'Kon spraakherkenning niet starten. Probeer het opnieuw.';
        setError(errorMsg);
        if (onError) {
          onError(errorMsg);
        }
      }
    }
  }, [isSupported, isListening, onError]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) {
      return;
    }

    try {
      recognitionRef.current.stop();
      setIsListening(false);
    } catch (err) {
      // Ignore errors when stopping
    }
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
