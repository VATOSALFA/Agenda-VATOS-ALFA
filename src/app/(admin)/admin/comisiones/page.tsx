
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EditComisionesModal } from '@/components/admin/comisiones/edit-comisiones-modal';
import { EditServiceComisionesModal } from '@/components/admin/comisiones/edit-service-comisiones-modal';
import { EditProductComisionModal } from '@/components/admin/comisiones/edit-product-comision-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import type { Profesional, Service, Product } from '@/lib/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


export default function ComisionesPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);

  const [editingProfessional, setEditingProfessional] = useState<Profesional | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [discountsAffectCommissions, setDiscountsAffectCommissions] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'commissions');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDiscountsAffectCommissions(data.discountsAffectCommissions ?? true);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setIsSettingsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const toggleDiscountsSetting = async (checked: boolean) => {
    setDiscountsAffectCommissions(checked);
    try {
      await setDoc(doc(db, 'settings', 'commissions'), {
        discountsAffectCommissions: checked
      }, { merge: true });
      toast({ title: "Configuración actualizada", description: checked ? "Los descuentos AHORA afectan las comisiones." : "Los descuentos YA NO afectan las comisiones." });
    } catch (error) {
      console.error("Error saving setting:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la configuración." });
      setDiscountsAffectCommissions(!checked); // Revert on error
    }
  };

  const sortedProfessionals = useMemo(() => [...professionals].filter(p => p.active && !p.deleted).sort((a, b) => a.name.localeCompare(b.name)), [professionals]);
  const sortedServices = useMemo(() => [...services].sort((a, b) => a.name.localeCompare(b.name)), [services]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.nombre.localeCompare(b.nombre)), [products]);

  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1);
  };

  const handleCloseModals = () => {
    setEditingProfessional(null);
    setEditingService(null);
    setEditingProduct(null);
  };

  const isLoading = professionalsLoading || servicesLoading || productsLoading;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Comisiones</h2>
        </div>

        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Los descuentos afectan la comisión</Label>
              <p className="text-sm text-muted-foreground">
                Si está activo, la comisión se calcula sobre el total DESPUÉS de descuentos. <br />
                Si está inactivo, se calcula sobre el precio original.
              </p>
            </div>
            {isSettingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <Switch
                checked={discountsAffectCommissions}
                onCheckedChange={toggleDiscountsSetting}
              />
            )}
          </div>
        </Card>

        <Tabs defaultValue="por-profesional" className="space-y-4">
          <TabsList>
            <TabsTrigger value="por-profesional">Por profesional</TabsTrigger>
            <TabsTrigger value="por-servicio">Por servicio</TabsTrigger>
            <TabsTrigger value="por-producto">Por producto</TabsTrigger>
          </TabsList>

          <TabsContent value="por-profesional">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : (
                sortedProfessionals.map((prof) => (
                  <Card key={prof.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-bold">{prof.name}</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : (
                sortedServices.map((serv) => (
                  <Card key={serv.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-bold">{serv.name}</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : (
                sortedProducts.map((prod) => (
                  <Card key={prod.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-bold">{prod.nombre}</p>
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

      {/* Product Modals */}
      {editingProduct && (
        <EditProductComisionModal
          isOpen={!!editingProduct}
          onClose={handleCloseModals}
          product={editingProduct}
          onDataSaved={handleDataUpdated}
          professionals={sortedProfessionals}
        />
      )}
    </>
  );
}
