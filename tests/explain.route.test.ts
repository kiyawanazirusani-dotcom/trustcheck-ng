import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// The mocked SDK delegates to `sdkImpl`, swapped per test.
let sdkImpl: () => Promise<{ text?: string }> = async () => ({});
let sdkCalls = 0;
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: () => {
        sdkCalls++;
        return sdkImpl();
      },
    };
  },
}));

import { POST } from "../app/api/explain/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const good = { verdictLevel: "LIKELY_FAKE", riskLevel: "CRITICAL", findings: ["Link imitates GTBank"] };

describe("POST /api/explain", () => {
  const original = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    sdkCalls = 0;
    sdkImpl = async () => ({});
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  });

  it("returns 503 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(req(good));
    expect(res.status).toBe(503);
    expect(sdkCalls).toBe(0);
  });

  it("returns 400 for an invalid verdictLevel", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const res = await POST(req({ ...good, verdictLevel: "nope" }));
    expect(res.status).toBe(400);
  });

  it("rejects the old verdict names and a missing/invalid riskLevel", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect((await POST(req({ ...good, verdictLevel: "scam" }))).status).toBe(400);
    expect((await POST(req({ ...good, verdictLevel: "clean" }))).status).toBe(400);
    expect((await POST(req({ ...good, riskLevel: "nope" }))).status).toBe(400);
    expect((await POST(req({ verdictLevel: "VERIFIED", findings: [] }))).status).toBe(400);
  });

  it("returns {en, ha} on success with a mocked SDK", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    sdkImpl = async () => ({ text: '```json\n{"en":"Do not click.","ha":"Kada ka danna."}\n```' });
    const res = await POST(req(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ en: "Do not click.", ha: "Kada ka danna." });
  });

  it("returns 502 without leaking details when the SDK throws", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    sdkImpl = async () => {
      throw new Error("secret test-key leaked");
    };
    const res = await POST(req(good));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("test-key");
  });
});
