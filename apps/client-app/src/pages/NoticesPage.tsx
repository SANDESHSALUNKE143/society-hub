import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NoticeAttachmentDto, NoticeDto, Paginated } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { ShFilterBar, ShPagination, ShSelect } from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

const PAGE_SIZE = 20;

function accessToken() {
  return localStorage.getItem("sh_web_access") ?? "";
}

function mediaSrc(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${encodeURIComponent(accessToken())}`;
}

function whatsappShareHref(n: NoticeDto) {
  const link = `${window.location.origin}/notices#${n.id}`;
  const preview =
    n.body.length > 400 ? `${n.body.slice(0, 400).trim()}…` : n.body.trim();
  const mediaNote =
    n.attachments.length > 0
      ? `\n\n(${n.attachments.length} photo/video in SocietyHub)`
      : "";
  const text = `*${n.title}*\n\n${preview}${mediaNote}\n\nOpen in SocietyHub:\n${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function audienceLabel(audience: string) {
  if (audience === "wing") return "Wing";
  if (audience === "flat") return "Flat";
  return "All residents";
}

function NoticeMedia({
  attachments,
  onRemove,
}: {
  attachments: NoticeAttachmentDto[];
  onRemove?: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="notice-media">
      {attachments.map((a) => (
        <div key={a.id} className="relative">
          {a.contentKind === "image" ? (
            <a href={mediaSrc(a.url)} target="_blank" rel="noreferrer">
              <img
                alt=""
                className="h-24 w-24 rounded-lg border border-[var(--sand)] object-cover bg-white"
                src={mediaSrc(a.url)}
              />
            </a>
          ) : (
            <video
              className="h-24 w-36 rounded-lg border border-[var(--sand)] bg-black object-cover"
              controls
              src={mediaSrc(a.url)}
            />
          )}
          {onRemove && (
            <button
              type="button"
              className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-xs text-[var(--danger)] shadow"
              aria-label="Remove media"
              onClick={() => onRemove(a.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function PendingFilePreviews({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (file: File) => void;
}) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

  if (previews.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3" data-testid="notices-pending-previews">
      {previews.map((p) => (
        <div key={`${p.file.name}-${p.file.size}-${p.file.lastModified}`} className="w-28">
          <div className="relative">
            {p.kind === "image" ? (
              <img
                alt={p.file.name}
                className="h-24 w-28 rounded-lg border border-[var(--sand)] object-cover bg-white"
                src={p.url}
              />
            ) : (
              <video
                className="h-24 w-28 rounded-lg border border-[var(--sand)] bg-black object-cover"
                src={p.url}
                muted
                controls
              />
            )}
            <button
              type="button"
              className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-xs text-[var(--danger)] shadow"
              aria-label={`Remove ${p.file.name}`}
              onClick={() => onRemove(p.file)}
            >
              ×
            </button>
          </div>
          <p className="mt-1 truncate text-xs text-black/50" title={p.file.name}>
            {p.file.name}
          </p>
        </div>
      ))}
    </div>
  );
}

function NoticeAppearancePreview({
  title,
  body,
  audience,
  savedAttachments,
  pendingFiles,
}: {
  title: string;
  body: string;
  audience: string;
  savedAttachments: NoticeAttachmentDto[];
  pendingFiles: File[];
}) {
  const pendingUrls = useMemo(
    () =>
      pendingFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
      })),
    [pendingFiles],
  );

  useEffect(() => {
    return () => {
      for (const p of pendingUrls) URL.revokeObjectURL(p.url);
    };
  }, [pendingUrls]);

  const hasContent = title.trim() || body.trim() || savedAttachments.length > 0 || pendingUrls.length > 0;

  return (
    <div data-testid="notices-live-preview">
      <p className="text-sm font-medium text-[var(--leaf-dark)]">How residents will see it</p>
      <p className="mt-0.5 text-xs text-black/45">Live preview — matches the resident Notices screen.</p>
      <div className="mt-3 rounded-xl border border-[var(--sand)] bg-[#fffdfb] p-5">
        {!hasContent ? (
          <p className="text-sm text-black/45">Start typing a title or body to preview the notice.</p>
        ) : (
          <>
            <h3 className="font-semibold">{title.trim() || "Untitled notice"}</h3>
            {body.trim() ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-black/65">{body}</p>
            ) : (
              <p className="mt-1 text-sm italic text-black/35">No body yet</p>
            )}
            {(savedAttachments.length > 0 || pendingUrls.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {savedAttachments.map((a) =>
                  a.contentKind === "image" ? (
                    <img
                      key={a.id}
                      alt=""
                      className="h-24 w-24 rounded-lg border border-[var(--sand)] object-cover bg-white"
                      src={mediaSrc(a.url)}
                    />
                  ) : (
                    <video
                      key={a.id}
                      className="h-24 w-36 rounded-lg border border-[var(--sand)] bg-black object-cover"
                      controls
                      src={mediaSrc(a.url)}
                    />
                  ),
                )}
                {pendingUrls.map((p) =>
                  p.kind === "image" ? (
                    <img
                      key={`${p.file.name}-${p.file.size}`}
                      alt={p.file.name}
                      className="h-24 w-24 rounded-lg border border-[var(--sand)] object-cover bg-white"
                      src={p.url}
                    />
                  ) : (
                    <video
                      key={`${p.file.name}-${p.file.size}`}
                      className="h-24 w-36 rounded-lg border border-[var(--sand)] bg-black object-cover"
                      controls
                      muted
                      src={p.url}
                    />
                  ),
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-black/35">
              {audienceLabel(audience)} · Just now
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StaffNoticesView() {
  const { client } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paginated<NoticeDto> | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [formAttachments, setFormAttachments] = useState<NoticeAttachmentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  const items = data?.items ?? null;

  function startEdit(n: NoticeDto) {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setAudience(n.audience);
    setFormAttachments(n.attachments ?? []);
    setPendingFiles([]);
    setShowForm(true);
    setMessage(null);
  }

  function startNew() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setAudience("all");
    setFormAttachments([]);
    setPendingFiles([]);
    setShowForm(true);
    setMessage(null);
  }

  async function uploadFiles(noticeId: string, files: File[]) {
    let latest: NoticeDto | null = null;
    for (const file of files) {
      latest = await client.uploadNoticeAttachment(noticeId, file);
    }
    return latest;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("save");
    try {
      let notice: NoticeDto;
      if (editingId) {
        notice = await client.updateNotice(editingId, { title, body });
      } else {
        notice = await client.createNotice({ title, body, audience });
      }
      if (pendingFiles.length > 0) {
        const withMedia = await uploadFiles(notice.id, pendingFiles);
        if (withMedia) notice = withMedia;
      }
      setShowForm(false);
      setPendingFiles([]);
      setMessage(editingId ? "Notice saved." : "Draft created. Publish when ready, or share after publish.");
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to save notice");
    } finally {
      setBusy(null);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!editingId) return;
    setBusy(attachmentId);
    setError(null);
    try {
      const next = await client.deleteNoticeAttachment(editingId, attachmentId);
      setFormAttachments(next.attachments);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to remove media");
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish(n: NoticeDto) {
    setBusy(n.id);
    setError(null);
    try {
      if (n.publishedAt && !n.unpublishedAt) {
        await client.unpublishNotice(n.id);
        setMessage("Notice unpublished.");
      } else {
        await client.publishNotice(n.id);
        setMessage("Notice published. You can share it on WhatsApp.");
      }
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to update notice");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl">Notices</h1>
          <p className="mt-1 text-sm text-black/55">
            Publish announcements with optional photos or videos. Share a WhatsApp message to
            residents or society groups after publish.
          </p>
        </div>
        <button type="button" data-testid="notices-add-toggle" className="btn btn-primary text-sm" onClick={startNew}>
          New notice
        </button>
      </div>

      {showForm && (
        <form className="card mb-6 p-5" data-testid="notices-form" onSubmit={submit}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
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
              <div>
                <label className="label" htmlFor="notice-media-file">Photos / videos (optional)</label>
                <input
                  id="notice-media-file"
                  data-testid="notices-media-file"
                  className="input"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setPendingFiles((prev) => [...prev, ...files].slice(0, 5));
                    e.target.value = "";
                  }}
                />
                <p className="mt-1 text-xs text-black/45">
                  Images up to 10MB, videos up to 50MB. Max 5 files per notice.
                </p>
                <PendingFilePreviews
                  files={pendingFiles}
                  onRemove={(file) => setPendingFiles((prev) => prev.filter((x) => x !== file))}
                />
                <NoticeMedia
                  attachments={formAttachments}
                  onRemove={editingId ? (id) => void removeAttachment(id) : undefined}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" data-testid="notices-submit" type="submit" disabled={busy === "save"}>
                  {editingId ? "Save changes" : "Create draft"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </div>

            <NoticeAppearancePreview
              title={title}
              body={body}
              audience={audience}
              savedAttachments={formAttachments}
              pendingFiles={pendingFiles}
            />
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

      {message && <p className="mb-4 text-sm text-[var(--leaf)]">{message}</p>}
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
                <div key={n.id} id={n.id} className="card p-5" data-testid="notice-card">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{n.title}</h3>
                    <span className={`badge ${published ? "badge-success" : ""}`}>
                      {published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-black/60">{n.body}</p>
                  <NoticeMedia attachments={n.attachments ?? []} />
                  <p className="mt-2 text-xs uppercase tracking-wide text-black/35">{n.audience}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
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
                    {published && (
                      <a
                        className="btn btn-primary btn-sm"
                        data-testid="notice-whatsapp-share"
                        href={whatsappShareHref(n)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Share on WhatsApp
                      </a>
                    )}
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

function ResidentNoticesView() {
  const { client } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paginated<NoticeDto> | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(params.get("search") ?? "");

  const query = useMemo(
    () => ({
      page: Number(params.get("page") ?? 1),
      limit: PAGE_SIZE,
      search: params.get("search") ?? undefined,
      sort: (params.get("sort") ?? "createdAt") as "createdAt" | "publishedAt" | "title",
      order: (params.get("order") ?? "desc") as "asc" | "desc",
    }),
    [params],
  );

  useEffect(() => {
    client
      .listNotices(query)
      .then((page) => {
        setData(page);
        const hash = window.location.hash.replace(/^#/, "");
        if (hash) {
          void client.markNoticeRead(hash).catch(() => undefined);
        }
      })
      .catch((err) => {
        setData({ items: [], page: query.page, limit: query.limit, total: 0 });
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }, [client, query]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const items = data?.items ?? null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Notices</h1>
        <p className="mt-1 text-sm text-black/55">
          Announcements from your society — including photos and videos when the office adds them.
        </p>
      </div>

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
          Notices aren't live yet — this screen will populate automatically once they are.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="notices-empty">No notices right now.</div>
      ) : (
        <>
          <div className="space-y-3" data-testid="notices-list">
            {items.map((n) => (
              <div key={n.id} id={n.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{n.title}</h3>
                  <a
                    className="btn btn-ghost btn-sm"
                    data-testid="notice-whatsapp-share"
                    href={whatsappShareHref(n)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share on WhatsApp
                  </a>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-black/65">{n.body}</p>
                <NoticeMedia attachments={n.attachments ?? []} />
                <p className="mt-2 text-xs text-black/35">
                  {n.publishedAt ? new Date(n.publishedAt).toLocaleString() : ""}
                </p>
              </div>
            ))}
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

export function NoticesPage() {
  const { user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  return staffView ? <StaffNoticesView /> : <ResidentNoticesView />;
}
