"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVATAR_PRESETS,
  type ActionResult,
} from "@/modules/player/auth-shared";

type AuthAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export type { ActionResult };

function FormMessage({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      className={
        state.ok
          ? "text-sm text-[var(--brand-accent)]"
          : "text-sm text-red-300"
      }
      role={state.ok ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

function FieldError({
  state,
  name,
}: {
  state: ActionResult | null;
  name: string;
}) {
  const errors = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  if (!errors?.length) return null;
  return <p className="text-xs text-red-300">{errors[0]}</p>;
}

export function RegisterForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contactType">Sign up with</Label>
        <select
          id="contactType"
          name="contactType"
          defaultValue="email"
          className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
        <FieldError state={state} name="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (E.164)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+85620..."
          autoComplete="tel"
        />
        <FieldError state={state} name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nickname">Nickname</Label>
        <Input id="nickname" name="nickname" required minLength={2} maxLength={32} />
        <FieldError state={state} name="nickname" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <FieldError state={state} name="password" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Avatar preset</legend>
        <div className="grid grid-cols-3 gap-2">
          {AVATAR_PRESETS.map((preset, index) => (
            <label
              key={preset.id}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="avatarPresetId"
                value={preset.id}
                defaultChecked={index === 0}
              />
              {preset.label}
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function LoginForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contactType">Sign in with</Label>
        <select
          id="contactType"
          name="contactType"
          defaultValue="email"
          className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
        <FieldError state={state} name="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        <FieldError state={state} name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <FieldError state={state} name="password" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function VerifyForm({
  action,
  contactType,
  email,
  phone,
}: {
  action: AuthAction;
  contactType: "email" | "phone";
  email?: string;
  phone?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="contactType" value={contactType} />
      {email ? <input type="hidden" name="email" value={email} /> : null}
      {phone ? <input type="hidden" name="phone" value={phone} /> : null}
      <div className="space-y-2">
        <Label htmlFor="token">6-digit code</Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoComplete="one-time-code"
        />
        <FieldError state={state} name="token" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Verifying…" : "Verify and continue"}
      </Button>
    </form>
  );
}

export function ResetRequestForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        <FieldError state={state} name="email" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <FieldError state={state} name="password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <FieldError state={state} name="confirmPassword" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
