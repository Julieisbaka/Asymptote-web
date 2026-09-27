/** Format opacity as a compact valid SVG number. */
export function formatOpacity(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Escape text and attribute content for XML serialization. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Encode UTF-8 text as base64 without overflowing the argument stack. */
export function encodeBase64(value: string): string {
  if (typeof btoa !== "function" || typeof TextEncoder === "undefined") return "";
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}
