export default function BarChart({
  labels,
  series,
  height = 200,
}: {
  labels: string[];
  series: { name: string; color: string; data: number[] }[];
  height?: number;
}) {
  const W = 760;
  const H = height;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = labels.length;
  const allVals = series.flatMap((s) => s.data).concat([0]);
  const maxV = Math.max(...allVals) * 1.18 || 1;
  const groupW = innerW / n;
  const barGap = groupW * 0.18;
  const barW = ((groupW - barGap * 2) / series.length) * 0.72;
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, t) => {
    const v = (maxV / ticks) * t;
    return { v, yy: y(v) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", overflow: "visible" }}>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={g.yy} y2={g.yy} stroke="var(--grid)" strokeWidth={1} />
          <text x={4} y={g.yy + 3} fontSize={10.5} fill="var(--ink-400)">
            {Math.round(g.v)}
          </text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--axis)" strokeWidth={1} />
      {labels.map((label, i) => {
        const gx = padL + groupW * i;
        return (
          <g key={i}>
            {series.map((s, si) => {
              const v = s.data[i];
              const bx = gx + barGap + si * (barW + 3);
              const by = y(v);
              const bh = padT + innerH - by;
              return <rect key={s.name} x={bx} y={by} width={barW} height={Math.max(bh, 0)} rx={3} fill={s.color} />;
            })}
            <text x={gx + groupW / 2} y={padT + innerH + 17} fontSize={10.5} fill="var(--ink-400)" textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
