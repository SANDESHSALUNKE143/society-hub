import type { FlatDto } from "@society-hub/types";

export type WingFlatRow = Pick<FlatDto, "id" | "number" | "wingName">;

export function wingKey(flat: Pick<WingFlatRow, "wingName">): string {
  return (flat.wingName ?? "").trim();
}

export function wingLabel(wing: string): string {
  return wing || "No wing";
}

export function uniqueWingNames(flats: WingFlatRow[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const flat of flats) {
    const key = wingKey(flat);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(key);
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function flatsInWing(flats: WingFlatRow[], wing: string): WingFlatRow[] {
  return flats
    .filter((flat) => wingKey(flat) === wing)
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true }),
    );
}

export function firstFlatIdInWing(flats: WingFlatRow[], wing: string): string {
  return flatsInWing(flats, wing)[0]?.id ?? "";
}

export function wingForFlatId(flats: WingFlatRow[], flatId: string): string {
  const selected = flats.find((flat) => flat.id === flatId);
  return selected ? wingKey(selected) : (uniqueWingNames(flats)[0] ?? "");
}
