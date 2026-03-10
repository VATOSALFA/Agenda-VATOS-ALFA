import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function SubscriptionsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Abonos</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Abonos de Clientes</CardTitle>
          <CardDescription>Gestión de los abonos y saldos de clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Contenido de la página de Abonos.</p>
        </CardContent>
      </Card>
    </div>
  );
}
