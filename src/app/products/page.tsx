
'use client';

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreHorizontal, PlusCircle, Search, Upload, Plus, Minus, Bell, Download, ChevronDown, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NewProductModal } from "@/components/products/new-product-modal";
import { CategoryModal } from "@/components/products/category-modal";
import { BrandModal } from "@/components/products/brand-modal";
import { PresentationModal } from "@/components/products/presentation-modal";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Product, ProductCategory, ProductBrand, ProductPresentation } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { doc, deleteDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";


export default function InventoryPage() {
  const [queryKey, setQueryKey] = useState(0);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isPresentationModalOpen, setIsPresentationModalOpen] = useState(false);
  
  const { toast } = useToast();

  // Firestore Queries
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);
  const { data: categories } = useFirestoreQuery<ProductCategory>('categorias_productos', queryKey);
  const { data: brands } = useFirestoreQuery<ProductBrand>('marcas_productos', queryKey);
  const { data: presentations } = useFirestoreQuery<ProductPresentation>('formatos_productos', queryKey);

  const isLoading = productsLoading;

  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1);
  };
  
  const openNewModal = () => {
    setEditingProduct(null);
    setIsNewProductModalOpen(true);
  }

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsNewProductModalOpen(true);
  }

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await deleteDoc(doc(db, "productos", productToDelete.id));
      toast({
        title: "Producto Eliminado",
        description: `El producto "${productToDelete.nombre}" ha sido eliminado.`,
      });
      handleDataUpdated();
    } catch (error) {
      console.error("Error deleting product: ", error);
       toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el producto.",
      });
    } finally {
        setProductToDelete(null);
    }
  };
  
  const handleStockChange = async (product: Product, amount: number) => {
      if (product.stock + amount < 0) {
          toast({ variant: 'destructive', title: 'Stock insuficiente' });
          return;
      }
      try {
        const productRef = doc(db, 'productos', product.id);
        await updateDoc(productRef, {
            stock: increment(amount)
        });
         toast({ title: `Stock actualizado para ${product.nombre}` });
         handleDataUpdated();
      } catch (error) {
        console.error("Error updating stock:", error);
        toast({ variant: 'destructive', title: 'Error al actualizar stock' });
      }
  }
  
  const getEntityName = (id: string, entities: {id: string, name: string}[]) => {
      return entities?.find(e => e.id === id)?.name || 'N/A';
  }


  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-start justify-between space-y-2">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Inventario</h2>
            <p className="text-muted-foreground">Lleva seguimiento de los productos que ofreces en cada uno de tus locales.</p>
        </div>
        <div className="flex items-center space-x-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre, marca..." className="pl-10" />
            </div>
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Carga masiva</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" /> Nuevo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end">
                <DropdownMenuLabel>Crear nuevo</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={openNewModal}>
                    <div>
                        <p className="font-semibold">Nuevo Producto</p>
                        <p className="text-xs text-muted-foreground">Agrega un producto nuevo a tu inventario</p>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsCategoryModalOpen(true)}>
                     <div>
                        <p className="font-semibold">Nueva Categoría</p>
                        <p className="text-xs text-muted-foreground">Crea categorías de productos para filtrarlos más rápido</p>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsBrandModalOpen(true)}>
                     <div>
                        <p className="font-semibold">Nueva Marca</p>
                        <p className="text-xs text-muted-foreground">Incorpora una marca de los productos que comercializas</p>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsPresentationModalOpen(true)}>
                     <div>
                        <p className="font-semibold">Nuevo Formato/Presentación</p>
                        <p className="text-xs text-muted-foreground">Agrega los ml, gr o unidades estándar de tus productos</p>
                    </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select><SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent/></Select>
            <Select><SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger><SelectContent/></Select>
            <Select><SelectTrigger><SelectValue placeholder="Formato/Presentación" /></SelectTrigger><SelectContent/></Select>
            <Select><SelectTrigger><SelectValue placeholder="Estado del producto" /></SelectTrigger><SelectContent/></Select>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle>VATOS ALFA Barber Shop</CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="outline"><Bell className="mr-2 h-4 w-4" /> Alarmas de local</Button>
                    <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar inventario</Button>
                </div>
            </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código de barras</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Formato/Presentación</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Opciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                  Array.from({length: 5}).map((_, i) => (
                      <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                      </TableRow>
                  ))
              ) : products.map((product) => (
                <TableRow key={product.id} className={cn(product.stock === 0 && 'bg-red-500/10 hover:bg-red-500/20')}>
                  <TableCell className="font-mono text-xs">{product.barcode || 'N/A'}</TableCell>
                  <TableCell className="font-medium">{product.nombre}</TableCell>
                  <TableCell>{getEntityName(product.category_id, categories)}</TableCell>
                  <TableCell>{getEntityName(product.brand_id, brands)}</TableCell>
                  <TableCell>{getEntityName(product.presentation_id, presentations)}</TableCell>
                  <TableCell>${(product.public_price || 0).toLocaleString('es-CL')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <span>{product.stock}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-auto px-2" onClick={() => handleStockChange(product, 1)}><Plus className="mr-1 h-3 w-3" /> Stock</Button>
                        <Button size="sm" variant="ghost" className="h-6 w-auto px-2" onClick={() => handleStockChange(product, -1)}><Minus className="mr-1 h-3 w-3" /> Stock</Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Acciones <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditModal(product)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem>Ver historial de movimientos</DropdownMenuItem>
                        <DropdownMenuItem>Desactivar producto</DropdownMenuItem>
                         <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setProductToDelete(product)} className="text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10">
                            <Trash2 className="mr-2 h-4 w-4"/>
                            Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
           {!isLoading && products.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">Aún no tienes productos. ¡Agrega uno!</p>
          )}
        </CardContent>
      </Card>
    </div>

    {isNewProductModalOpen && (
        <NewProductModal 
          isOpen={isNewProductModalOpen}
          onClose={() => setIsNewProductModalOpen(false)}
          onDataSaved={handleDataUpdated}
          product={editingProduct}
        />
    )}
    {isCategoryModalOpen && (
        <CategoryModal 
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onDataSaved={handleDataUpdated}
        />
    )}
    {isBrandModalOpen && (
        <BrandModal
            isOpen={isBrandModalOpen}
            onClose={() => setIsBrandModalOpen(false)}
            onDataSaved={handleDataUpdated}
        />
    )}
    {isPresentationModalOpen && (
        <PresentationModal
            isOpen={isPresentationModalOpen}
            onClose={() => setIsPresentationModalOpen(false)}
            onDataSaved={handleDataUpdated}
        />
    )}

    {productToDelete && (
        <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente el producto "{productToDelete.nombre}".
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeleteProduct}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </>
  );
}
