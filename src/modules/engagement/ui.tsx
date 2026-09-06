"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "@/modules/localization/provider";
import {
  claimMissionRewardAction,
  createInviteAction,
  createSupportTicketAction,
  markAllNotificationsReadAction,
  markAnnouncementReadAction,
  markNotificationReadAction,
  replySupportTicketAction,
  requestFriendAction,
  respondFriendshipAction,
  setPlayPauseAction,
  submitTicketSatisfactionAction,
  touchPlaySessionAction,
  uploadTicketAttachmentsAction,
} from "@/modules/engagement/actions";
import {
  formatSessionDuration,
  sessionBreakDue,
  type ResponsiblePlayConfig,
} from "@/modules/engagement/helpers";
import type { ActionResult } from "@/modules/player/auth-shared";

const MAX_TICKET_ATTACHMENTS = 3;

function ResultMessage({ state }: { state: ActionResult | null }) {
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

export function PlaySessionTouch() {
  useEffect(() => {
    void touchPlaySessionAction();
  }, []);
  return null;
}

export function AnnouncementDismissForm({
  announcementId,
}: {
  announcementId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        startTransition(async () => {
          await markAnnouncementReadAction(announcementId, true);
        });
      }}
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Dismiss
      </Button>
    </form>
  );
}

export function NotificationReadButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await markNotificationReadAction(id);
        });
      }}
    >
      Mark read
    </Button>
  );
}

export function MarkAllNotificationsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setMessage(await markAllNotificationsReadAction());
          });
        }}
      >
        Mark all read
      </Button>
      <ResultMessage state={message} />
    </div>
  );
}

export function MissionClaimButton({ missionId }: { missionId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setMessage(await claimMissionRewardAction(missionId));
          });
        }}
      >
        Claim reward
      </Button>
      <ResultMessage state={message} />
    </div>
  );
}

export function FriendRequestForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [nickname, setNickname] = useState("");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setMessage(await requestFriendAction(nickname));
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="friend-nickname">Friend nickname</Label>
        <Input
          id="friend-nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Player nickname"
        />
      </div>
      <Button type="submit" disabled={pending}>Send request</Button>
      <ResultMessage state={message} />
    </form>
  );
}

export function FriendshipActions({
  friendshipId,
  canAccept,
}: {
  friendshipId: string;
  canAccept: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const act = (action: "accept" | "block" | "remove") => {
    startTransition(async () => {
      await respondFriendshipAction(friendshipId, action);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canAccept ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => act("accept")}
        >
          Accept
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => act("block")}
      >
        Block
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => act("remove")}
      >
        Remove
      </Button>
    </div>
  );
}

export function CreateInviteButton() {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await createInviteAction();
            setMessage(result);
            if (result.ok && result.data?.code) {
              setCode(String(result.data.code));
            }
          });
        }}
      >
        Create invite code
      </Button>
      {code ? (
        <p className="font-mono text-sm text-[var(--brand-accent)]">{code}</p>
      ) : null}
      <ResultMessage state={message} />
    </div>
  );
}

function TicketAttachmentInput({
  id,
  files,
  onChange,
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("support.attachments")}</Label>
      <Input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          const next = Array.from(event.target.files ?? []).slice(
            0,
            MAX_TICKET_ATTACHMENTS,
          );
          onChange(next);
        }}
      />
      <p className="text-xs text-[var(--brand-muted)]">
        {t("support.attachmentsHint")}
      </p>
      {files.length > 0 ? (
        <ul className="text-xs text-[var(--brand-muted)]">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`}>{file.name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SupportTicketForm() {
  const t = useTranslations();
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);

  return (
    <form
      className="flex flex-col gap-3 border border-[var(--brand-border)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const created = await createSupportTicketAction(formData);
          if (!created.ok) {
            setState(created);
            return;
          }

          const ticketId = String(created.data?.id ?? "");
          const messageId = String(created.data?.messageId ?? "");
          if (files.length > 0 && ticketId && messageId) {
            const uploadData = new FormData();
            for (const file of files.slice(0, MAX_TICKET_ATTACHMENTS)) {
              uploadData.append("attachments", file);
            }
            const uploaded = await uploadTicketAttachmentsAction(
              ticketId,
              messageId,
              uploadData,
            );
            setState(
              uploaded.ok
                ? {
                    ok: true,
                    message: `${created.message} ${uploaded.message}`,
                    data: created.data,
                  }
                : {
                    ok: false,
                    message: `${created.message} Attachment upload failed: ${uploaded.message}`,
                  },
            );
            if (uploaded.ok) setFiles([]);
            return;
          }

          setState(created);
          setFiles([]);
        });
      }}
    >
      <h2 className="font-medium">{t("support.newTicket")}</h2>
      <div className="space-y-2">
        <Label htmlFor="category">{t("support.category")}</Label>
        <select
          id="category"
          name="category"
          className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
          defaultValue="general"
        >
          <option value="general">{t("support.categories.general")}</option>
          <option value="account">{t("support.categories.account")}</option>
          <option value="credits">{t("support.categories.credits")}</option>
          <option value="games">{t("support.categories.games")}</option>
          <option value="technical">{t("support.categories.technical")}</option>
          <option value="other">{t("support.categories.other")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">{t("support.subject")}</Label>
        <Input id="subject" name="subject" required minLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">{t("support.message")}</Label>
        <textarea
          id="message"
          name="message"
          required
          minLength={3}
          rows={4}
          className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <TicketAttachmentInput
        id="ticket-attachments"
        files={files}
        onChange={setFiles}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("support.submitting") : t("support.submit")}
      </Button>
      <ResultMessage state={state} />
    </form>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const t = useTranslations();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const response = await replySupportTicketAction(ticketId, message);
          if (!response.ok) {
            setResult(response);
            return;
          }

          const messageId = String(
            response.data?.messageId ?? response.data?.id ?? "",
          );
          if (files.length > 0 && messageId) {
            const uploadData = new FormData();
            for (const file of files.slice(0, MAX_TICKET_ATTACHMENTS)) {
              uploadData.append("attachments", file);
            }
            const uploaded = await uploadTicketAttachmentsAction(
              ticketId,
              messageId,
              uploadData,
            );
            setResult(
              uploaded.ok
                ? {
                    ok: true,
                    message: `${response.message} ${uploaded.message}`,
                  }
                : {
                    ok: false,
                    message: `Reply saved, but attachments failed: ${uploaded.message}`,
                  },
            );
            if (uploaded.ok) {
              setMessage("");
              setFiles([]);
            }
            return;
          }

          setResult(response);
          if (response.ok) {
            setMessage("");
            setFiles([]);
          }
        });
      }}
    >
      <Label htmlFor="reply">{t("support.reply")}</Label>
      <textarea
        id="reply"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
      />
      <TicketAttachmentInput
        id="reply-attachments"
        files={files}
        onChange={setFiles}
      />
      <Button type="submit" disabled={pending || message.trim().length < 1}>
        {pending ? t("support.sending") : t("support.sendReply")}
      </Button>
      <ResultMessage state={result} />
    </form>
  );
}

export function TicketAttachmentGallery({
  items,
}: {
  items: Array<{
    id: string;
    file_name: string;
    signedUrl: string | null;
  }>;
}) {
  const t = useTranslations();
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("support.attachments")}</h2>
      <ul className="flex flex-wrap gap-3">
        {items.map((item) => (
          <li key={item.id} className="w-28 space-y-1">
            {item.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.signedUrl}
                alt={item.file_name}
                className="h-24 w-28 object-cover"
              />
            ) : (
              <div className="flex h-24 w-28 items-center justify-center border border-[var(--brand-border)] text-xs text-[var(--brand-muted)]">
                {t("support.attachmentUnavailable")}
              </div>
            )}
            <p className="truncate text-xs text-[var(--brand-muted)]">
              {item.file_name}
            </p>
            {item.signedUrl ? (
              <a
                href={item.signedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline-offset-4 hover:underline"
              >
                {t("support.openAttachment")}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TicketSatisfactionForm({ ticketId }: { ticketId: string }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      className="flex flex-col gap-3 border border-[var(--brand-border)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setResult(
            await submitTicketSatisfactionAction(ticketId, score, comment),
          );
        });
      }}
    >
      <h2 className="font-medium">Rate support</h2>
      <div className="space-y-2">
        <Label htmlFor="score">Score (1–5)</Label>
        <Input
          id="score"
          type="number"
          min={1}
          max={5}
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="comment">Comment (optional)</Label>
        <textarea
          id="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={pending}>Submit feedback</Button>
      <ResultMessage state={result} />
    </form>
  );
}

export function ResponsiblePlaySection({
  config,
  sessionStartedAt,
  playPausedUntil,
}: {
  config: ResponsiblePlayConfig;
  sessionStartedAt: string | null;
  playPausedUntil: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [nowMs] = useState(() => Date.now());
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const breakDue = sessionBreakDue(
    sessionStartedAt,
    config.session_break_minutes,
    now,
  );
  const paused =
    playPausedUntil !== null &&
    new Date(playPausedUntil).getTime() > nowMs;

  const pause = (days: number | 0) => {
    startTransition(async () => {
      setMessage(await setPlayPauseAction(days));
    });
  };

  return (
    <section className="space-y-4 border border-[var(--brand-border)] p-4">
      <h2 className="font-display text-xl font-medium">Responsible play</h2>
      <p className="text-sm text-[var(--brand-muted)]">{config.demo_notice}</p>
      {sessionStartedAt ? (
        <p className="text-sm">
          Session: {formatSessionDuration(sessionStartedAt, now)}
          {breakDue ? (
            <span className="ml-2 text-amber-200">
              — consider taking a break
            </span>
          ) : null}
        </p>
      ) : null}
      {paused ? (
        <p className="text-sm text-amber-200">
          Play paused until {new Date(playPausedUntil!).toLocaleString()}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {config.pause_days_options.map((days) => (
          <Button
            key={days}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => pause(days)}
          >
            Pause {days} day{days === 1 ? "" : "s"}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || !paused}
          onClick={() => pause(0)}
        >
          Clear pause
        </Button>
      </div>
      <ResultMessage state={message} />
      <p className="text-xs text-[var(--brand-muted)]">
        <Link href="/guide" className="underline-offset-4 hover:underline">
          Game guide
        </Link>
      </p>
    </section>
  );
}
