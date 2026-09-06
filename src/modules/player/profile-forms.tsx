"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "@/modules/localization/provider";
import { AVATAR_PRESETS, type ActionResult } from "@/modules/player/auth-shared";

type AuthAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

function Message({ state }: { state: ActionResult | null }) {
  if (!state?.message) return null;
  return (
    <p
      className={
        state.ok ? "text-sm text-[var(--brand-accent)]" : "text-sm text-red-300"
      }
      role={state.ok ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

export function ProfileForm({
  action,
  nickname,
  avatarPresetId,
}: {
  action: AuthAction;
  nickname: string;
  avatarPresetId: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nickname">Nickname</Label>
        <Input
          id="nickname"
          name="nickname"
          defaultValue={nickname}
          required
          minLength={2}
          maxLength={24}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Preset avatar</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AVATAR_PRESETS.map((preset) => (
            <label
              key={preset.id}
              className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="avatarPresetId"
                value={preset.id}
                defaultChecked={
                  avatarPresetId === preset.id ||
                  (!avatarPresetId && preset.id === "lotus")
                }
              />
              {preset.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

const AVATAR_EXPORT_SIZE = 512;

async function cropImageToSquareBlob(
  source: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
  mime: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas unavailable");
  }

  const minSide = Math.min(source.naturalWidth, source.naturalHeight);
  const cropSide = Math.max(32, minSide / zoom);
  const maxOffsetX = Math.max(0, source.naturalWidth - cropSide);
  const maxOffsetY = Math.max(0, source.naturalHeight - cropSide);
  const sx = Math.min(maxOffsetX, Math.max(0, (maxOffsetX * (offsetX + 50)) / 100));
  const sy = Math.min(maxOffsetY, Math.max(0, (maxOffsetY * (offsetY + 50)) / 100));

  ctx.drawImage(
    source,
    sx,
    sy,
    cropSide,
    cropSide,
    0,
    0,
    AVATAR_EXPORT_SIZE,
    AVATAR_EXPORT_SIZE,
  );

  const exportMime = mime === "image/png" || mime === "image/webp" ? mime : "image/jpeg";
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Crop export failed"));
        else resolve(blob);
      },
      exportMime,
      0.92,
    );
  });
}

export function AvatarUploadForm({ action }: { action: AuthAction }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState("image/jpeg");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <form
      action={async (formData) => {
        const image = imageRef.current;
        if (!image || !previewUrl) {
          formAction(formData);
          return;
        }
        try {
          const blob = await cropImageToSquareBlob(
            image,
            zoom,
            offsetX,
            offsetY,
            sourceMime,
          );
          const extension =
            sourceMime === "image/png"
              ? "png"
              : sourceMime === "image/webp"
                ? "webp"
                : "jpg";
          const cropped = new File([blob], `avatar.${extension}`, {
            type: blob.type || sourceMime,
          });
          formData.set("avatar", cropped);
        } catch {
          // Fall through with original file if crop fails.
        }
        formAction(formData);
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="avatar">{t("profile.avatarUploadHint")}</Label>
        <Input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (!file) {
              setPreviewUrl(null);
              return;
            }
            setSourceMime(file.type || "image/jpeg");
            setZoom(1);
            setOffsetX(0);
            setOffsetY(0);
            setPreviewUrl(URL.createObjectURL(file));
          }}
        />
      </div>
      {previewUrl ? (
        <div className="space-y-3">
          <div className="mx-auto h-40 w-40 overflow-hidden border border-[var(--brand-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={previewUrl}
              alt={t("profile.avatarPreview")}
              className="h-full w-full object-cover"
              style={{
                transform: `scale(${zoom}) translate(${offsetX}%, ${offsetY}%)`,
                transformOrigin: "center center",
              }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-[var(--brand-muted)]">
              {t("profile.avatarZoom")}
              <Input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--brand-muted)]">
              {t("profile.avatarPanX")}
              <Input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={offsetX}
                onChange={(event) => setOffsetX(Number(event.target.value))}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--brand-muted)]">
              {t("profile.avatarPanY")}
              <Input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={offsetY}
                onChange={(event) => setOffsetY(Number(event.target.value))}
              />
            </label>
          </div>
        </div>
      ) : null}
      <Message state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t("profile.avatarUploading") : t("profile.avatarUpload")}
      </Button>
    </form>
  );
}

export function SettingsForm({
  action,
  defaults,
}: {
  action: AuthAction;
  defaults: {
    language: string;
    soundPack: string;
    soundVolume: number;
    graphicsMode: string;
    graphicsQuality: string;
    fpsCap: number;
    shadowsEnabled: boolean;
    effectsEnabled: boolean;
    reduceMotion: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="language">Language</Label>
          <select
            id="language"
            name="language"
            defaultValue={defaults.language}
            className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="lo">Lao</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="soundPack">Sound pack</Label>
          <select
            id="soundPack"
            name="soundPack"
            defaultValue={defaults.soundPack}
            className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="classic_casino">Classic Casino</option>
            <option value="arcade">Arcade</option>
            <option value="silent">Silent</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="soundVolume">Volume ({defaults.soundVolume}%)</Label>
          <Input
            id="soundVolume"
            name="soundVolume"
            type="range"
            min={0}
            max={100}
            step={1}
            defaultValue={defaults.soundVolume}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="graphicsMode">Graphics</Label>
          <select
            id="graphicsMode"
            name="graphicsMode"
            defaultValue={defaults.graphicsMode}
            className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="auto">Auto</option>
            <option value="2d">2D</option>
            <option value="3d">3D</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="graphicsQuality">Quality</Label>
          <select
            id="graphicsQuality"
            name="graphicsQuality"
            defaultValue={defaults.graphicsQuality}
            className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fpsCap">FPS cap</Label>
          <select
            id="fpsCap"
            name="fpsCap"
            defaultValue={String(defaults.fpsCap)}
            className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="30">30</option>
            <option value="45">45</option>
            <option value="60">60</option>
            <option value="120">120</option>
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            {
              name: "shadowsEnabled",
              label: "Shadows",
              checked: defaults.shadowsEnabled,
            },
            {
              name: "effectsEnabled",
              label: "Effects",
              checked: defaults.effectsEnabled,
            },
            {
              name: "reduceMotion",
              label: "Reduce motion",
              checked: defaults.reduceMotion,
            },
          ] as const
        ).map((item) => (
          <label key={item.name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={item.name}
              defaultChecked={item.checked}
            />
            {item.label}
          </label>
        ))}
      </div>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export function DeletionForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-red-500/40 p-4">
      <p className="text-sm text-[var(--brand-muted)]">
        Request account deletion. Ledger and audit records are preserved. This
        cannot cash out or transfer demo credits.
      </p>
      <div className="space-y-2">
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input id="reason" name="reason" maxLength={500} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" required />
        I understand this requests account deletion
      </label>
      <Message state={state} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Submitting…" : "Request deletion"}
      </Button>
    </form>
  );
}
