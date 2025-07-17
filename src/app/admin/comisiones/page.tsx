
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { EditComisionesModal } from '@/components/admin/comisiones/edit-comisiones-modal';
import { EditDefaultComisionModal } from '@/components/admin/comisiones/edit-default-comision-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditServiceComisionesModal } from '@/components/admin/comisiones/edit-service-comisiones-modal';
import { EditDefaultServiceComisionModal } from '@/components/admin/comisiones/edit-default-service-comision-modal';


const professionals = [
  { id: 'prof_1', name: 'Beatriz Elizarraga Casas', serviceCount: 12, defaultCommission: { value: 50, type: '%' } },
  { id: 'prof_2', name: 'Gloria Ivon', serviceCount: 11, defaultCommission: { value: 45, type: '%' } },
  { id: 'prof_3', name: 'Karina Ruiz Rosales', serviceCount: 11, defaultCommission: { value: 150, type: '$' } },
  { id: 'prof_4', name: 'Lupita', serviceCount: 12, defaultCommission: { value: 50, type: '%' } },
  { id: 'prof_5', name: 'Erick', serviceCount: 13, defaultCommission: { value: 55, type: '%' } },
];

const services = [
    { id: 'serv_1', name: 'Todo para el Campeón', defaultCommission: { value: 50, type: '%' } },
    { id: 'serv_2', name: 'Renovación Alfa', defaultCommission: { value: 50, type: '%' } },
    { id: 'serv_3', name: 'Héroe en descanso', defaultCommission: { value: 50, type: '%' } },
    { id: 'serv_4', name: 'El Caballero Alfa', defaultCommission: { value: 50, type: '%' } },
    { id: 'serv_5', name: 'El Alfa Superior', defaultCommission: { value: 50, type: '%' } },
    { id: 'serv_6', name: 'Facial completo con Masajeador', defaultCommission: { value: 100, type: '$' } },
    { id: 'serv_7', name: 'Arreglo de ceja', defaultCommission: { value: 15, type: '%' } },
];


export type Professional = typeof professionals[0];
export type Service = typeof services[0];

export default function ComisionesPage() {
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [editingDefault, setEditingDefault] = useState<Professional | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingDefaultService, setEditingDefaultService] = useState<Service | null>(null);
  const [viewType, setViewType] = useState('por profesional');


  const handleEditProfessional = (prof: Professional) => {
    setEditingProfessional(prof);
  };

  const handleEditDefaultProfessional = (prof: Professional) => {
    setEditingDefault(prof);
  };

  const handleEditService = (serv: Service) => {
    setEditingService(serv);
  }

  const handleEditDefaultService = (serv: Service) => {
    setEditingDefaultService(serv);
  }

  const handleCloseModals = () => {
    setEditingProfessional(null);
    setEditingDefault(null);
    setEditingService(null);
    setEditingDefaultService(null);
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

        {viewType === 'por profesional' ? (
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
                  <Button variant="outline" size="sm" onClick={() => handleEditProfessional(prof)}>Editar</Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEditDefaultProfessional(prof)}>Editar Por Defecto</Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map((serv) => (
              <Card key={serv.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-bold">{serv.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Comisión por Defecto: {serv.defaultCommission.value}{serv.defaultCommission.type}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEditService(serv)}>Editar</Button>
                  <Button variant="secondary" size="sm" onClick={() => handleEditDefaultService(serv)}>Editar Por Defecto</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Professional Modals */}
      {editingProfessional && (
        <EditComisionesModal
          isOpen={!!editingProfessional}
          onClose={handleCloseModals}
          professional={editingProfessional}
        />
      )}
       {editingDefault && (
        <EditDefaultComisionModal
          isOpen={!!editingDefault}
          onClose={handleCloseModals}
          professional={editingDefault}
        />
      )}

      {/* Service Modals */}
       {editingService && (
        <EditServiceComisionesModal
          isOpen={!!editingService}
          onClose={handleCloseModals}
          service={editingService}
        />
      )}
      {editingDefaultService && (
        <EditDefaultServiceComisionModal
            isOpen={!!editingDefaultService}
            onClose={handleCloseModals}
            service={editingDefaultService}
        />
      )}
    </>
  );
}
