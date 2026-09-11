export type ParsedParkingRow = {
  kind: "puzzle" | "open";
  wing: string | null;
  slotNumber: string;
};

export type ParkingCsvResult = {
  rows: ParsedParkingRow[];
  errors: Array<{ row: number; message: string }>;
};

function norm(header: string) {
  return header.trim().toLowerCase().replace(/[\s_]+/g, "");
}

function splitCsvLine(line: string) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function stripWingPrefix(wing: string, slotNumber: string) {
  const slot = slotNumber.trim();
  const w = wing.trim();
  if (!w) return slot;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return slot.replace(new RegExp(`^${escaped}[-\\s]+`, "i"), "");
}

/** Parse Manage bulk-upload CSV: kind, wing, slotNumber. */
export function parseParkingCsv(text: string): ParkingCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const result: ParkingCsvResult = { rows: [], errors: [] };
  if (lines.length === 0) {
    result.errors.push({ row: 1, message: "CSV is empty" });
    return result;
  }

  const headerCells = splitCsvLine(lines[0]!).map(norm);
  const kindIdx = headerCells.findIndex((h) =>
    ["kind", "type", "parkingtype", "parkingkind"].includes(h),
  );
  const wingIdx = headerCells.findIndex((h) =>
    ["wing", "wingname", "section"].includes(h),
  );
  const slotIdx = headerCells.findIndex((h) =>
    ["slotnumber", "parking", "parkingnumber", "number", "slot"].includes(h),
  );
  if (kindIdx < 0 || slotIdx < 0) {
    result.errors.push({
      row: 1,
      message: "Header must include kind and slotNumber",
    });
    return result;
  }

  for (let i = 1; i < lines.length; i += 1) {
    const rowNum = i + 1;
    const cells = splitCsvLine(lines[i]!);
    const kindRaw = (cells[kindIdx] ?? "").toLowerCase();
    const kind = kindRaw === "puzzle" || kindRaw === "open" ? kindRaw : null;
    const wing = wingIdx >= 0 ? (cells[wingIdx] ?? "").trim() : "";
    const rawSlot = cells[slotIdx] ?? "";
    if (!kind) {
      result.errors.push({
        row: rowNum,
        message: "Kind must be puzzle or open",
      });
      continue;
    }
    if (!rawSlot) {
      result.errors.push({ row: rowNum, message: "Parking number is required" });
      continue;
    }
    if (kind === "puzzle" && !wing) {
      result.errors.push({ row: rowNum, message: "Wing is required for puzzle parking" });
      continue;
    }
    result.rows.push({
      kind,
      wing: wing || null,
      slotNumber: kind === "puzzle" ? stripWingPrefix(wing, rawSlot) : rawSlot,
    });
  }
  return result;
}

export const PARKING_CSV_TEMPLATE = `kind,wing,slotNumber
puzzle,A,101
puzzle,B,101
open,,12
open,,13
`;
