"use client";

import { useRef, useState } from "react";
import { recognizeImage } from "@/lib/ocr";
import type { Evidence } from "@/lib/types";

export function ScreenshotCapture({ onAdd }: { onAdd: (ev: Evidence) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const { text, confidence } = await recognizeImage(file, (p) => setProgress(p));
      if (!text) {
        setError("No readable text found in this image. Try a clearer screenshot.");
        setProgress(null);
        return;
      }
      onAdd({
        id: crypto.randomUUID(),
        kind: "screenshot",
        addedAt: Date.now(),
        ocrText: text,
        ocrConfidence: confidence,
      });
    } catch {
      setError("OCR failed on this device. Try a clearer or smaller image.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center text-sm ${
          dragOver ? "border-seam bg-patch" : "border-stone-300 dark:border-stone-700"
        }`}
      >
        <span className="font-medium">Tap to add a payment-alert screenshot</span>
        <span className="text-stone-500">or drag and drop an image here</span>
        <span className="text-xs text-stone-500">Text is read on your device — the image never leaves your phone.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {progress !== null && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Reading text on device… {Math.round(progress * 100)}%
        </p>
      )}
      {error && <p className="text-sm text-scam">{error}</p>}
    </div>
  );
}
