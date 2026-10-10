'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { ComplaintCategory } from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { Pill } from '../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../_lib/api';

export default function ComplaintCategoriesPage() {
  const [categories, setCategories] = useState<ComplaintCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await apiRequest<ComplaintCategory[]>('/api/admin/complaint-categories'));
    } catch (err) {
      setError(errorMessage(err, 'Could not load issue titles.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const sortOrder = (categories?.reduce((max, item) => Math.max(max, item.sortOrder), -1) ?? -1) + 1;
    void run(async () => {
      await apiRequest('/api/admin/complaint-categories', {
        method: 'POST',
        body: { title: newTitle, sortOrder, isActive: true },
      });
      setNewTitle('');
    });
  };

  const save = (category: ComplaintCategory, patch: Partial<ComplaintCategory>) =>
    run(async () => {
      const next = { ...category, ...patch };
      await apiRequest(`/api/admin/complaint-categories/${category.id}`, {
        method: 'PATCH',
        body: { title: next.title, sortOrder: next.sortOrder, isActive: next.isActive },
      });
      setEditingId(null);
    });

  return (
    <div className="stack-loose">
      <Link href="/web/admin/complaints" className="text-small">
        ← Complaints
      </Link>
      <h1 className="text-heading">Issue titles</h1>
      <p className="text-small text-secondary">
        These are the common issues customers pick from. &quot;Other&quot; is always offered as well. Titles can be
        disabled but not deleted, so existing complaints keep theirs.
      </p>

      {error ? <Banner kind="danger">{error}</Banner> : null}

      <form className="filter-row" onSubmit={add}>
        <input
          className="input"
          placeholder="New issue title"
          maxLength={120}
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || newTitle.trim().length < 3}>
          Add
        </button>
      </form>

      {categories === null && !error ? <div className="loading-center">Loading…</div> : null}

      <div className="stack">
        {(categories ?? []).map((category) => (
          <div className="card stack" key={category.id}>
            {editingId === category.id ? (
              <div className="filter-row">
                <input
                  className="input"
                  maxLength={120}
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void save(category, { title: editTitle })}
                >
                  Save
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="card-header-row">
                <p className="text-small-bold">
                  {category.title} {category.isActive ? null : <Pill label="Disabled" tone="bad" />}
                </p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingId(category.id);
                      setEditTitle(category.title);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void save(category, { isActive: !category.isActive })}
                  >
                    {category.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
