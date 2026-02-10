
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
        <Card>
            <CardHeader>
                <CardTitle className="text-xl font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 items-center">
                <div className="h-[320px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={110}
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
                                    border: '1px solid hsl(var(--border))'
                                }}
                                formatter={(value: number) => `$${value.toLocaleString('es-MX')}`}
                            />}
                        </RechartsPieChart>
                    </ResponsiveContainer>
                    {data.length > 0 && <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                        <span className="text-2xl font-bold">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>}
                </div>
                <div className="text-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-right">Monto</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableData.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell className="capitalize font-medium flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                        {item.name}
                                    </TableCell>
                                    <TableCell className="text-right">${item.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
