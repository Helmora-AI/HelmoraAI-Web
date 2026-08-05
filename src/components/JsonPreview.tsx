export function JsonPreview({ value, label, className }: { value: unknown; label?: string; className?: string }) {
  const pre = <pre className={["json-preview", className].filter(Boolean).join(" ")}>{JSON.stringify(value, null, 2)}</pre>;
  if (!label) return pre;
  return <details><summary>{label}</summary>{pre}</details>;
}
