"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney } from "@/lib/money";

const config = {
  invoiced: { label: "Invoiced", color: "var(--chart-1)" },
  collected: { label: "Collected", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Invoiced vs collected per month. Amounts arrive in minor units. */
export function MoneyByMonthChart({ data }: { data: { month: string; invoiced: number; collected: number }[] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={70} tickFormatter={(v: number) => `${Math.round(v / 100_000)}k`} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => `${config[name as keyof typeof config]?.label ?? name}: ${formatMoney(Number(v))}`} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="invoiced" fill="var(--color-invoiced)" radius={4} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

const countConfig = { count: { label: "Subscriptions", color: "var(--chart-1)" } } satisfies ChartConfig;

export function CountChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ChartContainer config={countConfig} className="h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={150} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
