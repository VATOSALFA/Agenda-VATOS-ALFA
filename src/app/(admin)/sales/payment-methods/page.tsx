
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PlusCircle } from "lucide-react";

const paymentMethods = [
  { id: 'pm_001', name: 'Efectivo', enabled: true },
  { id: 'pm_002', name: 'Tarjeta de Crédito', enabled: true },
  { id: 'pm_003', name: 'Tarjeta de Débito', enabled: true },
  { id: 'pm_004', name: 'Transferencia Bancaria', enabled: false },
];

export default function PaymentMethodsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Métodos de Pago</h2>
        <div className="flex items-center space-x-2">
          <Button><PlusCircle className="mr-2 h-4 w-4" /> Agregar Método de Pago</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Métodos de Pago Disponibles</CardTitle>
          <CardDescription>Gestiona los métodos de pago aceptados en la barbería.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead className="w-[200px]">Habilitado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentMethods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell className="font-medium">{method.name}</TableCell>
                  <TableCell>
                    <Switch
                      id={`switch-${method.id}`}
                      checked={method.enabled}
                      aria-label={`Estado de ${method.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú para {method.name}</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive hover:!text-destructive">Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
