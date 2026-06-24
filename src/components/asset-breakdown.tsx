import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Breakdown } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#a78bfa',
  '#60a5fa',
  '#34d399',
];

interface AssetBreakdownProps {
  data: Breakdown[];
  currency: string;
}

export function AssetBreakdown({ data, currency }: AssetBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No data to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          nameKey="key"
        >
          {data.map((_entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value), currency), 'Value']}
          labelFormatter={(label: unknown) => String(label)}
        />
        <Legend
          formatter={(value: string) => {
            const item = data.find((d) => d.key === value);
            return `${value} (${item ? formatPercent(item.weight) : ''})`;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
