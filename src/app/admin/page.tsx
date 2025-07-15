import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function AdminPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Administración</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Configuración General</CardTitle>
          <CardDescription>Ajustes generales de la aplicación y la barbería.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre de la Barbería</label>
            <Input defaultValue="VATOS ALFA" />
          </div>
          <Separator />
          <div className="space-y-2">
            <label className="text-sm font-medium">Horario de Apertura</label>
            <Input type="time" defaultValue="09:00" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Horario de Cierre</label>
            <Input type="time" defaultValue="21:00" />
          </div>
          <Button>Guardar Cambios</Button>
        </CardContent>
      </Card>
    </div>
  );
}
