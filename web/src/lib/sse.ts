// SSE parser over POST request with ReadableStream.

export interface SseAnchorsData {
  anchors: Array<{ text: string; day: string; fallback?: string }>;
}

export interface SseMemoryData {
  days: string[];
  count: number;
  daysCovered: string[];
}

export interface SseSearchData {
  queries: string[];
  since?: string;
  topic?: string;
  newSources?: number;
}

export interface SseSource {
  index: number;
  url: string;
  title: string;
  publishedDate: string;
  authority: "official" | "press" | "other";
}

export interface SseDoneData {
  timestamp: string;
  sources: SseSource[];
  stats: {
    searches: number;
    msToFirstToken: number;
    totalMs: number;
  };
}

export interface SseHandlers {
  onAnchors?: (data: SseAnchorsData) => void;
  onMemory?: (data: SseMemoryData) => void;
  onSearch?: (data: SseSearchData) => void;
  onSources?: (data: { sources: SseSource[] }) => void;
  onToken?: (text: string) => void;
  onDone?: (data: SseDoneData) => void;
  onError?: (error: { message: string }) => void;
}

export async function streamChat(
  payload: {
    sessionId: string;
    message: string;
    tzOffset: number;
    via?: "voice" | "text";
  },
  handlers: SseHandlers,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      if (err.error) msg = err.error;
    } catch {
      // ignore
    }
    handlers.onError?.({ message: msg });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError?.({ message: "Response body stream unavailable." });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const rawData = line.slice(6).trim();
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = { text: rawData };
          }

          switch (currentEvent) {
            case "anchors":
              handlers.onAnchors?.(parsed as SseAnchorsData);
              break;
            case "memory":
              handlers.onMemory?.(parsed as SseMemoryData);
              break;
            case "search":
              handlers.onSearch?.(parsed as SseSearchData);
              break;
            case "sources":
              handlers.onSources?.(parsed as { sources: SseSource[] });
              break;
            case "token":
              handlers.onToken?.((parsed as { text?: string }).text ?? "");
              break;
            case "done":
              handlers.onDone?.(parsed as SseDoneData);
              break;
            case "error":
              handlers.onError?.(parsed as { message: string });
              break;
          }

          currentEvent = "message";
        }
      }
    }
  } catch (err: unknown) {
    if ((err as Error)?.name !== "AbortError") {
      handlers.onError?.({
        message: (err as Error)?.message ?? "Connection interrupted.",
      });
    }
  }
}

