import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NoticeDto, Paginated } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { ShFilterBar, ShPagination, ShSelect } from "@society-hub/ui";
import { useAuth } from "../auth";

const PAGE_SIZE = 20;

export function NoticesPage() {
  const { client } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paginated<NoticeDto> | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(params.get("search") ?? "");

  const query = useMemo(
    () => ({
      page: Number(params.get("page") ?? 1),
      limit: PAGE_SIZE,
      search: params.get("search") ?? undefined,
      status: (params.get("status") || undefined) as "published" | "draft" | undefined,
      sort: (params.get("sort") ?? "createdAt") as "createdAt" | "publishedAt" | "title",
      order: (params.get("order") ?? "desc") as "asc" | "desc",
    }),
    [params],
  );

  const load = useCallback(() => {
    client
      .listNotices(query)
      .then(setData)
      .catch((err) => {
        setData({ items: [], page: query.page, limit: query.limit, total: 0 });
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }, [client, query]);

  useEffect(load, [load]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  function startEdit(n: NoticeDto) {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setAudience(n.audience);
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setAudience("all");
    setShowForm(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await client.updateNotice(editingId, { title, body });
      } else {
        await client.createNotice({ title, body, audience });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to save notice");
    }
  }

  async function togglePublish(n: NoticeDto) {
    setBusy(n.id);
    setError(null);
    try {
      if (n.publishedAt && !n.unpublishedAt) await client.unpublishNotice(n.id);
      else await client.publishNotice(n.id);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to update notice");
    } finally {
      setBusy(null);
    }
  }

  const items = data?.items ?? null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Notices</h1>
          <p className="mt-1 text-sm text-black/55">Publish society announcements.</p>
        </div>
        <button type="button" data-testid="notices-add-toggle" className="btn btn-primary text-sm" onClick={startNew}>
          New notice
        </button>
      </div>

      {showForm && (
        <form className="card mb-6 space-y-4 p-5" data-testid="notices-form" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="body">Body</label>
            <textarea id="body" className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          {!editingId && (
            <div className="max-w-xs">
              <label className="label" htmlFor="audience">Audience</label>
              <select id="audience" className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">All residents</option>
                <option value="wing">A wing</option>
                <option value="flat">A flat</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary" data-testid="notices-submit" type="submit">
              {editingId ? "Save changes" : "Create draft"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <ShFilterBar testId="notices-filters">
        <div className="sh-field min-w-[14rem] flex-1">
          <label className="label" htmlFor="notice-search">
            Search
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam("search", searchDraft.trim());
            }}
          >
            <input
              id="notice-search"
              className="input"
              placeholder="Title or body"
              value={searchDraft}
              data-testid="notices-search"
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </form>
        </div>
        <ShSelect
          label="Status"
          id="notice-status"
          testId="notices-filter-status"
          value={query.status ?? ""}
          onChange={(v) => setParam("status", v)}
          options={[
            { value: "", label: "All" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]}
        />
        <ShSelect
          label="Sort by"
          id="notice-sort"
          testId="notices-sort"
          value={query.sort}
          onChange={(v) => setParam("sort", v)}
          options={[
            { value: "createdAt", label: "Created" },
            { value: "publishedAt", label: "Published" },
            { value: "title", label: "Title" },
          ]}
        />
        <ShSelect
          label="Order"
          id="notice-order"
          testId="notices-order"
          value={query.order}
          onChange={(v) => setParam("order", v)}
          options={[
            { value: "desc", label: "Newest first" },
            { value: "asc", label: "Oldest first" },
          ]}
        />
      </ShFilterBar>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Notices API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="notices-empty">No notices yet.</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((n) => {
              const published = Boolean(n.publishedAt && !n.unpublishedAt);
              return (
                <div key={n.id} className="card p-5" data-testid="notice-card">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{n.title}</h3>
                    <span className={`badge ${published ? "badge-success" : ""}`}>
                      {published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-black/60">{n.body}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-black/35">{n.audience}</p>
                  <div className="mt-4 flex gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(n)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-testid="notice-toggle-publish"
                      disabled={busy === n.id}
                      onClick={() => void togglePublish(n)}
                    >
                      {published ? "Unpublish" : "Publish"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {data && (
            <ShPagination
              page={data.page}
              limit={data.limit}
              total={data.total}
              onPageChange={(page) => setParam("page", String(page))}
              testId="notices-pagination"
            />
          )}
        </>
      )}
    </div>
  );
}
