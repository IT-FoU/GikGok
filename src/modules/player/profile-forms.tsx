"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function AvatarUploadForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="avatar">Upload JPG/PNG/WebP (max 2 MB)</Label>
        <Input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required />
      </div>
      <Message state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Uploading…" : "Upload avatar"}
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
