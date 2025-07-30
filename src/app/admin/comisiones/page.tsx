
'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EditComisionesModal } from '@/components/admin/comisiones/edit-comisiones-modal';
import { EditDefaultComisionModal } from '@/components/admin/comisiones/edit-default-comision-modal';
import { EditServiceComisionesModal } from '@/components/admin/comisiones/edit-service-comisiones-modal';
import { EditDefaultServiceComisionModal } from '@/components/admin/comisiones/edit-default-service-comision-modal';
import { EditProductComisionModal } from '@/components/admin/comisiones/edit-product-comision-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';

export interface Commission {
    value: number;
    type: '%' | '$';
}

export interface Professional {
  id: string;
  name: string;
  serviceCount?: number; // This might be a calculated field
  defaultCommission: Commission;
  comisionesPorServicio?: { [serviceName: string]: Commission };
}

export interface Service {
  id: string;
  name: string;
  defaultCommission: Commission;
  comisionesPorProfesional?: { [profesionalId: string]: Commission };
}

export interface Product {
  id: string;
  name: string;
  defaultCommission: Commission;
}

export default function ComisionesPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Professional>('profesionales', queryKey);
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);

  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [editingDefault, setEditingDefault] = useState<Professional | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingDefaultService, setEditingDefaultService] = useState<Service | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const sortedProfessionals = useMemo(() => [...professionals].sort((a, b) => a.name.localeCompare(b.name)), [professionals]);
  const sortedServices = useMemo(() => [...services].sort((a, b) => a.name.localeCompare(b.name)), [services]);

  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1);
  };
  
  const handleCloseModals = () => {
    setEditingProfessional(null);
    setEditingDefault(null);
    setEditingService(null);
    setEditingDefaultService(null);
    setEditingProduct(null);
  };
  
  const isLoading = professionalsLoading || servicesLoading || productsLoading;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Comisiones</h2>
        </div>

        <Tabs defaultValue="por-profesional" className="space-y-4">
          <TabsList>
            <TabsTrigger value="por-profesional">Por profesional</TabsTrigger>
            <TabsTrigger value="por-servicio">Por servicio</TabsTrigger>
            <TabsTrigger value="por-producto">Por producto</TabsTrigger>
          </TabsList>
          
          <TabsContent value="por-profesional">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isLoading ? (
                Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : (
                professionals.map((prof) => (
                  <Card key={prof.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-bold">{prof.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Comisión por defecto: {prof.defaultCommission?.value}{prof.defaultCommission?.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingProfessional(prof)}>Editar</Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="por-servicio">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {isLoading ? (
                Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : (
                services.map((serv) => (
                  <Card key={serv.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-bold">{serv.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Comisión por Defecto: {serv.defaultCommission?.value}{serv.defaultCommission?.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingService(serv)}>Editar</Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="por-producto">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isLoading ? (
                Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : (
                products.map((prod) => (
                  <Card key={prod.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-bold">{prod.name}</p>
                       <p className="text-sm text-muted-foreground">
                        Comisión por Defecto: {prod.defaultCommission?.value}{prod.defaultCommission?.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingProduct(prod)}>Editar</Button>
                    </div>
                  </Card>
                ))
               )}
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
          onDataSaved={handleDataUpdated}
          services={sortedServices}
        />
      )}
       {editingDefault && (
        <EditDefaultComisionModal
          isOpen={!!editingDefault}
          onClose={handleCloseModals}
          professional={editingDefault}
          onDataSaved={handleDataUpdated}
        />
      )}

      {/* Service Modals */}
       {editingService && (
        <EditServiceComisionesModal
          isOpen={!!editingService}
          onClose={handleCloseModals}
          service={editingService}
          onDataSaved={handleDataUpdated}
          professionals={sortedProfessionals}
        />
      )}
      {editingDefaultService && (
        <EditDefaultServiceComisionModal
            isOpen={!!editingDefaultService}
            onClose={handleCloseModals}
            service={editingDefaultService}
            onDataSaved={handleDataUpdated}
        />
      )}

      {/* Product Modals */}
      {editingProduct && (
        <EditProductComisionModal
          isOpen={!!editingProduct}
          onClose={handleCloseModals}
          product={editingProduct}
          onDataSaved={handleDataUpdated}
        />
      )}
    </>
  );
}
