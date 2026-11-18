import { AlertTriangle } from "lucide-react";

// Shown on the Group statements when the joint-venture figures could not be loaded: the statement is then missing the joint venture, and
// the reader must be told rather than shown a quietly incomplete number.
export default function JvLoadWarning({ isZh }: { isZh: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "var(--status-warning)", color: "var(--ink-900)" }}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--status-warning)" }} />
      <span>
        {isZh
          ? "合营企业的数据暂时无法读取，因此本报表未包含合营企业（权益法）。请稍后刷新；若持续出现，请联系管理员。"
          : "The joint-venture figures could not be loaded, so this statement does not include the joint venture (equity method). Refresh in a moment; if this persists, contact your administrator."}
      </span>
    </div>
  );
}
