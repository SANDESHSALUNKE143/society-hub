import type { ResidentVehicleKind } from "@society-hub/types";
import {
  vehicleParkingQuotaMessage,
  vehiclesFromKindCount,
} from "@society-hub/types";

/** Parse a simple CSV (header row required). Supports quoted fields. */

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, ""),
  );
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  residentname: "name",
  phone: "phone",
  mobile: "phone",
  email: "email",
  flat: "flatNumber",
  flatnumber: "flatNumber",
  flatno: "flatNumber",
  wing: "wingName",
  wingname: "wingName",
  floor: "floor",
  parking: "parkingSlot",
  parkingslot: "parkingSlot",
  parkingslotnumber: "parkingSlot",
  isowner: "isOwner",
  owner: "isOwner",
  emergencycontact: "emergencyContact",
  emergency: "emergencyContact",
  vehicle: "vehicleNumber",
  vehiclenumber: "vehicleNumber",
  vehicle_no: "vehicleNumber",
  twowheelers: "twoWheelers",
  twowheeler: "twoWheelers",
  bikes: "twoWheelers",
  twowheelercount: "twoWheelerCount",
  bikecount: "twoWheelerCount",
  noofbikes: "twoWheelerCount",
  fourwheelers: "fourWheelers",
  fourwheeler: "fourWheelers",
  cars: "fourWheelers",
  fourwheelercount: "fourWheelerCount",
  carcount: "fourWheelerCount",
  noofcars: "fourWheelerCount",
  pnggasconnection: "pngGasConnection",
  png: "pngGasConnection",
  pnggas: "pngGasConnection",
  adults: "adultCount",
  adult: "adultCount",
  adultcount: "adultCount",
  noofadults: "adultCount",
  children: "childCount",
  child: "childCount",
  childcount: "childCount",
  kids: "childCount",
  seniorcitizens: "seniorCitizenCount",
  seniorcitizen: "seniorCitizenCount",
  senior: "seniorCitizenCount",
  seniors: "seniorCitizenCount",
  elderly: "seniorCitizenCount",
};

function parseBool(value: string | undefined): boolean | undefined {
  if (value == null || value === "") return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "owner"].includes(v)) return true;
  if (["0", "false", "no", "n", "tenant"].includes(v)) return false;
  return undefined;
}

export type ResidentCsvRow = {
  name: string;
  phone: string;
  email?: string | null;
  flatNumber: string;
  wingName?: string | null;
  floor?: number | null;
  parkingSlot?: string | null;
  isOwner?: boolean;
  emergencyContact?: string | null;
  vehicleNumber?: string | null;
  vehicles?: Array<{
    kind: ResidentVehicleKind;
    registrationNumber: string | null;
    parkingPurchased: boolean;
    parkingSlot?: string | null;
  }>;
  pngGasConnection?: boolean;
  adultCount?: number;
  childCount?: number;
  seniorCitizenCount?: number;
};

export type ResidentCsvParseResult = {
  rows: ResidentCsvRow[];
  errors: Array<{ row: number; message: string }>;
};

/** Map raw CSV rows into API import shape with client-side validation. */
export function mapResidentCsvRows(
  raw: Record<string, string>[],
): ResidentCsvParseResult {
  const rows: ResidentCsvRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  raw.forEach((rawRow, idx) => {
    const rowNum = idx + 2; // header is line 1
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      const canon = HEADER_ALIASES[key.replace(/\s+/g, "").toLowerCase()];
      if (canon) mapped[canon] = value;
    }

    if (!mapped.name) {
      errors.push({ row: rowNum, message: "Missing name" });
      return;
    }
    if (!mapped.phone || mapped.phone.replace(/\D/g, "").length < 10) {
      errors.push({ row: rowNum, message: "Phone must be at least 10 digits" });
      return;
    }
    if (!mapped.flatNumber) {
      errors.push({ row: rowNum, message: "Missing flat number" });
      return;
    }
    if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
      errors.push({ row: rowNum, message: "Invalid email" });
      return;
    }

    let floor: number | null = null;
    if (mapped.floor) {
      const n = Number(mapped.floor);
      if (!Number.isInteger(n) || n < 0) {
        errors.push({ row: rowNum, message: "Floor must be a non-negative integer" });
        return;
      }
      floor = n;
    }

    const isOwner = parseBool(mapped.isOwner);

    const row: ResidentCsvRow = {
      name: mapped.name,
      phone: mapped.phone.replace(/\D/g, "").slice(-12),
      email: mapped.email || null,
      flatNumber: mapped.flatNumber,
      wingName: mapped.wingName || null,
      floor,
      parkingSlot: mapped.parkingSlot || null,
      isOwner: isOwner ?? true,
    };
    if (mapped.emergencyContact !== undefined && mapped.emergencyContact !== "") {
      row.emergencyContact = mapped.emergencyContact;
    }
    if (mapped.vehicleNumber !== undefined && mapped.vehicleNumber !== "") {
      row.vehicleNumber = mapped.vehicleNumber;
    }
    const pngGasConnection = parseBool(mapped.pngGasConnection);
    if (pngGasConnection !== undefined) {
      row.pngGasConnection = pngGasConnection;
    }
    const adults = parseFamilyCount(mapped.adultCount, "Adult");
    if (adults.error) {
      errors.push({ row: rowNum, message: adults.error });
      return;
    }
    if (adults.value !== undefined) row.adultCount = adults.value;
    const children = parseFamilyCount(mapped.childCount, "Child");
    if (children.error) {
      errors.push({ row: rowNum, message: children.error });
      return;
    }
    if (children.value !== undefined) row.childCount = children.value;
    const seniors = parseFamilyCount(mapped.seniorCitizenCount, "Senior citizen");
    if (seniors.error) {
      errors.push({ row: rowNum, message: seniors.error });
      return;
    }
    if (seniors.value !== undefined) row.seniorCitizenCount = seniors.value;
    const two = parseVehicleField(
      mapped.twoWheelers,
      mapped.twoWheelerCount,
      "two_wheeler",
    );
    if (two.error) {
      errors.push({ row: rowNum, message: two.error });
      return;
    }
    const four = parseVehicleField(
      mapped.fourWheelers,
      mapped.fourWheelerCount,
      "four_wheeler",
    );
    if (four.error) {
      errors.push({ row: rowNum, message: four.error });
      return;
    }
    const vehicles = [...two.vehicles, ...four.vehicles];
    if (vehicles.length === 0 && row.vehicleNumber) {
      vehicles.push({
        kind: "four_wheeler",
        registrationNumber: row.vehicleNumber,
        parkingPurchased: false,
      });
    }
    if (vehicles.length) {
      const quotaError = vehicleParkingQuotaMessage(vehicles);
      if (quotaError) {
        errors.push({ row: rowNum, message: quotaError });
        return;
      }
      row.vehicles = vehicles;
    }
    rows.push(row);
  });

  return { rows, errors };
}

function parseFamilyCount(
  raw: string | undefined,
  label: string,
): { value?: number; error?: string } {
  if (!raw?.trim()) return {};
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n > 50) {
    return { error: `${label} count must be a whole number from 0 to 50` };
  }
  return { value: n };
}

function parseCount(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

function parseVehicleField(
  listOrCount: string | undefined,
  countOnly: string | undefined,
  kind: ResidentVehicleKind,
): { vehicles: NonNullable<ResidentCsvRow["vehicles"]>; error?: string } {
  const plates = parseVehicleList(listOrCount, kind);
  if (plates.length) return { vehicles: plates };
  const count = parseCount(countOnly) ?? parseCount(listOrCount);
  if (count == null) return { vehicles: [] };
  if (count > 20) {
    return {
      vehicles: [],
      error: `${kind === "two_wheeler" ? "Two-wheeler" : "Four-wheeler"} count cannot exceed 20`,
    };
  }
  return { vehicles: vehiclesFromKindCount(kind, count) };
}

function parseVehicleList(
  raw: string | undefined,
  kind: ResidentVehicleKind,
): NonNullable<ResidentCsvRow["vehicles"]> {
  if (!raw?.trim() || parseCount(raw) != null) return [];
  const out: NonNullable<ResidentCsvRow["vehicles"]> = [];
  for (const part of raw.split(";")) {
    const [plateRaw, flagRaw] = part.split("|").map((s) => s.trim());
    const plate = (plateRaw ?? "").replace(/\s+/g, "").toUpperCase();
    if (plate.length < 4) continue;
    const flag = (flagRaw ?? "").toLowerCase();
    out.push({
      kind,
      registrationNumber: plate,
      parkingPurchased: ["purchased", "yes", "true", "extra", "1"].includes(flag),
    });
  }
  return out;
}
