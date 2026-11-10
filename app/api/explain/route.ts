import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// The Gemini API key is server-side only (process.env). This route is the ONLY
// place user content leaves the device, and only after explicit consent. The
// key is never imported by client code or bundled.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_LEVELS = new Set(["clean", "unverifiable", "suspicious", "scam"]);

interface ParsedRequest {
  verdictLevel: string;
  confidencePct: number;
  reasons: string[];
}

function parseRequest(body: unknown): ParsedRequest | { status: number; error: string } {
  if (typeof body !== "object" || body === null) {
    return { status: 400, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  const verdictLevel = typeof b.verdictLevel === "string" ? b.verdictLevel : "";
  if (!VALID_LEVELS.has(verdictLevel)) {
    return { status: 400, error: "Invalid or missing verdictLevel" };
  }
  const confidenceRaw = typeof b.confidence === "number" ? b.confidence : 0;
  const confidencePct = Math.round(Math.min(1, Math.max(0, confidenceRaw)) * 100);
  const findings = Array.isArray(b.findings) ? b.findings : [];
  const reasons = findings
    .map((f) => (typeof f === "string" ? f : ""))
    .map((s) => s.slice(0, 300))
    .filter(Boolean)
    .slice(0, 20);
  return { verdictLevel, confidencePct, reasons };
}

function buildPrompt(level: string, confidencePct: number, reasons: string[]): string {
  const reasonList = reasons.length ? reasons.map((r) => `- ${r}`).join("\n") : "- No specific red flags were detected.";
  return `You are a fraud-awareness assistant for ordinary Nigerians. Explain a scam-check verdict briefly and clearly in BOTH English and Hausa.
- Restate the verdict (${level}, ${confidencePct}% confidence) in simple words.
- Explain the main reasons in plain, non-technical language.
- Give one clear, practical next step.
Keep each explanation under 60 words. Return ONLY valid JSON with this exact shape and nothing else:
{"en": "<English explanation>", "ha": "<Hausa explanation>"}

Verdict: ${level} (${confidencePct}% confidence)
Reasons:
${reasonList}`;
}

function str(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x : undefined;
}

function parseBilingual(text: string): { en?: string; ha?: string } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    return { en: str(obj.en), ha: str(obj.ha) };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if ("status" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is not configured for AI explanations (GEMINI_API_KEY missing)." },
      { status: 503 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: buildPrompt(parsed.verdictLevel, parsed.confidencePct, parsed.reasons),
    });
    const out = parseBilingual(res.text ?? "");
    if (!out.en && !out.ha) {
      return NextResponse.json({ error: "No explanation returned by the model." }, { status: 502 });
    }
    return NextResponse.json(out);
  } catch {
    // Never leak the key or SDK internals in the error message.
    return NextResponse.json({ error: "Explanation request failed." }, { status: 502 });
  }
}
