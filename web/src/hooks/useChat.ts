// useChat: coordinates sessions, SSE stream, requestAnimationFrame repainting, and hands-free loop.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  streamChat,
  type SseSource,
  type SseAnchorsData,
  type SseMemoryData,
  type SseSearchData,
  type SseDoneData,
} from "../lib/sse.ts";

export interface StoredMsg {
  role: "user" | "assistant";
  content: string;
  at: string;
  sources?: SseSource[];
  via?: "voice" | "text";
}

export interface SessionMeta {
  id: string;
  title: string;
  lastActivity: string;
}

export interface TrailEvent {
  id: string;
  text: string;
  pulsing?: boolean;
}

export interface VoiceSettingsState {
  lang: string;
  autoSend: boolean;
  readAloud: boolean;
  handsFree: boolean;
}

const SETTINGS_KEY = "ledger_voice_settings";

function loadVoiceSettings(): VoiceSettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    lang: typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US",
    autoSend: false,
    readAloud: false,
    handsFree: false,
  };
}

function saveVoiceSettings(s: VoiceSettingsState) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function newSessionId(): string {
  return "sess-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function useChat({
  speak,
  cancelSpeech,
  startListening,
}: {
  speak: (text: string, lang?: string, onEnd?: () => void) => void;
  cancelSpeech: () => void;
  startListening: () => void;
}) {
  const [sessionId, setSessionId] = useState<string>(newSessionId);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [messages, setMessages] = useState<StoredMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [activeSources, setActiveSources] = useState<SseSource[]>([]);
  const [trailEvents, setTrailEvents] = useState<TrailEvent[]>([]);
  const [voiceSettings, setVoiceSettingsState] = useState<VoiceSettingsState>(loadVoiceSettings);

  const abortControllerRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);
  const tokenBufferRef = useRef<string>("");
  const streamedTextRef = useRef<string>("");
  const noSpeechCountRef = useRef(0);

  const setVoiceSettings = useCallback((newSettings: Partial<VoiceSettingsState>) => {
    setVoiceSettingsState((prev) => {
      const next = { ...prev, ...newSettings };
      saveVoiceSettings(next);
      return next;
    });
  }, []);

  // Fetch session list
  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.reverse());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Load a session
  const selectSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    cancelSpeech();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSessionId(id);
    setTrailEvents([]);
    setActiveSources([]);
    setStreamedText("");
    setIsStreaming(false);

    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      setMessages([]);
    }
  }, [sessionId, cancelSpeech]);

  // Create new session
  const newConversation = useCallback(() => {
    cancelSpeech();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSessionId(newSessionId());
    setMessages([]);
    setTrailEvents([]);
    setActiveSources([]);
    setStreamedText("");
    setIsStreaming(false);
  }, [cancelSpeech]);

  // Stop active streaming turn
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamedTextRef.current) {
      const finalized = streamedTextRef.current;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: finalized,
          at: new Date().toISOString(),
          sources: activeSources,
        },
      ]);
    }

    setIsStreaming(false);
    setStreamedText("");
    streamedTextRef.current = "";
    tokenBufferRef.current = "";
  }, [activeSources]);

  // Send message
  const sendMessage = useCallback(
    async (text: string, via: "voice" | "text" = "text") => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      cancelSpeech();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const now = new Date().toISOString();
      const userMsg: StoredMsg = {
        role: "user",
        content: trimmed,
        at: now,
        via,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamedText("");
      streamedTextRef.current = "";
      tokenBufferRef.current = "";
      setTrailEvents([]);
      setActiveSources([]);

      const ctrl = new AbortController();
      abortControllerRef.current = ctrl;

      const tzOffset = new Date().getTimezoneOffset();

      await streamChat(
        {
          sessionId,
          message: trimmed,
          tzOffset,
          via,
        },
        {
          onAnchors: (data: SseAnchorsData) => {
            for (const a of data.anchors) {
              const fb = a.fallback ? ` (fallback: ${a.fallback})` : "";
              setTrailEvents((prev) => [
                ...prev,
                {
                  id: `anchor-${Math.random()}`,
                  text: `Reading "${a.text}" as ${a.day}${fb}`,
                },
              ]);
            }
          },
          onMemory: (data: SseMemoryData) => {
            if (data.count > 0) {
              setTrailEvents((prev) => [
                ...prev,
                {
                  id: `mem-${Math.random()}`,
                  text: `Recalled ${data.count} message${data.count === 1 ? "" : "s"} from ${data.daysCovered.join(", ")}`,
                },
              ]);
            }
          },
          onSearch: (data: SseSearchData) => {
            const qs = (data.queries || []).map((q) => `"${q}"`).join(", ");
            const sinceStr = data.since ? ` since ${data.since}` : "";
            setTrailEvents((prev) => [
              ...prev.map((t) => ({ ...t, pulsing: false })),
              {
                id: `search-${Math.random()}`,
                text: `Searching ${qs}${sinceStr}`,
                pulsing: true,
              },
            ]);
          },
          onSources: (data) => {
            if (data.sources) {
              setActiveSources(data.sources);
            }
          },
          onToken: (chunk) => {
            tokenBufferRef.current += chunk;
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                streamedTextRef.current += tokenBufferRef.current;
                setStreamedText(streamedTextRef.current);
                tokenBufferRef.current = "";
                rafRef.current = null;
              });
            }
          },
          onDone: (data: SseDoneData) => {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            const finalText = streamedTextRef.current + tokenBufferRef.current;
            tokenBufferRef.current = "";
            streamedTextRef.current = "";

            setTrailEvents((prev) => [
              ...prev.map((t) => ({ ...t, pulsing: false })),
              {
                id: `done-${Math.random()}`,
                text: `${data.sources?.length ?? 0} sources · ${data.stats?.searches ?? 0} searches · ${data.stats?.totalMs ?? 0}ms`,
              },
            ]);

            const assistantMsg: StoredMsg = {
              role: "assistant",
              content: finalText,
              at: data.timestamp || new Date().toISOString(),
              sources: data.sources || [],
            };

            setMessages((prev) => [...prev, assistantMsg]);
            setIsStreaming(false);
            setStreamedText("");
            refreshSessions();

            // Check if voice read-aloud or hands-free is enabled
            if (voiceSettings.readAloud || voiceSettings.handsFree) {
              speak(finalText, voiceSettings.lang, () => {
                // If hands-free is active, listen again!
                if (voiceSettings.handsFree) {
                  startListening();
                }
              });
            }
          },
          onError: (err) => {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setTrailEvents((prev) => [
              ...prev.map((t) => ({ ...t, pulsing: false })),
              {
                id: `err-${Math.random()}`,
                text: `Error: ${err.message}`,
              },
            ]);
            setIsStreaming(false);
          },
        },
        ctrl.signal
      );
    },
    [
      sessionId,
      isStreaming,
      voiceSettings,
      cancelSpeech,
      speak,
      startListening,
      refreshSessions,
    ]
  );

  return {
    sessionId,
    sessions,
    messages,
    isStreaming,
    streamedText,
    activeSources,
    trailEvents,
    voiceSettings,
    setVoiceSettings,
    selectSession,
    newConversation,
    sendMessage,
    stopGeneration,
    noSpeechCountRef,
  };
}
