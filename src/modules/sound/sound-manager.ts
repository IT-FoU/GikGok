export type SoundPackId = "classic_casino" | "arcade" | "silent";

export type SoundCue =
  | "ui_click"
  | "ui_success"
  | "ui_error"
  | "bet_lock"
  | "dice_roll"
  | "payout";

type SoundManagerOptions = {
  pack?: SoundPackId;
  volume?: number;
  muted?: boolean;
};

/**
 * Lightweight Web Audio sound manager.
 * Packs map cue names to oscillator presets (no binary assets required yet).
 * Silent pack and mute short-circuit playback.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private pack: SoundPackId;
  private volume: number;
  private muted: boolean;
  private unlocked = false;

  constructor(options: SoundManagerOptions = {}) {
    this.pack = options.pack ?? "classic_casino";
    this.volume = options.volume ?? 0.7;
    this.muted = options.muted ?? false;
  }

  setPack(pack: SoundPackId) {
    this.pack = pack;
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  async unlock() {
    if (this.unlocked) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    this.unlocked = true;
  }

  async preload() {
    // Oscillator-based cues need no network preload; keep API for future assets.
    this.ensureContext();
  }

  async play(cue: SoundCue) {
    if (this.muted || this.pack === "silent") return;
    if (typeof window !== "undefined") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      // Still allow short UI clicks unless muted/silent; avoid long fanfares later.
      void reduced;
    }

    await this.unlock();
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const preset = this.presetFor(cue);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = preset.type;
    osc.frequency.setValueAtTime(preset.freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, this.volume * preset.gain),
      now + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + preset.duration + 0.02);
  }

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  private presetFor(cue: SoundCue): {
    type: OscillatorType;
    freq: number;
    gain: number;
    duration: number;
  } {
    const arcade = this.pack === "arcade";
    switch (cue) {
      case "ui_click":
        return {
          type: arcade ? "square" : "triangle",
          freq: arcade ? 660 : 520,
          gain: 0.08,
          duration: 0.06,
        };
      case "ui_success":
        return {
          type: "sine",
          freq: arcade ? 880 : 660,
          gain: 0.1,
          duration: 0.18,
        };
      case "ui_error":
        return {
          type: "sawtooth",
          freq: 180,
          gain: 0.07,
          duration: 0.16,
        };
      case "bet_lock":
        return {
          type: arcade ? "square" : "triangle",
          freq: 420,
          gain: 0.09,
          duration: 0.12,
        };
      case "dice_roll":
        return {
          type: arcade ? "square" : "triangle",
          freq: arcade ? 310 : 260,
          gain: 0.07,
          duration: arcade ? 0.22 : 0.28,
        };
      case "payout":
        return {
          type: "sine",
          freq: arcade ? 990 : 740,
          gain: 0.12,
          duration: 0.28,
        };
    }
  }
}
