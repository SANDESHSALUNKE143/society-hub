export type ParsedFlatRow = {
  wing: string;
  floor: number;
  flatNumber: string;
};

export type FlatCsvResult = {
  rows: ParsedFlatRow[];
  errors: Array<{ row: number; message: string }>;
};

function norm(header: string) {
  return header.trim().toLowerCase().replace(/[\s_]+/g, "");
}

function splitCsvLine(line: string) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

/** Parse Manage bulk-upload CSV: wing, floor, flatNumber. */
export function parseFlatCsv(text: string): FlatCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const result: FlatCsvResult = { rows: [], errors: [] };
  if (lines.length === 0) {
    result.errors.push({ row: 1, message: "CSV is empty" });
    return result;
  }

  const headerCells = splitCsvLine(lines[0]!).map(norm);
  const wingIdx = headerCells.findIndex((h) =>
    ["wing", "wingname"].includes(h),
  );
  const floorIdx = headerCells.findIndex((h) => h === "floor");
  const flatIdx = headerCells.findIndex((h) =>
    ["flatnumber", "flat", "number"].includes(h),
  );
  if (wingIdx < 0 || floorIdx < 0 || flatIdx < 0) {
    result.errors.push({
      row: 1,
      message: "Header must include wing, floor, and flatNumber",
    });
    return result;
  }

  for (let i = 1; i < lines.length; i += 1) {
    const rowNum = i + 1;
    const cells = splitCsvLine(lines[i]!);
    const wing = cells[wingIdx] ?? "";
    const floorRaw = cells[floorIdx] ?? "";
    const flatNumber = cells[flatIdx] ?? "";
    if (!wing) {
      result.errors.push({ row: rowNum, message: "Wing is required" });
      continue;
    }
    if (!flatNumber) {
      result.errors.push({ row: rowNum, message: "Flat number is required" });
      continue;
    }
    const floor = Number(floorRaw);
    if (!Number.isInteger(floor) || floor < 0 || floor > 200) {
      result.errors.push({ row: rowNum, message: "Floor must be 0–200" });
      continue;
    }
    result.rows.push({ wing, floor, flatNumber });
  }
  return result;
}

export const FLAT_CSV_TEMPLATE = `wing,floor,flatNumber
A,3,101
A,3,102
B,1,201
`;
