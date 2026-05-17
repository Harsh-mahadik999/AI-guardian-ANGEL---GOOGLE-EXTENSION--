export function detectLanguage(text: string): string {
  if (!text || text.trim().length < 5) return "en";

  let hindi = 0;
  let bengali = 0;
  let tamil = 0;
  let latin = 0;

  for (const char of text) {
    if (/[\u0900-\u097F]/.test(char)) hindi++;
    else if (/[\u0980-\u09FF]/.test(char)) bengali++;
    else if (/[\u0B80-\u0BFF]/.test(char)) tamil++;
    else if (/[a-zA-Z]/.test(char)) latin++;
  }

  const max = Math.max(hindi, bengali, tamil, latin);

  // fallback if nothing detected
  if (max === 0) return "en";

  if (max === hindi) return "hi";
  if (max === bengali) return "bn";
  if (max === tamil) return "ta";

  return "en";
}