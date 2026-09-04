/** Escape a single CSV field (RFC 4180 style: quote if it contains a comma, quote, or newline). */
function escapeField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a UTF-8 BOM-prefixed CSV string (opens correctly in Excel) from row arrays. */
export function toCsvWithBom(rows: (string | number | null | undefined)[][]): string {
  const body = rows.map((row) => row.map(escapeField).join(",")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}
