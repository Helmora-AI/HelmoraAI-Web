import type { ReactNode } from "react";

export function RecordRow({ mark, title, subtitle, trailing, active, onClick }: { mark: string; title: string; subtitle: string; trailing?: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={active ? "record-row record-row--active" : "record-row"} onClick={onClick}>
      <span className="record-row__mark">{mark}</span>
      <span><strong>{title}</strong><small>{subtitle}</small></span>
      {trailing}
    </button>
  );
}
