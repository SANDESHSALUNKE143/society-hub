import type { ChangeEvent, ReactNode } from "react";

function WebGlyph({ children, size = 32 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ width: size, height: size, display: "block", margin: "0 auto" }}
    >
      {children}
    </svg>
  );
}

export function ComplaintPhotoDropzone({
  id,
  testId,
  accept = "image/*,video/*",
  multiple = true,
  count = 0,
  label = "Add photos (optional)",
  hint = "JPG, PNG up to 5MB",
  onFiles,
}: {
  id: string;
  testId?: string;
  accept?: string;
  multiple?: boolean;
  count?: number;
  label?: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}) {
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.currentTarget.files ?? []));
  }

  return (
    <div className="sh-photo-field">
      <p className="sh-underline-label">{label}</p>
      <label className="sh-photo-drop" htmlFor={id}>
        <input
          id={id}
          data-testid={testId}
          className="sh-sr-only"
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onChange}
        />
        <WebGlyph>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.4" />
          <path d="m21 16-5.2-5.2a1.5 1.5 0 0 0-2.1 0L7 17" />
        </WebGlyph>
        <p className="sh-photo-drop-title">
          {count === 0 ? "Add photos" : `${count} photo(s) selected`}
        </p>
        <p className="sh-photo-drop-hint">{hint}</p>
      </label>
    </div>
  );
}
