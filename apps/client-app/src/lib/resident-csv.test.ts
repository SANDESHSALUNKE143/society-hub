import { describe, expect, it } from "vitest";
import { mapResidentCsvRows, parseCsv } from "./resident-csv";

describe("resident-csv", () => {
  it("parses header aliases and validates rows", () => {
    const text = `Name,Mobile,Email,Flat No,Wing,Floor,Parking
Asha,9999999999,asha@example.com,101,A,1,P-1
,8888888888,,102,A,1,
Bad,,x,103,A,2,`;
    const raw = parseCsv(text);
    expect(raw).toHaveLength(3);
    const mapped = mapResidentCsvRows(raw);
    expect(mapped.rows).toHaveLength(1);
    expect(mapped.rows[0]).toMatchObject({
      name: "Asha",
      phone: "9999999999",
      flatNumber: "101",
      wingName: "A",
      floor: 1,
      parkingSlot: "P-1",
    });
    expect(mapped.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("maps owner, PNG, and extra two-wheelers", () => {
    const text = `name,phone,flatNumber,isOwner,emergencyContact,twoWheelers,pngGasConnection
Bala,8888888888,202,no,9111111111,MH12TW0001;MH12TW0002;MH12TW0003|purchased,yes`;
    const mapped = mapResidentCsvRows(parseCsv(text));
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0]).toMatchObject({
      isOwner: false,
      emergencyContact: "9111111111",
      pngGasConnection: true,
    });
    expect(mapped.rows[0]!.vehicles).toEqual([
      { kind: "two_wheeler", registrationNumber: "MH12TW0001", parkingPurchased: false },
      { kind: "two_wheeler", registrationNumber: "MH12TW0002", parkingPurchased: false },
      { kind: "two_wheeler", registrationNumber: "MH12TW0003", parkingPurchased: true },
    ]);
  });

  it("rejects a third two-wheeler without purchased parking", () => {
    const text = `name,phone,flatNumber,twoWheelers
Bala,8888888888,202,MH12TW0001;MH12TW0002;MH12TW0003`;
    const mapped = mapResidentCsvRows(parseCsv(text));
    expect(mapped.rows).toEqual([]);
    expect(mapped.errors[0]?.message).toMatch(/purchased parking/);
  });

  it("maps two-wheeler and four-wheeler counts without registration numbers", () => {
    const text = `name,phone,flatNumber,twoWheelers,fourWheelers
Bala,8888888888,202,2,1`;
    const mapped = mapResidentCsvRows(parseCsv(text));
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0]!.vehicles).toEqual([
      { kind: "two_wheeler", registrationNumber: null, parkingPurchased: false },
      { kind: "two_wheeler", registrationNumber: null, parkingPurchased: false },
      { kind: "four_wheeler", registrationNumber: null, parkingPurchased: false },
    ]);
  });

  it("treats count-only extras as purchased parking", () => {
    const text = `name,phone,flatNumber,twoWheelerCount,fourWheelerCount
Bala,8888888888,202,3,2`;
    const mapped = mapResidentCsvRows(parseCsv(text));
    expect(mapped.errors).toEqual([]);
    const tw = mapped.rows[0]!.vehicles!.filter((v) => v.kind === "two_wheeler");
    const fw = mapped.rows[0]!.vehicles!.filter((v) => v.kind === "four_wheeler");
    expect(tw).toHaveLength(3);
    expect(tw[2]?.parkingPurchased).toBe(true);
    expect(fw).toHaveLength(2);
    expect(fw[1]?.parkingPurchased).toBe(true);
  });

  it("maps adult, child, and senior citizen counts", () => {
    const text = `name,phone,flatNumber,adults,children,seniorCitizens
Bala,8888888888,202,2,1,1`;
    const mapped = mapResidentCsvRows(parseCsv(text));
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0]).toMatchObject({
      adultCount: 2,
      childCount: 1,
      seniorCitizenCount: 1,
    });
  });
});
