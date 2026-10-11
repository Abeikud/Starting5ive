import { useEffect, useState } from "react";
import "./App.css";
import { DraftPool } from "./components/DraftPool";
import { Court } from "./components/Court";
import { socket } from "./socket";
import { getMatchWinner, isRoundOver } from "../shared/match";
import { compareLineups } from "../shared/scoring";
import type { RoomResult } from "../shared/events";
import type { CoachId, MatchState, Player } from "../shared/types";

const REPLY_TIMEOUT_MS = 5000;

function coachName(coach: CoachId): string {
  return coach === 'coach1' ? 'Coach 1' : 'Coach 2';
}

interface RoomInfo {
  code: string;
  coach: CoachId;
}

function App() {
  const [match, setMatch] = useState<MatchState | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    function handleMatchUpdate(next: MatchState) {
      setMatch(next);
    }
    socket.on('matchUpdate', handleMatchUpdate);
    return () => {
      socket.off('matchUpdate', handleMatchUpdate);
    };
  }, []);

  const draftedPlayers =
    match === null
      ? []
      : [...Object.values(match.lineups.coach1), ...Object.values(match.lineups.coach2)];
  const pool = match === null ? [] : match.pool;
  const availablePlayers = pool.filter(
    (player) => !draftedPlayers.some((drafted) => drafted?.id === player.id),
  );

  const roundWinner =
    match !== null && isRoundOver(match) ? compareLineups(match.lineups) : null;
  const matchWinner = match === null ? null : getMatchWinner(match.roundWins);

  function handleRoomResult(result: RoomResult) {
    if (result.ok) {
      setRoom({ code: result.code, coach: result.coach });
      setRoomError(null);
    } else {
      setRoomError(result.error);
    }
  }

  async function handleCreateRoom() {
    try {
      handleRoomResult(await socket.timeout(REPLY_TIMEOUT_MS).emitWithAck('createRoom'));
    } catch {
      setRoomError('Could not reach the server');
    }
  }

  async function handleJoinRoom(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      handleRoomResult(await socket.timeout(REPLY_TIMEOUT_MS).emitWithAck('joinRoom', joinCode));
    } catch {
      setRoomError('Could not reach the server');
    }
  }

  function handleLeave() {
    setMatch(null);
    setRoom(null);
    setIsGuest(false);
    setJoinCode('');
    setRoomError(null);
  }

  function handlePick(player: Player) {
    socket.emit('pick', player.id);
  }

  function handleNextRound() {
    socket.emit('nextRound');
  }

  function handlePlayAgain() {
    socket.emit('playAgain');
  }

  return (
    <div className="game-page">
      <div className="left-pane">
        <section className="game-controls">
          <h1>Starting5ive</h1>
          {room !== null && (
            <p className="room-info">
              Room {room.code} · You are {coachName(room.coach)}
            </p>
          )}
          {match !== null && (
            <>
              <div className="round-wins">
                <span className="score team1">Coach 1: {match.roundWins.coach1}</span>
                <span className="score team2">Coach 2: {match.roundWins.coach2}</span>
                {matchWinner === null && (
                  <button className="secondary" onClick={handleLeave}>Leave Game</button>
                )}
              </div>
              {matchWinner !== null ? (
                <>
                  <h2>{coachName(matchWinner)} wins the match!</h2>
                  <button onClick={handlePlayAgain}>Play Again</button>
                </>
              ) : roundWinner !== null ? (
                <>
                  <h2>
                    {roundWinner === 'tie' ? "It's a tie!" : `${coachName(roundWinner)} wins the round!`}
                  </h2>
                  <button onClick={handleNextRound}>Next Round</button>
                </>
              ) : (
                <p>{coachName(match.currentTurn)}'s pick</p>
              )}
            </>
          )}
        </section>
        {match !== null && <DraftPool players={availablePlayers} onPick={handlePick} />}
      </div>
      <main className="game-area">
        {match !== null ? (
          <Court
            lineups={match.lineups}
            activeCoach={roundWinner === null ? match.currentTurn : null}
          />
        ) : room !== null ? (
          <div className="landing">
            <p className="landing-label">Share this code with your opponent</p>
            <p className="room-code">{room.code}</p>
            <p className="landing-label">Waiting for opponent to join…</p>
            <button className="secondary" onClick={handleLeave}>Cancel</button>
          </div>
        ) : isGuest ? (
          <div className="landing">
            <button className="login-button" onClick={handleCreateRoom}>Create Game</button>
            <span className="landing-or">or</span>
            <form className="join-form" onSubmit={handleJoinRoom}>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Room code"
                maxLength={4}
              />
              <button type="submit" className="secondary">Join Game</button>
            </form>
            {roomError !== null && <p className="room-error">{roomError}</p>}
            <button className="link-button" onClick={() => setIsGuest(false)}>Back</button>
          </div>
        ) : (
          <div className="landing">
            <button className="login-button">Log In</button>
            <span className="landing-or">or</span>
            <button className="secondary" onClick={() => setIsGuest(true)}>Play as Guest</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
