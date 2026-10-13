
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';

interface DonutChartCardProps {
    title: string;
    data: { name: string; value: number }[];
    total: number;
    dataLabels?: string[];
}

export const DonutChartCard = ({ title, data, total, dataLabels }: DonutChartCardProps) => {
    const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

    const allLabels = dataLabels || ['Efectivo', 'Tarjeta', 'Transferencia'];

    const tableData = allLabels.map(label => {
        const found = data.find(d => d.name.toLowerCase() === label.toLowerCase());
        return {
            name: label,
            value: found ? found.value : 0,
        };
    });

    const chartData = data.length > 0 ? data : [{ name: 'Sin datos', value: 1 }];

    return (
        <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="p-3 sm:p-6 pb-1 sm:pb-2">
                <CardTitle className="text-base sm:text-xl font-semibold">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 items-center">
                <div className="h-[200px] sm:h-[300px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius="55%"
                                outerRadius="82%"
                                fill="#8884d8"
                                paddingAngle={data.length > 0 ? 2 : 0}
                                dataKey="value"
                                labelLine={false}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={data.length > 0 ? COLORS[index % COLORS.length] : '#e5e7eb'} />
                                ))}
                            </Pie>
                            {data.length > 0 && <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '0.75rem',
                                    fontSize: '12px'
                                }}
                                formatter={(value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            />}
                        </RechartsPieChart>
                    </ResponsiveContainer>
                    {data.length > 0 && <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                        <span className="text-lg sm:text-2xl font-bold">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>}
                </div>
                <div className="text-xs sm:text-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-border/40">
                                <TableHead className="h-8 px-2 text-xs">Tipo</TableHead>
                                <TableHead className="h-8 px-2 text-right text-xs">Monto</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableData.map((item, index) => (
                                <TableRow key={index} className="border-b border-border/40">
                                    <TableCell className="capitalize font-medium flex items-center gap-2 py-1.5 px-2">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                        <span className="truncate">{item.name}</span>
                                    </TableCell>
                                    <TableCell className="text-right py-1.5 px-2 font-semibold">${item.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
