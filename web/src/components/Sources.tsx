import React, { useState } from "react";
import type { SseSource } from "../lib/sse.ts";

interface SourcesProps {
  sources: SseSource[];
}

export function Sources({ sources }: SourcesProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources-container">
      <button
        type="button"
        className="sources-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        {sources.length} source{sources.length !== 1 ? "s" : ""}
      </button>

      {isOpen && (
        <div className="sources-list" role="list">
          {sources.map((src) => {
            const authClass = `authority-${src.authority}`;
            return (
              <div key={src.index} className="source-item" role="listitem">
                <span className="source-num">[{src.index}]</span>{" "}
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-title-link"
                >
                  {src.title || src.url}
                </a>
                <span className={`source-authority ${authClass}`}>
                  {src.authority}
                </span>
                {src.publishedDate && src.publishedDate !== "no publish date" && (
                  <span className="source-date"> · {src.publishedDate}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
