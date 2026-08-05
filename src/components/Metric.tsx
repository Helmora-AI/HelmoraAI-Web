export function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
