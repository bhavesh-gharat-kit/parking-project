'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { AdminUser, Paginated } from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { Pagination } from '../../_components/Pagination';
import { Pill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';
import { usePagination } from '../../_lib/use-pagination';

export default function AdminUsersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, changePageSize, resetPage, begin, isCurrent } = usePagination(20);

  const load = useCallback(async () => {
    const requestId = begin();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      const result = await apiRequest<Paginated<AdminUser>>(`/api/admin/users?${params.toString()}`);
      if (!isCurrent(requestId)) return;
      setUsers(result.items);
      setTotal(result.total);
    } catch (error) {
      if (isCurrent(requestId)) setLoadError(errorMessage(error, 'Could not load users.'));
    } finally {
      if (isCurrent(requestId)) setLoading(false);
    }
  }, [search, page, pageSize, begin, isCurrent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-search-change; the callback is stable via useCallback
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Users</h1>

      <form
        className="filter-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          resetPage();
        }}
      >
        <input
          className="input"
          placeholder="Search name, email or phone"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {users === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(users ?? []).map((user) => (
            <Link key={user.id} href={`/web/admin/users/${user.id}`} className="card-link">
              <div className="card">
                <div className="card-header-row">
                  <p className="text-small-bold">{user.name ?? '(no name on file)'}</p>
                  {user.isActive ? (
                    <span className="text-small text-secondary">{user.role}</span>
                  ) : (
                    <Pill label="Disabled" tone="bad" />
                  )}
                </div>
                <p className="text-small text-secondary">{user.email}</p>
              </div>
            </Link>
          ))}
          {users !== null && users.length === 0 ? <div className="empty-state">No users found.</div> : null}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={changePageSize}
        disabled={loading}
      />

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
