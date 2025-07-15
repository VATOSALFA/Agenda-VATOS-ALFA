import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function PaymentsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pagos y Transferencias</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pagos y Transferencias</CardTitle>
          <CardDescription>Historial y gestión de pagos y transferencias.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Contenido de la página de Pagos y Transferencias.</p>
        </CardContent>
      </Card>
    </div>
  );
}
