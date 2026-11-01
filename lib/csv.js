export function escapeCsvCell(value) {
  const text = String(value ?? "");
  const safe = /^[\s\u0000-\u001f\u007f\ufeff]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
