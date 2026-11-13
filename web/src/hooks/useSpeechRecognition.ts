// Hook for Web Speech API SpeechRecognition.
// Supports interim transcripts, error humanization, keyboard shortcut, and auto-cleanup.

import { useState, useEffect, useRef, useCallback } from "react";

// Web Speech API interface declarations
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onFinalResult?: (text: string) => void;
  isSpeaking?: boolean; // prevent listening while agent speaks
}

export function useSpeechRecognition({
  lang = "en-US",
  onFinalResult,
  isSpeaking = false,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  // Feature detection
  const isSupported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      setInterimTranscript("");
    }
  }, []);

  const abortListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      setIsListening(false);
      setInterimTranscript("");
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setErrorMsg("Voice input needs Chrome, Edge or Safari. You can still type.");
      return;
    }
    if (isSpeakingRef.current) {
      // Avoid hearing itself
      return;
    }

    setErrorMsg(null);
    setInterimTranscript("");

    try {
      const SpeechClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechClass) return;

      const recognition = new SpeechClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          setInterimTranscript("");
          setIsListening(false);
          onFinalResultRef.current?.(final.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        setInterimTranscript("");

        switch (event.error) {
          case "not-allowed":
            setErrorMsg("Microphone access is blocked. Allow it in the address bar and try again.");
            break;
          case "no-speech":
            setErrorMsg("Didn't catch anything. Tap the mic and try again.");
            break;
          case "audio-capture":
            setErrorMsg("No microphone was found. Please plug in or enable a microphone.");
            break;
          case "network":
            setErrorMsg("Network error with speech recognition service. Please check your connection.");
            break;
          case "aborted":
            break;
          default:
            setErrorMsg("Speech recognition paused. Tap the mic to try again.");
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setErrorMsg("Could not start microphone. Please check permissions.");
    }
  }, [isSupported, lang]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    errorMsg,
    clearError: () => setErrorMsg(null),
    startListening,
    stopListening,
    abortListening,
  };
}
