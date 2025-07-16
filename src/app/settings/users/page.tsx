
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Info, Pencil, Trash2, ChevronLeft, ChevronRight, UserCircle } from "lucide-react";

const mockUsers = [
  { id: 1, name: 'Azucena Sánchez Sánchez', email: 'vatosalfaazucena@gmail.com', role: 'Recepcionista' },
  { id: 2, name: 'Beatriz administradora', email: 'vatosalfasuc1@gmail.com', role: 'Administrador Local' },
  { id: 3, name: 'Erick Ivan Reyes Rodas', email: 'reyesrodaserickivan@gmail.com', role: 'Staff' },
  { id: 4, name: 'Zeus Alejandro Pacheco Almora', email: 'vatosalfazeus@gmail.com', role: 'Recepcionista' },
  { id: 5, name: 'Karina Ruiz Rosales', email: 'rosaleskary51@gmail.com', role: 'Staff' },
  { id: 6, name: 'Lupita', email: 'mishellecampos447@gmail.com', role: 'Staff' },
  { id: 7, name: 'GLORIA IVON HERNÁNDEZ HERNÁNDEZ', email: 'gloriaivon_25@hotmail.com', role: 'Staff' },
  { id: 8, name: 'Beatriz Elizarraga Casas', email: 'jezbeth94@gmail.com', role: 'Staff' },
  { id: 9, name: 'Alejandro Pacheco', email: 'vatosalfa@gmail.com', role: 'Administrador general' },
  { id: 10, name: 'Usuario Ejemplo 10', email: 'user10@example.com', role: 'Staff' },
  { id: 11, name: 'Usuario Ejemplo 11', email: 'user11@example.com', role: 'Staff' },
];

export default function UsersPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const totalPages = Math.ceil(mockUsers.length / itemsPerPage);
  const paginatedUsers = mockUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>En esta pantalla podrás crear y gestionar usuarios.</AlertTitle>
        <AlertDescription>
          Recuerda que un usuario no es lo mismo que un profesional, los usuarios son ilimitados y sirven para asignar diferentes permisos a cada persona que trabaje en tu compañía.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between space-y-2 pt-4">
        <h2 className="text-3xl font-bold tracking-tight">Usuarios registrados</h2>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuario" className="pl-10" />
          </div>
          <Button variant="outline">
            <UserCircle className="mr-2 h-4 w-4" />
            Cuenta y facturación
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol asignado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      <div className="flex items-center justify-end space-x-6 pt-4">
        <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Resultados por página</p>
            <Select
                value={`${itemsPerPage}`}
                onValueChange={(value) => {
                    setItemsPerPage(Number(value))
                    setCurrentPage(1)
                }}
            >
                <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={itemsPerPage} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <div className="text-sm font-medium">
          Página {currentPage} de {totalPages}
        </div>
        <div className="flex items-center space-x-2">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
            >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
            >
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
        </div>
      </div>
    </div>
  );
}
