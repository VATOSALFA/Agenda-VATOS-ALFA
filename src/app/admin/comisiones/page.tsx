
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EditComisionesModal } from '@/components/admin/comisiones/edit-comisiones-modal';
import { EditDefaultComisionModal } from '@/components/admin/comisiones/edit-default-comision-modal';
import { EditServiceComisionesModal } from '@/components/admin/comisiones/edit-service-comisiones-modal';
import { EditDefaultServiceComisionModal } from '@/components/admin/comisiones/edit-default-service-comision-modal';
import { EditProductComisionModal } from '@/components/admin/comisiones/edit-product-comision-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


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

const products = [
    { id: 'prod_1', name: 'SERUM COCTEL MULTINUTRIENTES', defaultCommission: { value: 15, type: '%' } },
    { id: 'prod_2', name: 'SERUM CRECIMIENTO CAPILAR 7% MINOXIDIL', defaultCommission: { value: 15, type: '%' } },
    { id: 'prod_3', name: 'MASCARILLA CARBON ACTIVADO', defaultCommission: { value: 15, type: '%' } },
    { id: 'prod_4', name: 'SHAMPOO CRECIMIENTO ACELERADO', defaultCommission: { value: 15, type: '%' } },
    { id: 'prod_5', name: 'JABÓN LÍQUIDO PURIFICANTE Y EXFOLIANTE', defaultCommission: { value: 15, type: '%' } },
    { id: 'prod_6', name: 'AFTER SHAVE', defaultCommission: { value: 10, type: '%' } },
];


export type Professional = typeof professionals[0];
export type Service = typeof services[0];
export type Product = typeof products[0];

export default function ComisionesPage() {
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [editingDefault, setEditingDefault] = useState<Professional | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingDefaultService, setEditingDefaultService] = useState<Service | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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

  const handleEditProduct = (prod: Product) => {
    setEditingProduct(prod);
  }

  const handleCloseModals = () => {
    setEditingProfessional(null);
    setEditingDefault(null);
    setEditingService(null);
    setEditingDefaultService(null);
    setEditingProduct(null);
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Comisiones</h2>
        </div>

        <Tabs defaultValue="por profesional" className="space-y-4">
          <TabsList>
            <TabsTrigger value="por profesional">Por profesional</TabsTrigger>
            <TabsTrigger value="por servicio">Por servicio</TabsTrigger>
            <TabsTrigger value="por producto">Por producto</TabsTrigger>
          </TabsList>
          
          <TabsContent value="por profesional">
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
          </TabsContent>

          <TabsContent value="por servicio">
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
          </TabsContent>

          <TabsContent value="por producto">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.map((prod) => (
                <Card key={prod.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-bold">{prod.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Comisión por Defecto: {prod.defaultCommission.value}{prod.defaultCommission.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditProduct(prod)}>Editar</Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
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

      {/* Product Modals */}
      {editingProduct && (
        <EditProductComisionModal
          isOpen={!!editingProduct}
          onClose={handleCloseModals}
          product={editingProduct}
        />
      )}
    </>
  );
}
