import React from "react";

interface MicButtonProps {
  isSupported: boolean;
  isListening: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function MicButton({
  isSupported,
  isListening,
  onClick,
  disabled = false,
}: MicButtonProps) {
  if (!isSupported) {
    return (
      <button
        type="button"
        className="mic-btn disabled"
        disabled
        title="Voice input needs Chrome, Edge or Safari. You can still type."
        aria-label="Voice input not supported in this browser"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
          <path d="M5 10v2a7 7 0 0 0 12 5" />
          <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`mic-btn ${isListening ? "listening" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={isListening ? "Listening… (Esc or click to stop)" : "Voice input (Ctrl+Shift+M)"}
      aria-label={isListening ? "Stop listening" : "Start voice dictation"}
      aria-pressed={isListening}
    >
      {isListening && <span className="mic-pulse-ring" aria-hidden="true" />}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
      {isListening && <span className="listening-label">Listening</span>}
    </button>
  );
}

