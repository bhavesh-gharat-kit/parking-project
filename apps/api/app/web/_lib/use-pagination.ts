'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Page state for a list screen, to pair with `<Pagination>`.
 *
 *  - `setPage` scrolls back to the top so a new page starts at its first row.
 *  - `changePageSize` and `resetPage` return to page 1 — call `resetPage` from
 *    any filter/search change, otherwise page 7 of the old filter is requested.
 *  - `begin()` / `isCurrent(id)` drop a response that arrives after a newer
 *    request was started (fast page clicks must not show a stale page).
 */
export function usePagination(initialPageSize = 20) {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const seq = useRef(0);

  const setPage = useCallback((next: number) => {
    setPageState(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const changePageSize = useCallback((next: number) => {
    setPageSizeState(next);
    setPageState(1);
  }, []);

  const resetPage = useCallback(() => setPageState(1), []);

  const begin = useCallback(() => ++seq.current, []);
  const isCurrent = useCallback((id: number) => id === seq.current, []);

  return { page, pageSize, setPage, changePageSize, resetPage, begin, isCurrent };
}
