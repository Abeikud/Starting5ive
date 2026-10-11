import type { Player } from "../../shared/types";

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
}

export function PlayerCard({ player, onClick }: PlayerCardProps) {
  return (
    <div className="player-card" onClick={onClick}>
      <h3>{player.name}</h3>
      <p>{player.year} · {player.team}</p>
      <p>{player.positions.join(' / ')}</p>
    </div>
  );
}
