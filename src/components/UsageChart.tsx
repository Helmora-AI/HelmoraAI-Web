import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UsageRequest } from "../lib/api/types";

export default function UsageChart({ requests }: { requests: UsageRequest[] }) {
  const grouped = new Map<string, { date: string; tokens: number; requests: number }>();
  for (const request of requests) {
    const date = request.created_at.slice(0, 10);
    const point = grouped.get(date) ?? { date, tokens: 0, requests: 0 };
    point.tokens += Number(request.prompt_tokens ?? 0) + Number(request.completion_tokens ?? 0);
    point.requests += 1;
    grouped.set(date, point);
  }
  const data = [...grouped.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (!data.length) return <div className="chart-empty">Usage history will appear after the first inference request.</div>;
  return <div className="usage-chart" role="img" aria-label="Token usage over time"><ResponsiveContainer width="100%" height={260}><AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}><defs><linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ctrl-control)" stopOpacity={0.32} /><stop offset="100%" stopColor="var(--ctrl-control)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="var(--ctrl-line)" vertical={false} /><XAxis dataKey="date" tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--ctrl-faint)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--ctrl-raised)", border: "1px solid var(--ctrl-line)", borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="tokens" stroke="var(--ctrl-control)" fill="url(#tokenFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>;
}
