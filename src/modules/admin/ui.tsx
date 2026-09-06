"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveActionMessage } from "@/modules/localization/action-result";
import { useTranslations } from "@/modules/localization/provider";
import { ADMIN_PERMISSION_CODES } from "./index";
import type { ActionResult } from "@/modules/player/auth-shared";

import {
  advanceGameReleaseAction,
  assignAdminRoleAction,
  confirmAdminMfaEnrollAction,
  createAdminAccountAction,
  createGameVersionAction,
  exportReportAction,
  registerQaAccountAction,
  setAdmin2faAction,
  setAdminPinAction,
  setAdminStatusAction,
  setFeatureFlagAction,
  setMaintenanceAction,
  setPermissionOverrideAction,
  setPlayerStatusAction,
  setSystemSettingAction,
  startAdminMfaEnrollAction,
  updateTicketStatusAction,
  upsertAchievementAction,
  upsertAnnouncementAction,
  upsertAssetAction,
  upsertMissionAction,
  verifyAdmin2faAction,
  verifyAdminPinAction,
  retryStorageOrphanCleanupAction,
} from "./actions";

function Banner({ result }: { result: ActionResult | null }) {
  const t = useTranslations();
  if (!result?.message && !result?.code) return null;
  const text = resolveActionMessage(t, result);
  if (!text) return null;
  return (
    <p
      className={
        result.ok
          ? "text-sm text-[var(--brand-accent)]"
          : "text-sm text-red-400"
      }
      role="status"
    >
      {text}
    </p>
  );
}

function SensitiveFields() {
  const t = useTranslations();
  return (
    <div className="grid gap-2">
      <div>
        <Label htmlFor="pin">{t("admin.mfa.pinLabel")}</Label>
        <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" />
      </div>
      <p className="text-xs text-[var(--brand-muted)]">{t("admin.mfa.pinHint")}</p>
    </div>
  );
}

function useActionForm(
  action: (formData: FormData) => Promise<ActionResult>,
) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setResult(await action(formData));
    });
  }
  return { pending, result, onSubmit };
}

export function AdminSecurityForms() {
  const t = useTranslations();
  const pin = useActionForm(setAdminPinAction);
  const verifyPin = useActionForm(verifyAdminPinAction);
  const disableTwoFa = useActionForm(setAdmin2faAction);
  const verifyOtp = useActionForm(verifyAdmin2faAction);
  const confirmEnroll = useActionForm(confirmAdminMfaEnrollAction);
  const [enrollPending, startEnroll] = useTransition();
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string>("");
  const [qr, setQr] = useState<string>("");
  const [secret, setSecret] = useState<string>("");

  function beginEnroll() {
    setEnrollError(null);
    startEnroll(async () => {
      const result = await startAdminMfaEnrollAction();
      if (!result.ok) {
        setEnrollError(result.message ?? t("admin.mfa.enrollFailed"));
        return;
      }
      setFactorId(result.factorId ?? "");
      setQr(result.qr ?? "");
      setSecret(result.secret ?? "");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-3" onSubmit={pin.onSubmit}>
        <h3 className="font-medium">{t("admin.mfa.setPinTitle")}</h3>
        <p className="text-xs text-[var(--brand-muted)]">{t("admin.mfa.setPinHint")}</p>
        <Input name="pin" type="password" inputMode="numeric" placeholder="4–12" required />
        <Button type="submit" disabled={pin.pending}>
          {t("admin.mfa.savePin")}
        </Button>
        <Banner result={pin.result} />
      </form>
      <form className="space-y-3" onSubmit={verifyPin.onSubmit}>
        <h3 className="font-medium">{t("admin.mfa.verifyPinTitle")}</h3>
        <Input name="pin" type="password" inputMode="numeric" required />
        <Button type="submit" disabled={verifyPin.pending} variant="secondary">
          {t("admin.mfa.verifyPinCta")}
        </Button>
        <Banner result={verifyPin.result} />
      </form>
      <div className="space-y-3">
        <h3 className="font-medium">{t("admin.mfa.enrollTitle")}</h3>
        <p className="text-xs text-[var(--brand-muted)]">{t("admin.mfa.enrollHint")}</p>
        <Button type="button" disabled={enrollPending} onClick={beginEnroll}>
          {qr ? t("admin.mfa.regenQr") : t("admin.mfa.startEnroll")}
        </Button>
        {enrollError ? <p className="text-sm text-red-400">{enrollError}</p> : null}
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={t("admin.mfa.qrAlt")} className="h-48 w-48 rounded-md bg-white p-2" />
        ) : null}
        {secret ? (
          <p className="break-all font-mono text-xs text-[var(--brand-muted)]">
            {t("admin.mfa.secretLabel", { secret })}
          </p>
        ) : null}
        {factorId ? (
          <form className="space-y-3" onSubmit={confirmEnroll.onSubmit}>
            <input type="hidden" name="factorId" value={factorId} />
            <Input name="otp" placeholder="6-digit code" required autoComplete="one-time-code" />
            <Button type="submit" disabled={confirmEnroll.pending}>
              {t("admin.mfa.confirmEnroll")}
            </Button>
            <Banner result={confirmEnroll.result} />
          </form>
        ) : null}
      </div>
      <div className="space-y-3">
        <form className="space-y-3" onSubmit={verifyOtp.onSubmit}>
          <h3 className="font-medium">{t("admin.mfa.upgradeTitle")}</h3>
          <p className="text-xs text-[var(--brand-muted)]">{t("admin.mfa.upgradeHint")}</p>
          <Input name="otp" required autoComplete="one-time-code" />
          <Button type="submit" disabled={verifyOtp.pending} variant="secondary">
            {t("admin.mfa.verifyAuthenticator")}
          </Button>
          <Banner result={verifyOtp.result} />
        </form>
        <form className="space-y-3" onSubmit={disableTwoFa.onSubmit}>
          <input type="hidden" name="enabled" value="false" />
          <Button type="submit" disabled={disableTwoFa.pending} variant="secondary">
            {t("admin.mfa.disableFlag")}
          </Button>
          <Banner result={disableTwoFa.result} />
        </form>
      </div>
    </div>
  );
}

export function CreateAdminForm({ roles }: { roles: Array<{ code: string; name: string }> }) {
  const { pending, result, onSubmit } = useActionForm(createAdminAccountAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <h3 className="font-medium">Create admin</h3>
      <Input name="userId" placeholder="Auth user UUID" required />
      <Input name="displayName" placeholder="Display name" required />
      <select
        name="roleCode"
        className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
        defaultValue="support_viewer"
      >
        {roles.map((role) => (
          <option key={role.code} value={role.code}>
            {role.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isOwner" value="true" />
        Owner (owner-only)
      </label>
      <SensitiveFields />
      <Button type="submit" disabled={pending}>
        Create
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function AdminRoleOverrideForms({
  admins,
  roles,
}: {
  admins: Array<{ user_id: string; display_name: string }>;
  roles: Array<{ code: string; name: string }>;
}) {
  const assign = useActionForm(assignAdminRoleAction);
  const override = useActionForm(setPermissionOverrideAction);
  const status = useActionForm(setAdminStatusAction);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form className="space-y-3" onSubmit={assign.onSubmit}>
        <h3 className="font-medium">Assign role</h3>
        <select name="targetAdminId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" required>
          {admins.map((admin) => (
            <option key={admin.user_id} value={admin.user_id}>
              {admin.display_name}
            </option>
          ))}
        </select>
        <select name="roleCode" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm">
          {roles.map((role) => (
            <option key={role.code} value={role.code}>
              {role.name}
            </option>
          ))}
        </select>
        <SensitiveFields />
        <Button type="submit" disabled={assign.pending}>
          Assign
        </Button>
        <Banner result={assign.result} />
      </form>

      <form className="space-y-3" onSubmit={override.onSubmit}>
        <h3 className="font-medium">Permission override</h3>
        <select name="targetAdminId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" required>
          {admins.map((admin) => (
            <option key={admin.user_id} value={admin.user_id}>
              {admin.display_name}
            </option>
          ))}
        </select>
        <select name="permission" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm">
          {ADMIN_PERMISSION_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <select name="granted" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="true">
          <option value="true">Grant</option>
          <option value="false">Deny</option>
        </select>
        <Input name="reason" placeholder="Reason" />
        <SensitiveFields />
        <Button type="submit" disabled={override.pending}>
          Save override
        </Button>
        <Banner result={override.result} />
      </form>

      <form className="space-y-3" onSubmit={status.onSubmit}>
        <h3 className="font-medium">Disable / restore</h3>
        <select name="targetAdminId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" required>
          {admins.map((admin) => (
            <option key={admin.user_id} value={admin.user_id}>
              {admin.display_name}
            </option>
          ))}
        </select>
        <select name="status" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="disabled">
          <option value="disabled">Disable</option>
          <option value="active">Active</option>
        </select>
        <SensitiveFields />
        <Button type="submit" disabled={status.pending} variant="secondary">
          Apply
        </Button>
        <Banner result={status.result} />
      </form>
    </div>
  );
}

export function PlayerStatusForm({
  players,
}: {
  players: Array<{ id: string; nickname: string; status: string }>;
}) {
  const { pending, result, onSubmit } = useActionForm(setPlayerStatusAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <h3 className="font-medium">Change player status</h3>
      <select name="playerId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" required>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.nickname} ({player.status})
          </option>
        ))}
      </select>
      <select name="status" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="suspended">
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
        <option value="banned">Banned</option>
      </select>
      <Input name="reason" placeholder="Reason (required)" required />
      <SensitiveFields />
      <Button type="submit" disabled={pending}>
        Update status
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function AnnouncementForm() {
  const { pending, result, onSubmit } = useActionForm(upsertAnnouncementAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <Input name="titleEn" placeholder="Title (EN)" required />
      <Input name="titleLo" placeholder="Title (LO)" />
      <Input name="bodyEn" placeholder="Body (EN)" required />
      <Input name="bodyLo" placeholder="Body (LO)" />
      <select name="status" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="draft">
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <Button type="submit" disabled={pending}>
        Save announcement
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function TicketStatusForm({
  tickets,
}: {
  tickets: Array<{ id: string; subject: string; status: string }>;
}) {
  const t = useTranslations();
  const { pending, result, onSubmit } = useActionForm(updateTicketStatusAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <select name="ticketId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" required>
        {tickets.map((ticket) => (
          <option key={ticket.id} value={ticket.id}>
            {ticket.subject} ({ticket.status})
          </option>
        ))}
      </select>
      <select name="status" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="in_progress">
        <option value="open">{t("admin.tickets.statusOpen")}</option>
        <option value="in_progress">{t("admin.tickets.statusInProgress")}</option>
        <option value="waiting_for_player">{t("admin.tickets.statusWaiting")}</option>
        <option value="resolved">{t("admin.tickets.statusResolved")}</option>
        <option value="closed">{t("admin.tickets.statusClosed")}</option>
      </select>
      <Input name="reply" placeholder={t("admin.tickets.replyPlaceholder")} />
      <Button type="submit" disabled={pending}>
        {t("admin.tickets.updateCta")}
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function StorageOrphanRetryForm() {
  const t = useTranslations();
  const { pending, result, onSubmit } = useActionForm(
    retryStorageOrphanCleanupAction,
  );
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <p className="text-sm text-[var(--brand-muted)]">
        {t("admin.orphan.formHint")}
      </p>
      <Input
        name="limit"
        type="number"
        min={1}
        max={25}
        defaultValue={10}
        aria-label={t("admin.orphan.batchLimit")}
      />
      <Button type="submit" disabled={pending} variant="secondary">
        {t("admin.orphan.retryCta")}
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function MissionBadgeForms() {
  const mission = useActionForm(upsertMissionAction);
  const achievement = useActionForm(upsertAchievementAction);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-3" onSubmit={mission.onSubmit}>
        <h3 className="font-medium">Mission</h3>
        <Input name="code" placeholder="code" required />
        <Input name="title" placeholder="Title" required />
        <Input name="description" placeholder="Description" required />
        <Input name="targetCount" type="number" defaultValue={1} min={1} />
        <Input name="rewardAmount" type="number" defaultValue={1000} min={0} />
        <input type="hidden" name="isEnabled" value="true" />
        <Button type="submit" disabled={mission.pending}>
          Save mission
        </Button>
        <Banner result={mission.result} />
      </form>
      <form className="space-y-3" onSubmit={achievement.onSubmit}>
        <h3 className="font-medium">Achievement / badge</h3>
        <Input name="code" placeholder="code" required />
        <Input name="title" placeholder="Title" required />
        <Input name="description" placeholder="Description" required />
        <Input name="badgeAssetKey" placeholder="Badge asset key" />
        <input type="hidden" name="isEnabled" value="true" />
        <Button type="submit" disabled={achievement.pending}>
          Save achievement
        </Button>
        <Banner result={achievement.result} />
      </form>
    </div>
  );
}

export function FeatureFlagForm({
  flags,
}: {
  flags: Array<{ key: string; enabled: boolean }>;
}) {
  const { pending, result, onSubmit } = useActionForm(setFeatureFlagAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <select name="key" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" required>
        {flags.map((flag) => (
          <option key={flag.key} value={flag.key}>
            {flag.key} ({flag.enabled ? "on" : "off"})
          </option>
        ))}
      </select>
      <select name="enabled" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="true">
        <option value="true">Enable</option>
        <option value="false">Disable</option>
      </select>
      <Input name="payload" placeholder='Optional JSON payload e.g. {}' />
      <Button type="submit" disabled={pending}>
        Update flag
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function SettingsForms({
  settings,
}: {
  settings: Array<{ key: string; value: unknown }>;
}) {
  const setting = useActionForm(setSystemSettingAction);
  const maintenance = useActionForm(setMaintenanceAction);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-3" onSubmit={setting.onSubmit}>
        <h3 className="font-medium">System setting</h3>
        <select name="key" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm">
          {settings.map((row) => (
            <option key={row.key} value={row.key}>
              {row.key}
            </option>
          ))}
        </select>
        <Input name="value" placeholder='JSON value e.g. 5000 or "green"' required />
        <Button type="submit" disabled={setting.pending}>
          Save setting
        </Button>
        <Banner result={setting.result} />
      </form>
      <form className="space-y-3" onSubmit={maintenance.onSubmit}>
        <h3 className="font-medium">Platform maintenance</h3>
        <select name="isActive" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="false">
          <option value="true">Activate</option>
          <option value="false">Deactivate</option>
        </select>
        <Input name="message" placeholder="Maintenance message" />
        <SensitiveFields />
        <Button type="submit" disabled={maintenance.pending}>
          Apply
        </Button>
        <Banner result={maintenance.result} />
      </form>
    </div>
  );
}

export function GameConfigForm({ gameIds }: { gameIds: string[] }) {
  const { pending, result, onSubmit } = useActionForm(createGameVersionAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <select name="gameId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm">
        {gameIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <textarea
        name="config"
        rows={6}
        className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 font-mono text-xs"
        defaultValue="{}"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activate" value="true" />
        Activate for future rounds
      </label>
      <Button type="submit" disabled={pending}>
        Create version
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function ReleaseAdvanceForm({
  games,
}: {
  games: Array<{ id: string; lifecycle_status: string }>;
}) {
  const { pending, result, onSubmit } = useActionForm(advanceGameReleaseAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <select name="gameId" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm">
        {games.map((game) => (
          <option key={game.id} value={game.id}>
            {game.id} ({game.lifecycle_status})
          </option>
        ))}
      </select>
      <select name="toStatus" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="qa">
        <option value="draft">Draft</option>
        <option value="qa">QA</option>
        <option value="owner_approved">Owner approved</option>
        <option value="scheduled">Scheduled</option>
        <option value="live">Live</option>
        <option value="disabled">Disabled</option>
      </select>
      <SensitiveFields />
      <Button type="submit" disabled={pending}>
        Advance release
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function AssetForm() {
  const { pending, result, onSubmit } = useActionForm(upsertAssetAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <Input name="key" placeholder="Asset key" required />
      <select name="kind" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="game_icon">
        <option value="avatar_preset">Avatar preset</option>
        <option value="game_icon">Game icon</option>
        <option value="game_model">Game model</option>
        <option value="texture">Texture</option>
        <option value="sound">Sound</option>
        <option value="other">Other</option>
      </select>
      <Input name="storagePath" placeholder="Storage path" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="rightsCleared" value="true" />
        Rights cleared
      </label>
      <Button type="submit" disabled={pending}>
        Save asset
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function QaAccountForm() {
  const { pending, result, onSubmit } = useActionForm(registerQaAccountAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <Input name="playerId" placeholder="Player UUID" required />
      <Input name="label" placeholder="QA label" required />
      <Input name="notes" placeholder="Notes" />
      <SensitiveFields />
      <Button type="submit" disabled={pending}>
        Register QA account
      </Button>
      <Banner result={result} />
    </form>
  );
}

export function ReportExportForm() {
  const { pending, result, onSubmit } = useActionForm(exportReportAction);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <select name="reportType" className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" defaultValue="players">
        <option value="players">Players</option>
        <option value="games">Games</option>
        <option value="credits">Credits</option>
        <option value="activity">Activity</option>
        <option value="support">Support</option>
        <option value="system">System</option>
      </select>
      <Button type="submit" disabled={pending}>
        Export (permission-checked)
      </Button>
      <Banner result={result} />
      {result?.ok && result.data ? (
        <pre className="max-h-64 overflow-auto rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-xs">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : null}
    </form>
  );
}

export function StorageOrphanCard() {
  const t = useTranslations();
  return (
    <section className="space-y-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <div>
        <h2 className="text-lg font-medium">{t("admin.orphan.title")}</h2>
        <p className="text-sm text-[var(--brand-muted)]">
          {t("admin.orphan.pageDescription")}
        </p>
      </div>
      <StorageOrphanRetryForm />
    </section>
  );
}
