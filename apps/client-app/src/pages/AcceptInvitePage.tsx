import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@society-hub/sdk";
import { ShField, ShPage, ShPageHeader, ShSection } from "@society-hub/ui";
import { useAuth } from "../auth";

type InvitePreview = Awaited<
  ReturnType<ReturnType<typeof useAuth>["client"]["getInvitation"]>
>;

/**
 * Public invitation landing page. The token in the link is the credential, so
 * this route sits outside the authenticated shell.
 */
export function AcceptInvitePage() {
  const { client } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This link is missing its invitation token.");
      setLoading(false);
      return;
    }
    client
      .getInvitation(token)
      .then((next) => {
        setInvite(next);
        setName(next.name ?? "");
        setPhone(next.phone ?? "");
      })
      .catch((err) =>
        setError(
          err instanceof ApiClientError
            ? err.body.message
            : "This invitation could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  }, [client, token]);

  async function accept(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.acceptInvitation({
        token,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setAccepted(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.body.message : "Could not accept the invitation",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-8">Loading…</p>;

  if (accepted) {
    return (
      <ShPage>
        <ShPageHeader
          title="You're in"
          description={`Welcome to ${invite?.societyName ?? "your society"}.`}
        />
        <ShSection testId="invite-accepted">
          <p className="text-sm">
            Your membership has been created and is now awaiting verification by a
            society admin. Sign in with your phone number to see its status.
          </p>
          <Link className="btn btn-primary mt-3" to="/login">
            Sign in
          </Link>
        </ShSection>
      </ShPage>
    );
  }

  if (error && !invite) {
    return (
      <ShPage>
        <ShPageHeader title="Invitation" />
        <ShSection testId="invite-error">
          <p className="text-sm text-[var(--danger)]">{error}</p>
          <Link className="btn btn-ghost mt-3" to="/login">
            Go to sign in
          </Link>
        </ShSection>
      </ShPage>
    );
  }

  return (
    <ShPage>
      <ShPageHeader
        title={`Join ${invite?.societyName ?? "your society"}`}
        description={
          invite?.flatNumber
            ? `You have been invited to flat ${invite.flatNumber} as ${
                invite.residentType ?? invite.role
              }.`
            : `You have been invited as ${invite?.role}.`
        }
      />
      <ShSection title="Confirm your details" testId="invite-form">
        <form className="space-y-2.5" onSubmit={accept}>
          <ShField label="Full name" htmlFor="invite-name">
            <input
              id="invite-name"
              className="input"
              value={name}
              required
              data-testid="invite-name"
              onChange={(e) => setName(e.target.value)}
            />
          </ShField>
          <ShField label="Phone" htmlFor="invite-phone">
            <input
              id="invite-phone"
              className="input"
              value={phone}
              required
              data-testid="invite-phone"
              onChange={(e) => setPhone(e.target.value)}
            />
          </ShField>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            data-testid="invite-accept"
          >
            {busy ? "Accepting…" : "Accept invitation"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        {invite?.expiresAt && (
          <p className="mt-2 text-xs text-black/45">
            This invitation expires on {invite.expiresAt.slice(0, 10)}.
          </p>
        )}
      </ShSection>
    </ShPage>
  );
}
