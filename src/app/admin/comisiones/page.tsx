
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { EditComisionesModal } from '@/components/admin/comisiones/edit-comisiones-modal';
import { EditDefaultComisionModal } from '@/components/admin/comisiones/edit-default-comision-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


const professionals = [
  { id: 'prof_1', name: 'Beatriz Elizarraga Casas', serviceCount: 12, defaultCommission: { value: 50, type: '%' } },
  { id: 'prof_2', name: 'Gloria Ivon', serviceCount: 11, defaultCommission: { value: 45, type: '%' } },
  { id: 'prof_3', name: 'Karina Ruiz Rosales', serviceCount: 11, defaultCommission: { value: 150, type: '$' } },
  { id: 'prof_4', name: 'Lupita', serviceCount: 12, defaultCommission: { value: 50, type: '%' } },
  { id: 'prof_5', name: 'Erick', serviceCount: 13, defaultCommission: { value: 55, type: '%' } },
];

export type Professional = typeof professionals[0];

export default function ComisionesPage() {
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [editingDefault, setEditingDefault] = useState<Professional | null>(null);
  const [viewType, setViewType] = useState('por profesional');


  const handleEdit = (prof: Professional) => {
    setEditingProfessional(prof);
  };

  const handleEditDefault = (prof: Professional) => {
    setEditingDefault(prof);
  };

  const handleCloseModal = () => {
    setEditingProfessional(null);
    setEditingDefault(null);
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Comisiones</h2>
        </div>

        <div className="pb-4">
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Ver las comisiones {viewType}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setViewType('por profesional')}>
                Ver las comisiones por profesional
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setViewType('por servicio')}>
                Ver las comisiones por servicio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {professionals.map((prof) => (
            <Card key={prof.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-bold">{prof.name}</p>
                <p className="text-sm text-muted-foreground">
                  Número De Servicios {prof.serviceCount}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(prof)}>Editar</Button>
                <Button variant="secondary" size="sm" onClick={() => handleEditDefault(prof)}>Editar Por Defecto</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      {editingProfessional && (
        <EditComisionesModal
          isOpen={!!editingProfessional}
          onClose={handleCloseModal}
          professional={editingProfessional}
        />
      )}
       {editingDefault && (
        <EditDefaultComisionModal
          isOpen={!!editingDefault}
          onClose={handleCloseModal}
          professional={editingDefault}
        />
      )}
    </>
  );
}
