'use client';

type PaginationProps = {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total rows across all pages (the server's `Paginated.total`). */
  total: number;
  onPageChange: (page: number) => void;
  /** When given, a "per page" selector is shown. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Dims and disables the controls while the next page loads. */
  disabled?: boolean;
};

const DEFAULT_SIZES = [10, 20, 50];

/**
 * The page numbers to render: always first and last, a window around the current
 * page, and `'gap'` where numbers are skipped — e.g. 1 … 4 5 6 … 20.
 */
export function pageWindow(current: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (current >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

/**
 * Shared pager for every list on the website. Pure presentation: the parent owns
 * `page`/`pageSize` (see `usePagination`) and refetches on change. Renders
 * nothing for an empty list, and only the "Showing x–y of N" line when
 * everything fits on one page. On narrow screens the numbered buttons collapse
 * to Prev / "Page x of y" / Next.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_SIZES,
  disabled = false,
}: PaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const go = (n: number) => {
    if (!disabled && n >= 1 && n <= totalPages && n !== current) onPageChange(n);
  };
  const sizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <nav className={`pager${disabled ? ' pager-busy' : ''}`} aria-label="Pagination">
      <p className="pager-info text-small text-secondary">
        Showing {from}–{to} of {total}
      </p>

      {totalPages > 1 ? (
        <div className="pager-controls">
          <button
            type="button"
            className="pager-btn"
            onClick={() => go(current - 1)}
            disabled={disabled || current === 1}
            aria-label="Previous page"
          >
            ‹ Prev
          </button>

          <span className="pager-compact text-small">
            Page {current} of {totalPages}
          </span>

          <span className="pager-numbers">
            {pageWindow(current, totalPages).map((item, index) =>
              item === 'gap' ? (
                <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`pager-btn${item === current ? ' pager-current' : ''}`}
                  onClick={() => go(item)}
                  disabled={disabled}
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? 'page' : undefined}
                >
                  {item}
                </button>
              ),
            )}
          </span>

          <button
            type="button"
            className="pager-btn"
            onClick={() => go(current + 1)}
            disabled={disabled || current === totalPages}
            aria-label="Next page"
          >
            Next ›
          </button>
        </div>
      ) : null}

      {onPageSizeChange ? (
        <label className="pager-size text-small text-secondary">
          Per page
          <select
            className="select"
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </nav>
  );
}
