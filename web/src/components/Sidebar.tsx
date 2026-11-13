import React, { useState, useMemo } from "react";
import type { SessionMeta } from "../hooks/useChat.ts";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.ts";

interface SidebarProps {
  sessions: SessionMeta[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  isOpen,
  onCloseMobile,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Speech recognition for searching sessions by voice
  const { isSupported, isListening, startListening, stopListening } =
    useSpeechRecognition({
      lang: "en-US",
      onFinalResult: (transcript) => {
        setSearchTerm(transcript);
      },
    });

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const q = searchTerm.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        new Date(s.lastActivity).toLocaleDateString().toLowerCase().includes(q)
    );
  }, [sessions, searchTerm]);

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
      <nav
        className={`sidebar ${isOpen ? "open" : ""}`}
        aria-label="Conversations"
      >
        <div className="wordmark">
          Ledger<span>.</span>
        </div>

        <button
          className="new-btn"
          onClick={() => {
            onNewSession();
            onCloseMobile();
          }}
          aria-label="New conversation"
        >
          + New conversation
        </button>

        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder="Search conversations…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search conversations"
          />
          {isSupported && (
            <button
              type="button"
              className={`search-mic-btn ${isListening ? "listening" : ""}`}
              onClick={isListening ? stopListening : startListening}
              title={isListening ? "Listening…" : "Search by voice"}
              aria-label={isListening ? "Stop listening" : "Search by voice"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
          )}
        </div>

        <div className="sessions-list" role="list" aria-label="Past conversations">
          {filteredSessions.length === 0 ? (
            <div className="no-sessions">No conversations found</div>
          ) : (
            filteredSessions.map((s) => {
              const dateStr = new Date(s.lastActivity).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  className={`session-item ${isActive ? "active" : ""}`}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => {
                    onSelectSession(s.id);
                    onCloseMobile();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSession(s.id);
                      onCloseMobile();
                    }
                  }}
                  aria-label={s.title}
                >
                  <span className="session-title">{s.title}</span>
                  <span className="session-date">{dateStr}</span>
                </div>
              );
            })
          )}
        </div>
      </nav>
    </>
  );
}
