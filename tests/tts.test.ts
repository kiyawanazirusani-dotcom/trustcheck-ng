import { describe, it, expect } from "vitest";
import {
  hasEnglishVoice,
  hasHausaVoice,
  selectVoice,
  type VoiceLike,
} from "../lib/tts";

const v = (lang: string, name = "x"): VoiceLike => ({ lang, name });

describe("tts voice selection (pure)", () => {
  it("selectVoice matches by lang prefix", () => {
    const voices = [v("en-US", "Samantha"), v("ha-NG", "Hausa"), v("en-GB", "Daniel")];
    expect(selectVoice(voices, "en")?.name).toBe("Samantha");
    expect(selectVoice(voices, "ha")?.name).toBe("Hausa");
  });

  it("hasHausaVoice detects an ha* voice", () => {
    expect(hasHausaVoice([v("en-US"), v("ha-NG")])).toBe(true);
    expect(hasHausaVoice([v("en-US"), v("en-GB")])).toBe(false);
    expect(hasHausaVoice([])).toBe(false);
  });

  it("hasEnglishVoice detects an en* voice", () => {
    expect(hasEnglishVoice([v("en-US"), v("ha-NG")])).toBe(true);
    expect(hasEnglishVoice([v("ha-NG"), v("fr-FR")])).toBe(false);
  });

  it("selectVoice is case-insensitive", () => {
    expect(selectVoice([v("HA-ng")], "ha")).toBeDefined();
    expect(selectVoice([v("EN-us")], "EN")).toBeDefined();
  });

  it("returns undefined when no voice matches", () => {
    expect(selectVoice([v("fr-FR")], "ha")).toBeUndefined();
  });
});
