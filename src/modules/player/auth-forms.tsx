"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveActionMessage } from "@/modules/localization/action-result";
import { useTranslations } from "@/modules/localization/provider";
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
  const t = useTranslations();
  if (!state?.message && !state?.code) return null;
  const text = resolveActionMessage(t, state);
  if (!text) return null;
  return (
    <p
      className={
        state.ok
          ? "text-sm text-[var(--brand-accent)]"
          : "text-sm text-red-300"
      }
      role={state.ok ? "status" : "alert"}
    >
      {text}
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
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contactType">{t("auth.signUpWith")}</Label>
        <select
          id="contactType"
          name="contactType"
          defaultValue="email"
          className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
        >
          <option value="email">{t("auth.email")}</option>
          <option value="phone">{t("auth.phone")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
        <FieldError state={state} name="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t("auth.phone")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+85620..."
          autoComplete="tel"
        />
        <p className="text-xs text-[var(--brand-muted)]">
          {t("auth.phoneOtpWaiting")}
        </p>
        <FieldError state={state} name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nickname">{t("auth.nickname")}</Label>
        <Input
          id="nickname"
          name="nickname"
          required
          minLength={2}
          maxLength={24}
        />
        <FieldError state={state} name="nickname" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
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
        <legend className="text-sm font-medium">{t("auth.avatarPreset")}</legend>
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
        {pending ? t("auth.creatingAccount") : t("auth.createAccountCta")}
      </Button>
    </form>
  );
}

export function LoginForm({ action }: { action: AuthAction }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contactType">{t("auth.signInWith")}</Label>
        <select
          id="contactType"
          name="contactType"
          defaultValue="email"
          className="flex h-11 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
        >
          <option value="email">{t("auth.email")}</option>
          <option value="phone">{t("auth.phone")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
        <FieldError state={state} name="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t("auth.phone")}</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        <p className="text-xs text-[var(--brand-muted)]">
          {t("auth.phoneOtpWaiting")}
        </p>
        <FieldError state={state} name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
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
        {pending ? t("auth.signingIn") : t("auth.signInCta")}
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
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="contactType" value={contactType} />
      {email ? <input type="hidden" name="email" value={email} /> : null}
      {phone ? <input type="hidden" name="phone" value={phone} /> : null}
      {contactType === "phone" ? (
        <p className="text-xs text-[var(--brand-muted)]">
          {t("auth.phoneOtpWaiting")}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="token">{t("auth.otp")}</Label>
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
        {pending ? t("auth.verifying") : t("auth.verifyContinue")}
      </Button>
    </form>
  );
}

export function ResetRequestForm({ action }: { action: AuthAction }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <FieldError state={state} name="email" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("auth.sending") : t("auth.sendResetLink")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ action }: { action: AuthAction }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.newPassword")}</Label>
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
        <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
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
        {pending ? t("auth.updating") : t("auth.updatePassword")}
      </Button>
    </form>
  );
}
