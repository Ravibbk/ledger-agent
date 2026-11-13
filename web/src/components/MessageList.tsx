import React, { useEffect, useRef } from "react";
import type { StoredMsg, TrailEvent } from "../hooks/useChat.ts";
import type { SseSource } from "../lib/sse.ts";
import { dayKey, formatDayLabel } from "../lib/dates.ts";
import { Message } from "./Message.tsx";

interface MessageListProps {
  messages: StoredMsg[];
  isStreaming: boolean;
  streamedText: string;
  activeSources: SseSource[];
  trailEvents: TrailEvent[];
  onSelectPrompt: (prompt: string) => void;
  onSpeak: (text: string) => void;
  speakingMsgText?: string | null;
}

const EXAMPLE_PROMPTS = [
  "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
  "What did I ask you on 3 November? Is your answer still correct today?",
  "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
];

export function MessageList({
  messages,
  isStreaming,
  streamedText,
  activeSources,
  trailEvents,
  onSelectPrompt,
  onSpeak,
  speakingMsgText,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Check if user is scrolled near bottom
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  // Auto-scroll only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, streamedText, trailEvents]);

  // If empty conversation, show empty state
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="message-list empty" ref={containerRef}>
        <div className="empty-state">
          <h1 className="empty-headline">Ask it about last week.</h1>
          <p className="empty-voice-hint">Tap the mic and just say it.</p>

          <ul className="example-prompts" role="list">
            {EXAMPLE_PROMPTS.map((prompt, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  className="example-prompt-btn"
                  onClick={() => onSelectPrompt(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Group messages and insert day markers
  let lastDay: string | null = null;

  return (
    <div
      className="message-list"
      ref={containerRef}
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
    >
      {messages.map((m, idx) => {
        const currentDay = dayKey(m.at);
        const showDayMarker = currentDay !== lastDay;
        lastDay = currentDay;

        return (
          <React.Fragment key={idx}>
            {showDayMarker && (
              <div className="day-marker">
                <div className="day-marker-line" />
                <div className="day-marker-label">
                  {formatDayLabel(m.at)}
                </div>
                <div className="day-marker-line" />
              </div>
            )}
            <Message
              msg={m}
              onSpeak={m.role === "assistant" ? onSpeak : undefined}
              isCurrentlySpeaking={speakingMsgText === m.content}
            />
          </React.Fragment>
        );
      })}

      {/* Streaming assistant message in progress */}
      {isStreaming && (
        <Message
          msg={{
            role: "assistant",
            content: streamedText,
            at: new Date().toISOString(),
            sources: activeSources,
          }}
          trailEvents={trailEvents}
        />
      )}
    </div>
  );
}

