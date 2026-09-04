"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  SoundManager,
  type SoundCue,
  type SoundPackId,
} from "@/modules/sound/sound-manager";

type SoundContextValue = {
  pack: SoundPackId;
  volume: number;
  muted: boolean;
  setPack: (pack: SoundPackId) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  play: (cue: SoundCue) => Promise<void>;
};

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({
  children,
  initialPack = "classic_casino",
  initialVolume = 0.7,
  initialMuted = false,
}: {
  children: ReactNode;
  initialPack?: SoundPackId;
  initialVolume?: number;
  initialMuted?: boolean;
}) {
  const manager = useMemo(() => new SoundManager(), []);
  const [pack, setPackState] = useState<SoundPackId>(initialPack);
  const [volume, setVolumeState] = useState(initialVolume);
  const [muted, setMutedState] = useState(initialMuted);

  useEffect(() => {
    manager.setPack(pack);
    manager.setVolume(volume);
    manager.setMuted(muted);
  }, [manager, pack, volume, muted]);

  useEffect(() => {
    void manager.preload();
  }, [manager]);

  const value = useMemo<SoundContextValue>(
    () => ({
      pack,
      volume,
      muted,
      setPack: setPackState,
      setVolume: setVolumeState,
      setMuted: setMutedState,
      play: (cue) => manager.play(cue),
    }),
    [manager, pack, volume, muted],
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used within SoundProvider");
  return ctx;
}
