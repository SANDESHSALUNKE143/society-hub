import { describe, expect, it } from "vitest";
import { FLATS_PAGE_SIZE, paginateItems } from "./flat-list";

describe("paginateItems", () => {
  it("returns an empty first page", () => {
    const result = paginateItems([], 1);
    expect(result).toMatchObject({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
      pageSize: FLATS_PAGE_SIZE,
    });
  });

  it("clamps an out-of-range page and slices the current page", () => {
    const rows = Array.from({ length: 12 }, (_, i) => i + 1);
    const page2 = paginateItems(rows, 2);
    expect(page2.items).toEqual([11, 12]);
    expect(page2.page).toBe(2);
    expect(page2.pageCount).toBe(2);
    expect(page2.from).toBe(11);
    expect(page2.to).toBe(12);
    expect(paginateItems(rows, 99).page).toBe(2);
    expect(paginateItems(rows, 0).page).toBe(1);
  });
});
