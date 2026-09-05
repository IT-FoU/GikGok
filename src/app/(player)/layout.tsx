import { PlayerShell } from "@/components/shell/player-shell";

export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlayerShell>{children}</PlayerShell>;
}
