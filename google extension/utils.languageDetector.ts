export function detectLanguage(text: string): string {
  if (!text) return "en";

  const hasHindi = /[\u0900-\u097F]/.test(text);
  const hasBengali = /[\u0980-\u09FF]/.test(text);
  const hasTamil = /[\u0B80-\u0BFF]/.test(text);

  if (hasHindi) return "hi";
  if (hasBengali) return "bn";
  if (hasTamil) return "ta";

  return "en";
}
