export interface PositionedPdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize?: number;
  hasEOL?: boolean;
}

interface PdfRow {
  y: number;
  items: PositionedPdfTextItem[];
}

/**
 * Rebuilds positioned PDF text in reading order. When a stable gutter appears
 * across several rows, left and right columns are emitted as separate blocks
 * instead of interleaving every visual row.
 */
export function reconstructPdfTextFromItems(pages: PositionedPdfTextItem[][]): string {
  return pages.map((items) => reconstructPage(items)).filter(Boolean).join("\n\n");
}

function reconstructPage(items: PositionedPdfTextItem[]): string {
  const visible = items.filter((item) => item.str?.trim() && Number.isFinite(item.x) && Number.isFinite(item.y));
  if (!visible.length) return "";
  const ordered = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfRow[] = [];

  for (const item of ordered) {
    const fontSize = item.fontSize || item.height || 10;
    const tolerance = Math.max(1.8, Math.min(5, fontSize * 0.32));
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
    row.y = row.items.reduce((sum, value) => sum + value.y, 0) / row.items.length;
  }

  const normalizedRows = rows
    .map((row) => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) }))
    .sort((a, b) => b.y - a.y);
  const pageLeft = Math.min(...visible.map((item) => item.x));
  const pageRight = Math.max(...visible.map((item) => item.x + item.width));
  const pageWidth = pageRight - pageLeft;
  if (normalizedRows.length < 4 || pageWidth < 180) return normalizedRows.map((row) => joinItems(row.items)).join("\n");

  const gapCandidates: number[] = [];
  for (const row of normalizedRows) {
    for (let i = 1; i < row.items.length; i += 1) {
      const previous = row.items[i - 1];
      const current = row.items[i];
      const gap = current.x - (previous.x + previous.width);
      const minGap = Math.max(25, (previous.fontSize || current.fontSize || 10) * 2.2);
      if (gap >= minGap) gapCandidates.push(previous.x + previous.width + gap / 2);
    }
  }
  if (gapCandidates.length < 3) return normalizedRows.map((row) => joinItems(row.items)).join("\n");

  const clusters: Array<{ center: number; count: number }> = [];
  for (const position of gapCandidates) {
    const cluster = clusters.find((candidate) => Math.abs(candidate.center - position) <= pageWidth * 0.08);
    if (cluster) {
      cluster.center = (cluster.center * cluster.count + position) / (cluster.count + 1);
      cluster.count += 1;
    } else clusters.push({ center: position, count: 1 });
  }
  clusters.sort((a, b) => b.count - a.count);
  const gutter = clusters[0];
  if (!gutter || gutter.count < 3 || gutter.center < pageLeft + pageWidth * 0.28 || gutter.center > pageRight - pageWidth * 0.28) {
    return normalizedRows.map((row) => joinItems(row.items)).join("\n");
  }

  const fullWidth: string[] = [];
  const leftColumn: string[] = [];
  const rightColumn: string[] = [];
  for (const row of normalizedRows) {
    const left = row.items.filter((item) => item.x + item.width / 2 < gutter.center);
    const right = row.items.filter((item) => item.x + item.width / 2 >= gutter.center);
    const leftText = joinItems(left);
    const rightText = joinItems(right);
    const rowLooksFullWidth = row.items.some((item) => item.width > pageWidth * 0.58) ||
      (left.length > 0 && right.length > 0 && row.items.length === 1);
    if (rowLooksFullWidth) {
      fullWidth.push(joinItems(row.items));
    } else {
      if (leftText) leftColumn.push(leftText);
      if (rightText) rightColumn.push(rightText);
    }
  }
  if (gutter.count < 3 || !leftColumn.length || !rightColumn.length) {
    return normalizedRows.map((row) => joinItems(row.items)).join("\n");
  }
  return [...fullWidth, ...leftColumn, ...rightColumn].join("\n");
}

function joinItems(items: PositionedPdfTextItem[]): string {
  return items.map((item) => item.str.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
