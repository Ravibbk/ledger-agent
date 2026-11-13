import React, { useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { Composer } from "./components/Composer.tsx";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis.ts";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition.ts";
import { useChat } from "./hooks/useChat.ts";

export function App() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [dictatedText, setDictatedText] = useState<string>("");

  // 1. Speech synthesis
  const {
    isSupported: isTtsSupported,
    isSpeaking,
    speak,
    cancel: cancelSpeech,
  } = useSpeechSynthesis();

  // 2. Chat state
  const chat = useChat({
    speak: (text, lang, onEnd) => {
      setSpeakingText(text);
      speak(text, lang, () => {
        setSpeakingText(null);
        onEnd?.();
      });
    },
    cancelSpeech: () => {
      setSpeakingText(null);
      cancelSpeech();
    },
    startListening: () => {
      startListening();
    },
  });

  // 3. Speech recognition
  const handleFinalSpeech = useCallback(
    (transcript: string) => {
      if (!transcript) return;

      if (chat.voiceSettings.autoSend || chat.voiceSettings.handsFree) {
        chat.sendMessage(transcript, "voice");
      } else {
        setDictatedText(transcript);
        // Clear after tick so subsequent identical speech can re-trigger
        setTimeout(() => setDictatedText(""), 100);
      }
    },
    [chat]
  );

  const {
    isSupported: isSttSupported,
    isListening,
    interimTranscript,
    errorMsg: sttError,
    clearError: clearSttError,
    startListening,
    stopListening,
    abortListening,
  } = useSpeechRecognition({
    lang: chat.voiceSettings.lang,
    isSpeaking,
    onFinalResult: (transcript) => {
      handleFinalSpeech(transcript);
    },
  });

  return (
    <div className="app-layout">
      {/* Mobile top bar */}
      <header className="mobile-header">
        <button
          type="button"
          className="menu-btn"
          onClick={() => setIsMobileSidebarOpen(true)}
          aria-label="Open conversation menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="mobile-title">
          Ledger<span>.</span>
        </div>
        <button
          type="button"
          className="mobile-new-btn"
          onClick={chat.newConversation}
          aria-label="New conversation"
        >
          +
        </button>
      </header>

      {/* Sidebar rail */}
      <Sidebar
        sessions={chat.sessions}
        activeSessionId={chat.sessionId}
        onSelectSession={chat.selectSession}
        onNewSession={chat.newConversation}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main chat viewport */}
      <main className="main-viewport">
        <MessageList
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          streamedText={chat.streamedText}
          activeSources={chat.activeSources}
          trailEvents={chat.trailEvents}
          onSelectPrompt={(p) => chat.sendMessage(p, "text")}
          onSpeak={(t) => {
            setSpeakingText(t);
            speak(t, chat.voiceSettings.lang, () => setSpeakingText(null));
          }}
          speakingMsgText={speakingText}
        />

        <Composer
          dictatedText={dictatedText}
          onSend={(text, via) => chat.sendMessage(text, via)}
          onStopGeneration={chat.stopGeneration}
          isStreaming={chat.isStreaming}
          isSpeaking={isSpeaking}
          onCancelSpeech={() => {
            setSpeakingText(null);
            cancelSpeech();
          }}
          isSupported={isSttSupported}
          isListening={isListening}
          interimTranscript={interimTranscript}
          errorMsg={sttError}
          onClearError={clearSttError}
          onStartListening={startListening}
          onStopListening={stopListening}
          onAbortListening={abortListening}
          voiceSettings={chat.voiceSettings}
          onUpdateVoiceSettings={chat.setVoiceSettings}
        />
      </main>
    </div>
  );
}
