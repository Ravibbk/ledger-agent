import React, { useState, useEffect, useRef } from "react";
import { MicButton } from "./MicButton.tsx";
import { VoiceSettings } from "./VoiceSettings.tsx";
import type { VoiceSettingsState } from "../hooks/useChat.ts";

interface ComposerProps {
  dictatedText?: string;
  onSend: (text: string, via: "voice" | "text") => void;
  onStopGeneration: () => void;
  isStreaming: boolean;
  isSpeaking: boolean;
  onCancelSpeech: () => void;
  // Speech recognition props
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  errorMsg: string | null;
  onClearError: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onAbortListening: () => void;
  voiceSettings: VoiceSettingsState;
  onUpdateVoiceSettings: (settings: Partial<VoiceSettingsState>) => void;
}

export function Composer({
  dictatedText,
  onSend,
  onStopGeneration,
  isStreaming,
  isSpeaking,
  onCancelSpeech,
  isSupported,
  isListening,
  interimTranscript,
  errorMsg,
  onClearError,
  onStartListening,
  onStopListening,
  onAbortListening,
  voiceSettings,
  onUpdateVoiceSettings,
}: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (dictatedText) {
      setText((prev) => (prev ? prev + " " + dictatedText : dictatedText));
    }
  }, [dictatedText]);

  // Auto-resize textarea
  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    resizeTextarea();
  }, [text, interimTranscript]);

  const handleSend = () => {
    const toSend = text.trim();
    if (!toSend || isStreaming) return;
    onSend(toSend, "text");
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Keyboard shortcut listener: Ctrl+Shift+M / Cmd+Shift+M and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape stops listening & speaking
      if (e.key === "Escape") {
        if (isListening) onAbortListening();
        if (isSpeaking) onCancelSpeech();
      }

      // Ctrl/Cmd + Shift + M toggles mic
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        if (isListening) {
          onStopListening();
        } else {
          onStartListening();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isListening, isSpeaking, onAbortListening, onCancelSpeech, onStartListening, onStopListening]);

  return (
    <div className="composer-container">
      {errorMsg && (
        <div className="voice-error-banner" role="alert">
          <span>{errorMsg}</span>
          <button
            type="button"
            className="error-dismiss-btn"
            onClick={onClearError}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {isSpeaking && (
        <div className="speaking-banner">
          <span>Reading response aloud…</span>
          <button
            type="button"
            className="stop-speaking-btn"
            onClick={onCancelSpeech}
          >
            Stop speaking (Esc)
          </button>
        </div>
      )}

      <div className="composer-row">
        <div className="input-box-wrapper">
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isListening
                ? "Listening… speak naturally"
                : "Ask about anything time-sensitive…"
            }
            aria-label="Message text"
            disabled={isStreaming}
          />

          {/* Live interim transcript overlay */}
          {isListening && interimTranscript && (
            <div className="interim-overlay" aria-hidden="true">
              <span className="committed-ghost">{text ? text + " " : ""}</span>
              <span className="interim-text">{interimTranscript}</span>
            </div>
          )}
        </div>

        <div className="composer-actions">
          <MicButton
            isSupported={isSupported}
            isListening={isListening}
            onClick={isListening ? onStopListening : onStartListening}
            disabled={isStreaming || isSpeaking}
          />

          <VoiceSettings
            settings={voiceSettings}
            onUpdate={onUpdateVoiceSettings}
          />

          {isStreaming ? (
            <button
              type="button"
              className="stop-gen-btn"
              onClick={onStopGeneration}
              title="Stop response generation"
              aria-label="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              onClick={handleSend}
              disabled={!text.trim() || isStreaming}
              aria-label="Send message"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
