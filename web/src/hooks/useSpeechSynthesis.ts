// Hook for Web Speech API SpeechSynthesis with sentence chunking and voice matching.

import { useState, useEffect, useRef, useCallback } from "react";
import { chunkSentences } from "../lib/speechText.ts";

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const isSpeakingRef = useRef(false);
  const onEndCallbackRef = useRef<(() => void) | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, [isSupported]);

  const cancel = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    onEndCallbackRef.current = null;
  }, [isSupported]);

  const speak = useCallback(
    (text: string, lang = "en-US", onEnd?: () => void) => {
      if (!isSupported) return;

      cancel();

      const chunks = chunkSentences(text);
      if (chunks.length === 0) {
        onEnd?.();
        return;
      }

      onEndCallbackRef.current = onEnd ?? null;
      isSpeakingRef.current = true;
      setIsSpeaking(true);

      // Select voice matching language
      const langPrefix = lang.slice(0, 2).toLowerCase();
      const matchedVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase())) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
        voices.find((v) => v.default) ||
        voices[0];

      let currentIndex = 0;

      const speakNextChunk = () => {
        if (!isSpeakingRef.current) return;

        if (currentIndex >= chunks.length) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          const cb = onEndCallbackRef.current;
          onEndCallbackRef.current = null;
          cb?.();
          return;
        }

        const chunkText = chunks[currentIndex];
        currentIndex++;

        if (!chunkText) {
          speakNextChunk();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunkText);
        utterance.lang = lang;
        if (matchedVoice) utterance.voice = matchedVoice;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onend = () => {
          speakNextChunk();
        };

        utterance.onerror = (e) => {
          if (e.error !== "canceled" && e.error !== "interrupted") {
            speakNextChunk();
          } else {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNextChunk();
    },
    [isSupported, voices, cancel]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [isSupported]);

  return {
    isSupported,
    isSpeaking,
    speak,
    cancel,
  };
}

