// On-device OCR via tesseract.js (WASM Web Worker). The image never leaves the
// device. Browser-only: heavy worker assets are lazy-loaded on first use.

export interface OcrResult {
  text: string;
  confidence: number; // 0..1
}

interface TesseractApi {
  recognize: (
    image: Blob | File,
    langs: string,
    options: { logger?: (m: { status: string; progress: number }) => void },
  ) => Promise<{ data: { text: string; confidence: number } }>;
}

/**
 * Recognize text in an image on-device. `onProgress` receives 0..1 while
 * recognition runs. Throws on the server (OCR is browser-only).
 */
export async function recognizeImage(
  image: Blob | File,
  onProgress?: (progress: number) => void,
): Promise<OcrResult> {
  if (typeof window === "undefined") {
    throw new Error("OCR is only available in the browser.");
  }

  // Lazy-load so the WASM worker is only fetched when the user adds a screenshot.
  const Tesseract = (await import("tesseract.js")) as unknown as TesseractApi;

  const result = await Tesseract.recognize(image, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(m.progress);
      }
    },
  });

  return {
    text: (result.data.text ?? "").trim(),
    confidence: (result.data.confidence ?? 0) / 100,
  };
}
