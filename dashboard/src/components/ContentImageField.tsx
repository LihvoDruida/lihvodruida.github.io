"use client";

import { useEffect, useId, useMemo, useState } from "react";

type ContentImageFieldProps = {
  label: string;
  hint: string;
  currentImage?: string;
};

function readableFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  const units = ["B", "KB", "MB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function ContentImageField({ label, hint, currentImage }: ContentImageFieldProps) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasCurrentImage = Boolean(currentImage);
  const previewSrc = previewUrl || currentImage || "";
  const previewLabel = useMemo(() => {
    if (file) return `${file.name} • ${readableFileSize(file.size)}`;
    if (currentImage) return currentImage;
    return "Картинку ще не вибрано";
  }, [currentImage, file]);

  return (
    <div className="content-field content-field--upload">
      <span>{label}</span>
      {hasCurrentImage ? <input type="hidden" name="existingImage" value={currentImage} /> : null}

      <div className="image-field-shell">
        <label className="image-upload-control" htmlFor={inputId}>
          <input
            id={inputId}
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="image-upload-icon" aria-hidden="true">+</span>
          <span className="image-upload-text">
            <strong>{file || currentImage ? "Замінити картинку" : "Додати картинку"}</strong>
            <small>{hint}</small>
          </span>
        </label>

        <div className={`image-preview-card${previewSrc ? " has-image" : ""}`} aria-live="polite">
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt="Превʼю обкладинки" />
          ) : (
            <div className="image-preview-placeholder" aria-hidden="true">IMG</div>
          )}
          <div className="image-preview-meta">
            <strong>Превʼю обкладинки</strong>
            <small>{previewLabel}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
