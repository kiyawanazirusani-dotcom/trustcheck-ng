// Text-to-speech via the Web Speech API (SpeechSynthesis). English uses the
// default en-* voice; Hausa uses an ha* voice if the device has one, otherwise
// the UI falls back to showing the Hausa text on screen.

/** A minimal voice shape (the real SpeechSynthesisVoice satisfies it). */
export interface VoiceLike {
  lang: string;
  name: string;
}

/** Pure: pick the first voice whose lang starts with a prefix. */
export function selectVoice(
  voices: VoiceLike[],
  langPrefix: string,
): VoiceLike | undefined {
  const p = langPrefix.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(p));
}

/** Pure helpers, testable without a browser. */
export function hasHausaVoice(voices: VoiceLike[]): boolean {
  return selectVoice(voices, "ha") !== undefined;
}

export function hasEnglishVoice(voices: VoiceLike[]): boolean {
  return selectVoice(voices, "en") !== undefined;
}

/** Current voices (may be empty until the browser has loaded them). */
export function getVoices(): VoiceLike[] {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().map((v) => ({ lang: v.lang, name: v.name }));
}

/** Resolve voices, waiting for `voiceschanged` (with a timeout fallback). */
export function loadVoices(timeoutMs = 1500): Promise<VoiceLike[]> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve([]);
    const existing = getVoices();
    if (existing.length) return resolve(existing);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      speechSynthesis.onvoiceschanged = null;
      resolve(getVoices());
    };
    speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, timeoutMs);
  });
}

/** Speak text in a language (prefix, e.g. "ha" or "en"). Returns false if
 *  unavailable or no voice for that language exists. */
export function speak(text: string, langPrefix: string): boolean {
  if (typeof speechSynthesis === "undefined" || !text) return false;
  const realVoices = speechSynthesis.getVoices();
  const voice = selectVoice(
    realVoices.map((v) => ({ lang: v.lang, name: v.name })),
    langPrefix,
  );
  if (!voice) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice.lang;
  const real = realVoices.find((v) => v.lang === voice.lang && v.name === voice.name);
  if (real) u.voice = real;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
