import React from "react";
import type { StoredMsg } from "../hooks/useChat.ts";
import { formatTime } from "../lib/dates.ts";
import { renderWithCitations } from "../lib/citations.ts";
import { Sources } from "./Sources.tsx";
import { Trail } from "./Trail.tsx";
import type { TrailEvent } from "../hooks/useChat.ts";

interface MessageProps {
  msg: StoredMsg;
  onSpeak?: (text: string) => void;
  isCurrentlySpeaking?: boolean;
  trailEvents?: TrailEvent[];
}

export function Message({
  msg,
  onSpeak,
  isCurrentlySpeaking = false,
  trailEvents,
}: MessageProps) {
  const isUser = msg.role === "user";
  const timeFormatted = formatTime(msg.at);

  return (
    <div className={`msg-row ${isUser ? "user" : "assistant"}`}>
      <div className="msg-gutter">
        <span className="msg-time">{timeFormatted}</span>
      </div>

      <div className="msg-body">
        {isUser ? (
          <div className="user-text">
            {msg.content}
            {msg.via === "voice" && (
              <span className="voice-badge" title="Sent via voice input">
                voice
              </span>
            )}
          </div>
        ) : (
          <div className="assistant-column">
            <div className="answer-text">
              {renderWithCitations(msg.content, msg.sources || [])}
            </div>

            {onSpeak && msg.content && (
              <button
                type="button"
                className={`listen-btn ${isCurrentlySpeaking ? "speaking" : ""}`}
                onClick={() => onSpeak(msg.content)}
                title="Read answer aloud"
                aria-label="Read answer aloud"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                <span>{isCurrentlySpeaking ? "Speaking…" : "Listen"}</span>
              </button>
            )}

            {trailEvents && trailEvents.length > 0 && (
              <Trail events={trailEvents} />
            )}

            {msg.sources && msg.sources.length > 0 && (
              <Sources sources={msg.sources} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

