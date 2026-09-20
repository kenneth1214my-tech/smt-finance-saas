export default function Card({
  title,
  unit,
  linkText,
  children,
}: {
  title: string;
  unit?: string;
  linkText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border p-[18px_20px_20px] shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="mb-3.5 flex items-baseline justify-between gap-2.5">
        <div className="text-[14.5px] font-bold" style={{ color: "var(--ink-900)" }}>
          {title}
          {unit && (
            <span className="ml-1.5 text-[11.5px] font-medium" style={{ color: "var(--ink-400)" }}>
              {unit}
            </span>
          )}
        </div>
        {linkText && (
          <div className="whitespace-nowrap text-xs" style={{ color: "var(--ink-400)" }}>
            {linkText} &rsaquo;
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
