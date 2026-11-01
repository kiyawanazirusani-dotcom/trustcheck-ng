// Client wrapper for the consent-gated Gemini explanation route. This is the
// ONLY network egress carrying user-derived content, and the UI calls it only
// after the user explicitly consents to the exact payload being sent.

export interface ExplainRequest {
  verdictLevel: "clean" | "suspicious" | "scam";
  confidence: number;
  findings: string[];
}

export interface ExplainResponse {
  en?: string;
  ha?: string;
  error?: string;
}

export async function fetchExplanation(
  req: ExplainRequest,
): Promise<ExplainResponse> {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  let data: ExplainResponse = {};
  try {
    data = (await res.json()) as ExplainResponse;
  } catch {
    data = { error: "Invalid response from server." };
  }
  if (!res.ok) {
    return { error: data.error ?? "Explanation request failed." };
  }
  return data;
}
