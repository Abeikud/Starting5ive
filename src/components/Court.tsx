import type { CSSProperties } from "react";
import type { CoachId, Lineup, Player, Position } from "../../shared/types";
import { CourtLines } from "./CourtLines";

type Side = 'left' | 'right';
type StarterSlot = Exclude<Position, '6Man'>;

const STARTER_SLOTS: StarterSlot[] = ['PG', 'SG', 'SF', 'PF', 'C'];

// Percent across the half (from the baseline) and down the court, for the left half.
const SLOT_POSITIONS: Record<StarterSlot, { x: number; y: number }> = {
  PG: { x: 66, y: 50 },
  SG: { x: 46, y: 16 },
  SF: { x: 46, y: 84 },
  PF: { x: 22, y: 70 },
  C: { x: 18, y: 32 },
};

interface CourtProps {
  lineups: Record<CoachId, Lineup>;
  activeCoach: CoachId | null;
}

export function Court({ lineups, activeCoach }: CourtProps) {
  return (
    <div className="court-area">
      <div className="court">
        <CourtLines />
        <CourtHalf
          side="left"
          title="Coach 1"
          lineup={lineups.coach1}
          isActive={activeCoach === 'coach1'}
        />
        <CourtHalf
          side="right"
          title="Coach 2"
          lineup={lineups.coach2}
          isActive={activeCoach === 'coach2'}
        />
      </div>
      <div className="benches">
        <Bench title="Coach 1" player={lineups.coach1['6Man']} />
        <Bench title="Coach 2" player={lineups.coach2['6Man']} />
      </div>
    </div>
  );
}

interface CourtHalfProps {
  side: Side;
  title: string;
  lineup: Lineup;
  isActive: boolean;
}

function CourtHalf({ side, title, lineup, isActive }: CourtHalfProps) {
  return (
    <div className={`court-half ${side}${isActive ? ' active' : ''}`}>
      <span className="team-label">{title}</span>
      {STARTER_SLOTS.map((slot) => {
        const { x, y } = SLOT_POSITIONS[slot];
        return (
          <LineupSlot
            key={slot}
            label={slot}
            player={lineup[slot]}
            style={{ left: `${side === 'left' ? x : 100 - x}%`, top: `${y}%` }}
          />
        );
      })}
    </div>
  );
}

interface BenchProps {
  title: string;
  player: Player | null;
}

function Bench({ title, player }: BenchProps) {
  return (
    <div className="bench">
      <span className="bench-title">{title} bench</span>
      <LineupSlot label="6th Man" player={player} />
    </div>
  );
}

interface LineupSlotProps {
  label: string;
  player: Player | null;
  style?: CSSProperties;
}

function LineupSlot({ label, player, style }: LineupSlotProps) {
  return (
    <div className={player === null ? "lineup-slot empty" : "lineup-slot"} style={style}>
      <span className="slot-label">{label}</span>
      <span className="slot-name">{player === null ? "—" : player.name}</span>
    </div>
  );
}
