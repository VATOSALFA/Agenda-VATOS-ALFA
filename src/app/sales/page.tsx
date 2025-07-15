import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function SalesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Ventas</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Ventas</CardTitle>
          <CardDescription>Selecciona una subcategoría para ver los detalles de ventas.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Bienvenido al módulo de ventas. Utiliza el menú de navegación para acceder a las diferentes secciones.</p>
        </CardContent>
      </Card>
    </div>
  );
}
