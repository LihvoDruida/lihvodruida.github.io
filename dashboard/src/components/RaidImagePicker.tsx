"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RaidImageAsset = {
  name: string;
  path: string;
  url: string;
  size?: number | null;
};

type RaidImagesResponse = {
  ok?: boolean;
  images?: RaidImageAsset[];
  error?: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function readableName(name: string) {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || name;
}

function sameUrl(a?: string | null, b?: string | null) {
  return String(a || "").trim() === String(b || "").trim();
}

export default function RaidImagePicker({ defaultValue = "" }: { defaultValue?: string | null }) {
  const [value, setValue] = useState(String(defaultValue || ""));
  const [images, setImages] = useState<RaidImageAsset[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");

  const selected = useMemo(() => images.find((image) => sameUrl(image.url, value)), [images, value]);

  const loadImages = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/raids/images", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as RaidImagesResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не вдалося отримати список зображень.");
      }
      setImages(Array.isArray(data.images) ? data.images : []);
      setState("ready");
    } catch (loadError) {
      setImages([]);
      setError(loadError instanceof Error ? loadError.message : "Не вдалося отримати список зображень.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  return (
    <div className="raid-image-picker field-label">
      <span>Зображення оголошення</span>
      <div className="raid-image-picker__input-row">
        <input
          className="input"
          name="imageUrl"
          placeholder="https://..."
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        <button className="btn subtle raid-image-picker__refresh" type="button" onClick={() => void loadImages()} disabled={state === "loading"}>
          {state === "loading" ? "Оновлення…" : "Оновити"}
        </button>
      </div>
      <small>Можна вставити URL вручну або вибрати картинку з репозиторію.</small>
      {error ? <small className="raid-image-picker__error">{error}</small> : null}
      {state === "ready" && images.length === 0 ? <small className="raid-image-picker__empty">У папці зображень нічого не знайдено.</small> : null}
      {images.length ? (
        <div className="raid-image-picker__grid" aria-label="Зображення рейдів">
          {images.map((image) => {
            const active = sameUrl(image.url, value);
            return (
              <button
                key={image.path}
                type="button"
                className={`raid-image-picker__item${active ? " is-selected" : ""}`}
                onClick={() => setValue(image.url)}
                aria-pressed={active}
                title={image.name}
              >
                <span className="raid-image-picker__preview">
                  <img src={image.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                </span>
                <span className="raid-image-picker__meta">
                  <strong>{readableName(image.name)}</strong>
                  {active ? <em>Вибрано</em> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {selected ? <small className="raid-image-picker__selected">Вибрано: {selected.name}</small> : null}
    </div>
  );
}
