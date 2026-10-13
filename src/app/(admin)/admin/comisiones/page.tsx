'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
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
import { Loader2, HelpCircle, Pencil, Percent, Scissors, Package } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
      setDiscountsAffectCommissions(!checked);
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
      <div className="flex-1 space-y-4 p-3 sm:p-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Comisiones</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Configura esquemas de comisiones para profesionales, servicios y productos de venta.
            </p>
          </div>
        </div>

        {/* Setting Card */}
        <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer">
                Los descuentos afectan la comisión
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 text-xs border-2 border-blue-500 rounded-xl bg-card shadow-xl">
                  <p className="font-semibold mb-1 text-foreground">Cálculo de Descuentos:</p>
                  <p className="text-muted-foreground leading-relaxed">
                    <strong>Activo:</strong> la comisión se calcula sobre el total final tras aplicar descuentos.<br />
                    <strong>Inactivo:</strong> la comisión se calcula sobre el precio de lista original.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            {isSettingsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Switch
                checked={discountsAffectCommissions}
                onCheckedChange={toggleDiscountsSetting}
              />
            )}
          </div>
        </Card>

        <Tabs defaultValue="por-profesional" className="space-y-4">
          <TabsList className="bg-muted/40 p-1 border border-border/60 rounded-xl h-auto">
            <TabsTrigger value="por-profesional" className="rounded-lg text-xs py-1.5 px-3">
              Por profesional
            </TabsTrigger>
            <TabsTrigger value="por-servicio" className="rounded-lg text-xs py-1.5 px-3">
              Por servicio
            </TabsTrigger>
            <TabsTrigger value="por-producto" className="rounded-lg text-xs py-1.5 px-3">
              Por producto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="por-profesional" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))
              ) : sortedProfessionals.length > 0 ? (
                sortedProfessionals.map((prof) => (
                  <Card
                    key={prof.id}
                    className="rounded-xl border border-border/60 bg-card/50 hover:border-blue-500/40 hover:bg-card/80 transition-all p-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Percent className="h-4 w-4 text-blue-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold truncate text-foreground">
                        {prof.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProfessional(prof)}
                      className="text-slate-400 hover:text-foreground transition-colors p-1 shrink-0"
                      title="Editar comisión"
                      aria-label={`Editar comisión de ${prof.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Card>
                ))
              ) : (
                <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
                  No hay profesionales registrados.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="por-servicio" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))
              ) : sortedServices.length > 0 ? (
                sortedServices.map((serv) => (
                  <Card
                    key={serv.id}
                    className="rounded-xl border border-border/60 bg-card/50 hover:border-blue-500/40 hover:bg-card/80 transition-all p-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Scissors className="h-4 w-4 text-blue-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold truncate text-foreground">
                        {serv.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingService(serv)}
                      className="text-slate-400 hover:text-foreground transition-colors p-1 shrink-0"
                      title="Editar comisión"
                      aria-label={`Editar comisión de ${serv.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Card>
                ))
              ) : (
                <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
                  No hay servicios registrados.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="por-producto" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))
              ) : sortedProducts.length > 0 ? (
                sortedProducts.map((prod) => (
                  <Card
                    key={prod.id}
                    className="rounded-xl border border-border/60 bg-card/50 hover:border-blue-500/40 hover:bg-card/80 transition-all p-3 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Package className="h-4 w-4 text-blue-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold truncate text-foreground">
                        {prod.nombre}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProduct(prod)}
                      className="text-slate-400 hover:text-foreground transition-colors p-1 shrink-0"
                      title="Editar comisión"
                      aria-label={`Editar comisión de ${prod.nombre}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Card>
                ))
              ) : (
                <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
                  No hay productos registrados.
                </div>
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
