// Citations parser: safely converts text with [n] citations into React nodes.
// Never uses dangerouslySetInnerHTML.

import React from "react";

export interface CitationSource {
  index: number;
  url: string;
  title: string;
  publishedDate?: string;
  authority?: string;
}

export interface CitationSegment {
  type: "text" | "citation";
  value: string;
  index?: number;
  source?: CitationSource;
}

export function parseCitationSegments(
  text: string,
  sources: CitationSource[] = []
): CitationSegment[] {
  if (!text) return [];

  const segments: CitationSegment[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, match.index),
      });
    }

    const n = parseInt(match[1] ?? "0", 10);
    const source = sources.find((s) => s.index === n);
    segments.push({
      type: "citation",
      value: match[0],
      index: n,
      source,
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return segments;
}

export function renderWithCitations(
  text: string,
  sources: CitationSource[] = []
): React.ReactNode[] {
  const segments = parseCitationSegments(text, sources);
  return segments.map((seg, i) => {
    if (seg.type === "text") {
      return seg.value;
    }
    const href = seg.source ? seg.source.url : "#";
    const title = seg.source?.title ? seg.source.title : `Source ${seg.index}`;
    return React.createElement(
      "sup",
      { key: `cite-${i}`, className: "citation-sup" },
      React.createElement(
        "a",
        {
          href,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "citation-link",
          title,
          "aria-label": `Source ${seg.index}: ${title}`,
        },
        `[${seg.index}]`
      )
    );
  });
}

