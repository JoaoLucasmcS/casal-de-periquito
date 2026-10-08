/** Os dois periquitos (azul = João, rosa = Carol) num poleiro — mesmo desenho do ícone. */
export function Birds({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} role="img" aria-label="Dois periquitos">
      <rect x="6" y="66" width="108" height="6" rx="3" fill="var(--color-green)" />
      <Bird x={36} color="var(--color-blue)" />
      <Bird x={84} color="var(--color-pink)" flip />
    </svg>
  );
}

function Bird({ x, color, flip }: { x: number; color: string; flip?: boolean }) {
  return (
    <g transform={`translate(${x} 0) scale(${flip ? -1 : 1} 1)`}>
      {/* cauda */}
      <path d="M-14 50 L-26 72 L-18 72 L-8 56 Z" fill={color} />
      {/* corpo */}
      <ellipse cx="0" cy="46" rx="16" ry="20" fill={color} />
      {/* máscara amarela */}
      <circle cx="6" cy="24" r="13" fill="var(--color-sun)" />
      {/* asa */}
      <path d="M-12 38 Q-2 34 6 44 Q0 60 -10 62 Q-16 52 -12 38 Z" fill="#000" opacity="0.18" />
      {/* olho e bico */}
      <circle cx="10" cy="21" r="2.4" fill="#1f2d24" />
      <path d="M16 25 Q22 27 17 32 Q14 29 16 25 Z" fill="#e8913a" />
      {/* bochecha */}
      <circle cx="9" cy="31" r="2.2" fill="#3b5bdb" opacity="0.8" />
    </g>
  );
}
