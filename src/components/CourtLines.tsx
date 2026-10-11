export function CourtLines() {
  return (
    <svg className="court-lines" viewBox="0 0 94 50" aria-hidden="true">
      <rect x="0" y="0" width="94" height="50" />
      <line x1="47" y1="0" x2="47" y2="50" />
      <circle cx="47" cy="25" r="6" />
      <HalfCourtLines paintClass="paint-left" />
      <g transform="translate(94 0) scale(-1 1)">
        <HalfCourtLines paintClass="paint-right" />
      </g>
    </svg>
  );
}

interface HalfCourtLinesProps {
  paintClass: string;
}

function HalfCourtLines({ paintClass }: HalfCourtLinesProps) {
  return (
    <>
      <rect className={paintClass} x="0" y="17" width="19" height="16" />
      <circle cx="19" cy="25" r="6" />
      <path d="M 0 3 L 14.2 3 A 23.75 23.75 0 0 1 14.2 47 L 0 47" />
      <line className="backboard" x1="4" y1="22" x2="4" y2="28" />
      <circle className="rim" cx="5.25" cy="25" r="0.75" />
    </>
  );
}
