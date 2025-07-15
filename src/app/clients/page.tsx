
'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Search, Upload } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Client } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NewClientForm } from "@/components/clients/new-client-form";
import { ClientDetailModal } from "@/components/clients/client-detail-modal";

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailModalOpen(true);
  };

  const filteredClients = clients.filter(client =>
    (client.nombre.toLowerCase() + ' ' + client.apellido.toLowerCase()).includes(searchTerm.toLowerCase()) ||
    (client.telefono && client.telefono.includes(searchTerm)) ||
    (client.correo && client.correo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Base de Clientes</h2>
          <div className="flex items-center space-x-2">
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Cargar clientes (CSV)</Button>
            <Button onClick={() => setIsClientModalOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Crear nuevo cliente
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Lista de Clientes</CardTitle>
            <CardDescription>Busca y gestiona los clientes de VATOS ALFA.</CardDescription>
            <div className="flex items-center space-x-4 pt-4">
              <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por nombre, teléfono, correo..." 
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre y Apellido</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Última Visita</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.nombre} {client.apellido}</TableCell>
                    <TableCell>{client.telefono}</TableCell>
                    <TableCell>{client.correo}</TableCell>
                    <TableCell>2024-05-18</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(client)}>Ver Ficha</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
                          {client.telefono && (
                            <DropdownMenuItem>
                              <a href={`https://wa.me/${client.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                Enviar WhatsApp
                              </a>
                            </DropdownMenuItem>
                          )}
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

      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
            <NewClientForm onFormSubmit={() => setIsClientModalOpen(false)} />
        </DialogContent>
      </Dialog>
      
      {selectedClient && (
        <ClientDetailModal 
          client={selectedClient} 
          isOpen={isDetailModalOpen} 
          onOpenChange={setIsDetailModalOpen}
        />
      )}
    </>
  );
}
