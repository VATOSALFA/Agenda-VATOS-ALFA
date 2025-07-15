import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Search, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const clients = [
  { id: 'CLI001', name: 'Juan Ignacio Pérez', phone: '+56 9 1234 5678', email: 'juan.perez@email.com', lastVisit: '2024-05-10', totalAppointments: 12 },
  { id: 'CLI002', name: 'Carlos Alberto Gómez', phone: '+56 9 8765 4321', email: 'carlos.gomez@email.com', lastVisit: '2024-05-15', totalAppointments: 8 },
  { id: 'CLI003', name: 'Luis Fernando Rodriguez', phone: '+56 9 1122 3344', email: 'luis.rodriguez@email.com', lastVisit: '2024-04-20', totalAppointments: 5 },
  { id: 'CLI004', name: 'Miguel Ángel Hernández', phone: '+56 9 5566 7788', email: 'miguel.hernandez@email.com', lastVisit: '2024-05-18', totalAppointments: 2 },
  { id: 'CLI005', name: 'Jorge Luis Martinez', phone: '+56 9 9988 7766', email: 'jorge.martinez@email.com', lastVisit: '2024-03-01', totalAppointments: 15 },
];

export default function ClientsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Base de Clientes</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Cargar clientes (CSV)</Button>
          <Button><PlusCircle className="mr-2 h-4 w-4" /> Crear nuevo cliente</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
          <CardDescription>Busca y gestiona los clientes de VATOS ALFA.</CardDescription>
          <div className="flex items-center space-x-4 pt-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre, teléfono, correo..." className="pl-10" />
            </div>
            <Select>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Barbero" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="el-patron">El Patrón</SelectItem>
                    <SelectItem value="el-sicario">El Sicario</SelectItem>
                    <SelectItem value="el-padrino">El Padrino</SelectItem>
                </SelectContent>
            </Select>
            <Select>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Género" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="femenino">Femenino</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
            </Select>
             <Button variant="ghost">Limpiar Filtros</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identificación</TableHead>
                <TableHead>Nombre y Apellido</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Última Visita</TableHead>
                <TableHead>Total Citas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.id}</TableCell>
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>{client.email}</TableCell>
                  <TableCell>{client.lastVisit}</TableCell>
                  <TableCell>{client.totalAppointments}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Ver Ficha</DropdownMenuItem>
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
