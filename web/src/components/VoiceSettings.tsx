import React, { useState, useRef, useEffect } from "react";
import type { VoiceSettingsState } from "../hooks/useChat.ts";

interface VoiceSettingsProps {
  settings: VoiceSettingsState;
  onUpdate: (updated: Partial<VoiceSettingsState>) => void;
}

const LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "hi-IN", label: "Hindi (हिन्दी)" },
];

export function VoiceSettings({ settings, onUpdate }: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="voice-settings-wrapper" ref={popoverRef}>
      <button
        type="button"
        className="settings-trigger-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Voice and dictation settings"
        aria-label="Voice settings"
        aria-expanded={isOpen}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {isOpen && (
        <div className="voice-settings-popover" role="dialog" aria-label="Voice settings">
          <div className="popover-title">Voice options</div>

          <div className="setting-item">
            <label htmlFor="voice-lang-select" className="setting-label">
              Recognition language
            </label>
            <select
              id="voice-lang-select"
              className="setting-select"
              value={settings.lang}
              onChange={(e) => onUpdate({ lang: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item toggle-row">
            <div>
              <div className="toggle-title">Auto-send</div>
              <div className="toggle-desc">Send message automatically when dictation ends</div>
            </div>
            <input
              type="checkbox"
              id="toggle-autosend"
              className="setting-checkbox"
              checked={settings.autoSend}
              onChange={(e) => onUpdate({ autoSend: e.target.checked })}
            />
          </div>

          <div className="setting-item toggle-row">
            <div>
              <div className="toggle-title">Read answers aloud</div>
              <div className="toggle-desc">Speak every incoming response</div>
            </div>
            <input
              type="checkbox"
              id="toggle-readaloud"
              className="setting-checkbox"
              checked={settings.readAloud}
              onChange={(e) => onUpdate({ readAloud: e.target.checked })}
            />
          </div>

          <div className="setting-item toggle-row">
            <div>
              <div className="toggle-title">Hands-free conversation</div>
              <div className="toggle-desc">Auto-send, speak answer, and listen again</div>
            </div>
            <input
              type="checkbox"
              id="toggle-handsfree"
              className="setting-checkbox"
              checked={settings.handsFree}
              onChange={(e) =>
                onUpdate({
                  handsFree: e.target.checked,
                  // Hands-free requires autoSend and readAloud
                  ...(e.target.checked ? { autoSend: true, readAloud: true } : {}),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

