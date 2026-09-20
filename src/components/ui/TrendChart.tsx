export default function TrendChart({
  labels,
  series,
  height = 140,
  suffix = "",
}: {
  labels: string[];
  series: { name: string; color: string; data: number[] }[];
  height?: number;
  suffix?: string;
}) {
  const W = 760;
  const H = height;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = labels.length;
  const allVals = series.flatMap((s) => s.data);
  const min = allVals.length ? Math.min(...allVals) : 0;
  const max = allVals.length ? Math.max(...allVals) : 1;
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
  const yMin = min >= 0 ? Math.max(min - pad, 0) : min - pad;
  const yMax = max + pad;
  const x = (i: number) => padL + (n <= 1 ? 0 : (innerW / (n - 1)) * i);
  const y = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const ticks = 3;
  const gridLines = Array.from({ length: ticks + 1 }, (_, t) => {
    const v = yMin + ((yMax - yMin) / ticks) * t;
    return { v, yy: y(v) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", overflow: "visible" }}>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={g.yy} y2={g.yy} stroke="var(--grid)" strokeWidth={1} />
          <text x={4} y={g.yy + 3} fontSize={10.5} fill="var(--ink-400)">
            {Math.round(g.v * 10) / 10}
            {suffix}
          </text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--axis)" strokeWidth={1} />
      {series.map((s) => {
        const pts = s.data.map((v, i) => [x(i), y(v)] as const);
        if (pts.length === 0) return null;
        const d = "M" + pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" L");
        const areaD = `${d} L${pts[pts.length - 1][0].toFixed(1)},${padT + innerH} L${pts[0][0].toFixed(1)},${padT + innerH} Z`;
        return (
          <g key={s.name}>
            <path d={areaD} fill={s.color} opacity={0.1} stroke="none" />
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={3} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />
            ))}
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={padT + innerH + 17} fontSize={10.5} fill="var(--ink-400)" textAnchor="middle">
          {l}
        </text>
      ))}
    </svg>
  );
}
