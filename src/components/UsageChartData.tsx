import type { UsageBucket } from "../lib/api/types";
import { usageTableColumns, usageTableRows, type UsageMetric } from "../lib/usageChartStats";

interface UsageChartDataProps {
  metric: UsageMetric;
  buckets: UsageBucket[];
}

export default function UsageChartData({ metric, buckets }: UsageChartDataProps) {
  const columns = usageTableColumns(metric);
  const rows = usageTableRows(metric, buckets);
  if (!rows.length) return null;
  return (
    <div className="usage-chart-data">
      <table className="usage-data-table">
        <caption className="sr-only">Daily {metric} values</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? "is-numeric" : undefined}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date}>
              <th scope="row">{row.date}</th>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "is-numeric" : undefined}>{row.cells[column.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
