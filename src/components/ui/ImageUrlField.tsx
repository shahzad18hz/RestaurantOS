"use client";

import { ImageIcon, Link2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  placeholder?: string;
  aspect?: "square" | "wide";
};

export default function ImageUrlField({
  label = "Image URL",
  value,
  onChange,
  help = "Paste a direct HTTPS image link. A live preview appears before you save.",
  placeholder = "https://example.com/image.jpg",
  aspect = "wide",
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [value]);
  const trimmed = value.trim();
  const insecure = trimmed.startsWith("http://");
  const showPreview = Boolean(trimmed) && !failed && !insecure;

  return (
    <div className="erp-image-field">
      <div className="erp-image-field-copy">
        <label className="erp-field-label" htmlFor={`image-url-${label.replace(/\s+/g, "-").toLowerCase()}`}>{label}</label>
        <p>{help}</p>
      </div>
      <div className={`erp-image-field-layout ${aspect === "square" ? "is-square" : ""}`}>
        <div className="erp-image-input-wrap">
          <Link2 className="h-4 w-4" aria-hidden="true" />
          <input
            id={`image-url-${label.replace(/\s+/g, "-").toLowerCase()}`}
            type="url"
            inputMode="url"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <div className={`erp-image-preview ${aspect === "square" ? "is-square" : ""}`}>
          {showPreview ? (
            <img src={trimmed} alt={`${label} preview`} onError={() => setFailed(true)} />
          ) : (
            <div className="erp-image-placeholder">
              {failed || insecure ? <TriangleAlert className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
              <span>{insecure ? "Use an HTTPS image URL" : failed ? "Image could not be loaded" : "Live preview"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
