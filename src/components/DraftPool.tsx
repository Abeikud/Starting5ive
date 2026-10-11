import { useState } from "react";
import type { Player, Position } from "../../shared/types";
import { PlayerCard } from "./PlayerCard";

type PositionFilter = 'All' | Exclude<Position, '6Man'>;

const FILTER_OPTIONS: PositionFilter[] = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];

interface DraftPoolProps {
  players: Player[];
  onPick: (player: Player) => void;
}

export function DraftPool({ players, onPick }: DraftPoolProps) {
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const visiblePlayers =
    positionFilter === 'All'
      ? players
      : players.filter((player) => player.positions.includes(positionFilter));

  function handleSelectFilter(option: PositionFilter) {
    setPositionFilter(option);
    setIsFilterOpen(false);
  }

  return (
    <aside className="draft-pool">
      <div className="draft-pool-header">
        <h2>Draft Pool</h2>
        <div className="filter">
          <button
            className="secondary"
            aria-expanded={isFilterOpen}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            {positionFilter} ▾
          </button>
          {isFilterOpen && (
            <ul className="filter-menu">
              {FILTER_OPTIONS.map((option) => (
                <li key={option}>
                  <button
                    className={option === positionFilter ? "selected" : undefined}
                    onClick={() => handleSelectFilter(option)}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="draft-pool-list">
        {visiblePlayers.map((player) => (
          <PlayerCard key={player.id} player={player} onClick={() => onPick(player)} />
        ))}
      </div>
    </aside>
  );
}
