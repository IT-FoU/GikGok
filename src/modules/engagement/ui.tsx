"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/modules/engagement/actions";
import {
  formatSessionDuration,
  sessionBreakDue,
  type ResponsiblePlayConfig,
} from "@/modules/engagement/helpers";
import type { ActionResult } from "@/modules/player/auth-shared";

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

export function SupportTicketForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) =>
      createSupportTicketAction(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 border border-[var(--brand-border)] p-4">
      <h2 className="font-medium">New ticket</h2>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
          defaultValue="other"
        >
          <option value="account">Account</option>
          <option value="credits">Credits</option>
          <option value="gameplay">Gameplay</option>
          <option value="technical">Technical</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required minLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          name="message"
          required
          minLength={3}
          rows={4}
          className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={pending}>Submit ticket</Button>
      <ResultMessage state={state} />
    </form>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const response = await replySupportTicketAction(ticketId, message);
          setResult(response);
          if (response.ok) setMessage("");
        });
      }}
    >
      <Label htmlFor="reply">Reply</Label>
      <textarea
        id="reply"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
      />
      <Button type="submit" disabled={pending || message.trim().length < 1}>
        Send reply
      </Button>
      <ResultMessage state={result} />
    </form>
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
