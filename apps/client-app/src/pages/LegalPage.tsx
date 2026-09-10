import { Link } from "react-router-dom";
import { LEGAL_LINKS } from "../lib/legal-links";
import { LEGAL_COPY, type LegalPageId } from "./legal-copy";

export function LegalPage({ page }: { page: LegalPageId }) {
  const copy = LEGAL_COPY[page];
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <p className="font-display text-3xl text-[var(--leaf-dark)]">{copy.title}</p>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-black/70">
        {copy.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <nav className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link className="text-[var(--leaf)]" to={LEGAL_LINKS.home}>
          Home
        </Link>
        <Link className="text-[var(--leaf)]" to={LEGAL_LINKS.privacy}>
          Privacy Policy
        </Link>
        <Link className="text-[var(--leaf)]" to={LEGAL_LINKS.terms}>
          Terms of Service
        </Link>
        <Link className="text-[var(--leaf)]" to="/login">
          Sign in
        </Link>
      </nav>
    </div>
  );
}
