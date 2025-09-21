
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StockMovementPage() {
    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Movimientos de stock</h2>
            <Card>
                <CardHeader>
                    <CardTitle>Página no disponible</CardTitle>
                    <CardDescription>Esta sección ha sido desactivada.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">La funcionalidad de movimiento de stock ya no está disponible en esta sección.</p>
                </CardContent>
            </Card>
        </div>
    );
}
