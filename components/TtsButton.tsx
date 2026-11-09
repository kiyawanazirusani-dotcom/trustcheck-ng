"use client";

import { useEffect, useState } from "react";
import { loadVoices, speak, stopSpeaking } from "@/lib/tts";

interface Props {
  text: string;
  /** Language prefix: "en" or "ha". */
  lang: "en" | "ha";
  label: string;
}

/**
 * Speak/stop button. If the device has no voice for the language (typical for
 * Hausa), nothing is spoken and a notice tells the user to read the text that
 * is always shown on screen.
 */
export function TtsButton({ text, lang, label }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => () => stopSpeaking(), []);

  async function onClick() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    await loadVoices();
    const ok = speak(text, lang);
    setUnavailable(!ok);
    setSpeaking(ok);
    if (ok) {
      // Poll until the utterance finishes so the button returns to "speak".
      const timer = setInterval(() => {
        if (!speechSynthesis.speaking) {
          clearInterval(timer);
          setSpeaking(false);
        }
      }, 300);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={speaking}
        className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
      >
        {speaking ? "■ Stop" : `🔊 ${label}`}
      </button>
      {unavailable && (
        <p role="status" className="mt-1 text-xs text-suspicious">
          {lang === "ha"
            ? "No Hausa voice on this device. Please read the Hausa text on screen."
            : "No English voice available on this device. Please read the text on screen."}
        </p>
      )}
    </div>
  );
}
