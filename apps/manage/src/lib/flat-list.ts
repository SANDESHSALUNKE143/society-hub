export const FLATS_PAGE_SIZE = 10;

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize = FLATS_PAGE_SIZE,
): {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  from: number;
  to: number;
} {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    pageCount,
    total,
    pageSize,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}
