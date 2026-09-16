/** Minimal CSV writer/downloader — no dependency needed for a handful of report tables. */

function escapeCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Multiple labeled tables concatenated into one CSV, each preceded by a title row and a header row. */
export function sectionsToCsv(sections: { title: string; headers: string[]; rows: (string | number)[][] }[]): string {
  const blocks = sections.map((s) => rowsToCsv([[s.title], s.headers, ...s.rows]));
  return blocks.join("\r\n\r\n");
}

/** Triggers a browser download of `content` as a file — no server round-trip. */
export function downloadTextFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
