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

interface PdfColumnBoundary {
  x: number;
  gap: number;
  leftCount: number;
  rightCount: number;
}

export function reconstructPdfTextFromItems(pages: PositionedPdfTextItem[][]): string {
  return pages.map(reconstructPage).filter(Boolean).join("\n\n");
}

export function hasMultiColumnPdfLayout(pages: PositionedPdfTextItem[][]): boolean {
  return pages.some((items) => {
    const visible = items.filter((item) =>
      item.str?.trim() &&
      Number.isFinite(item.x) &&
      Number.isFinite(item.y) &&
      Number.isFinite(item.width),
    );
    if (!visible.length) return false;
    const pageLeft = Math.min(...visible.map((item) => item.x));
    const pageRight = Math.max(...visible.map((item) => item.x + Math.max(0, item.width)));
    const pageWidth = pageRight - pageLeft;
    return pageWidth >= 180 && findColumnBoundary(visible, pageLeft, pageWidth) !== null;
  });
}

function reconstructPage(items: PositionedPdfTextItem[]): string {
  const visible = items.filter((item) =>
    item.str?.trim() &&
    Number.isFinite(item.x) &&
    Number.isFinite(item.y) &&
    Number.isFinite(item.width),
  );
  if (!visible.length) return "";

  const rows = groupRows(visible);
  const pageLeft = Math.min(...visible.map((item) => item.x));
  const pageRight = Math.max(...visible.map((item) => item.x + Math.max(0, item.width)));
  const pageWidth = pageRight - pageLeft;
  const boundary = pageWidth >= 180 ? findColumnBoundary(visible, pageLeft, pageWidth) : null;
  if (!boundary) return rows.map((row) => joinItems(row.items)).filter(Boolean).join("\n");

  const orderedBlocks: string[] = [];
  const leftColumn: string[] = [];
  const rightColumn: string[] = [];
  const flushColumns = () => {
    orderedBlocks.push(...leftColumn.splice(0), ...rightColumn.splice(0));
  };

  for (const row of rows) {
    const spanningItems = row.items.filter((item) => item.width > pageWidth * 0.58);
    if (spanningItems.length) {
      flushColumns();
      const spanning = new Set(spanningItems);
      const otherItems = row.items.filter((item) => !spanning.has(item));
      const text = joinItems([...spanningItems, ...otherItems]);
      if (text) orderedBlocks.push(text);
      continue;
    }

    const left = row.items.filter((item) => item.x + Math.max(0, item.width) / 2 < boundary.x);
    const right = row.items.filter((item) => item.x + Math.max(0, item.width) / 2 >= boundary.x);
    const leftText = joinItems(left);
    const rightText = joinItems(right);
    if (leftText) leftColumn.push(leftText);
    if (rightText) rightColumn.push(rightText);
  }
  flushColumns();
  return orderedBlocks.join("\n");
}

function groupRows(items: PositionedPdfTextItem[]): PdfRow[] {
  const ordered = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
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
  return rows
    .map((row) => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) }))
    .sort((a, b) => b.y - a.y);
}

function findColumnBoundary(
  items: PositionedPdfTextItem[],
  pageLeft: number,
  pageWidth: number,
): PdfColumnBoundary | null {
  const candidates = items
    .filter((item) => item.width <= pageWidth * 0.58)
    .flatMap((item) => [item.x, item.x + Math.max(0, item.width)])
    .filter((x) => x >= pageLeft + pageWidth * 0.2 && x <= pageLeft + pageWidth * 0.8)
    .sort((a, b) => a - b);
  const uniqueCandidates = [...new Set(candidates)];
  let best: PdfColumnBoundary | null = null;

  for (let index = 1; index < uniqueCandidates.length; index += 1) {
    const leftEdge = uniqueCandidates[index - 1];
    const rightEdge = uniqueCandidates[index];
    const gap = rightEdge - leftEdge;
    if (gap < Math.max(12, pageWidth * 0.025)) continue;
    const x = (leftEdge + rightEdge) / 2;
    const leftCount = items.filter((item) =>
      item.width <= pageWidth * 0.58 && item.x + Math.max(0, item.width) <= x,
    ).length;
    const rightCount = items.filter((item) =>
      item.width <= pageWidth * 0.58 && item.x >= x,
    ).length;
    if (leftCount < 3 || rightCount < 3) continue;

    const candidate = { x, gap, leftCount, rightCount };
    if (
      !best ||
      Math.min(candidate.leftCount, candidate.rightCount) > Math.min(best.leftCount, best.rightCount) ||
      (Math.min(candidate.leftCount, candidate.rightCount) === Math.min(best.leftCount, best.rightCount) && candidate.gap > best.gap)
    ) {
      best = candidate;
    }
  }
  return best;
}

function joinItems(items: PositionedPdfTextItem[]): string {
  return items.map((item) => item.str.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
