import React from "react";
import type { TrailEvent } from "../hooks/useChat.ts";

interface TrailProps {
  events: TrailEvent[];
}

export function Trail({ events }: TrailProps) {
  if (!events || events.length === 0) return null;

  return (
    <div className="trail" aria-label="System verification trail">
      {events.map((ev) => {
        // Highlight dates in amber
        const parts = ev.text.split(/(\d{4}-\d{2}-\d{2})/g);

        return (
          <div key={ev.id} className="trail-item">
            <div
              className={`trail-dot ${ev.pulsing ? "pulsing" : ""}`}
              aria-hidden="true"
            />
            <span className="trail-text">
              {parts.map((p, idx) =>
                /^\d{4}-\d{2}-\d{2}$/.test(p) ? (
                  <span key={idx} className="date-mark">
                    {p}
                  </span>
                ) : (
                  p
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

