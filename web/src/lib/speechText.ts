// Converts assistant markdown and citations into natural speakable text,
// and chunks sentences for browser speechSynthesis.

export function cleanSpeechText(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // 1. Strip [n] citations
  cleaned = cleaned.replace(/\s*\[\d+\]/g, "");

  // 2. Strip URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, "");

  // 3. Spell "->" and "→" as " to "
  cleaned = cleaned.replace(/->|→/g, " to ");

  // 4. Remove code blocks and inline backticks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // 5. Remove markdown headers (#, ##, etc.)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");

  // 6. Convert list items into full sentences
  cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, "");
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, "");

  // 7. Remove bold / italic markers
  cleaned = cleaned.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");

  // 8. Remove blockquote markers
  cleaned = cleaned.replace(/^>\s+/gm, "");

  // 9. Fix spacing before punctuation and normalize whitespace
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, "$1");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export function chunkSentences(text: string, maxChunkLen = 160): string[] {
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];

  // Match sentences ending in ., !, ? or semicolon
  const rawSentences = cleaned.match(/[^.!?;\n]+[.!?;\n]+/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;

    if (!current) {
      current = trimmed;
    } else if (current.length + trimmed.length + 1 <= maxChunkLen) {
      current += " " + trimmed;
    } else {
      chunks.push(current);
      current = trimmed;
    }
  }

  if (current) {
    chunks.push(current);
  }

  // If a single chunk is still too long (no punctuation), split on spaces
  const finalChunks: string[] = [];
  for (const c of chunks) {
    if (c.length <= maxChunkLen) {
      finalChunks.push(c);
    } else {
      const words = c.split(" ");
      let sub = "";
      for (const w of words) {
        if (!sub) {
          sub = w;
        } else if (sub.length + w.length + 1 <= maxChunkLen) {
          sub += " " + w;
        } else {
          finalChunks.push(sub);
          sub = w;
        }
      }
      if (sub) finalChunks.push(sub);
    }
  }

  return finalChunks;
}
