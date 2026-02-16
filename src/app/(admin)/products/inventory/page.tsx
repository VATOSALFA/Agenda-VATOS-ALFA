
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Filter, Search, Edit, Trash2, Upload, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Product, ProductCategory, ProductBrand, ProductPresentation } from '@/lib/types';
import { NewProductModal } from '@/components/products/new-product-modal';
import { StockUpdateModal } from '@/components/products/stock-update-modal';
import { UploadProductsModal } from '@/components/products/upload-products-modal';
import { CategoryModal } from '@/components/products/category-modal';
import { BrandModal } from '@/components/products/brand-modal';
import { PresentationModal } from '@/components/products/presentation-modal';


export default function InventoryPage() {
  const [queryKey, setQueryKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: allProducts, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);
  const { data: allCategories, loading: categoriesLoading } = useFirestoreQuery<ProductCategory>('categorias_productos', `cat-${queryKey}`);
  const { data: allBrands, loading: brandsLoading } = useFirestoreQuery<ProductBrand>('marcas_productos', `brand-${queryKey}`);
  const { data: allPresentations, loading: presentationsLoading } = useFirestoreQuery<ProductPresentation>('formatos_productos', `pres-${queryKey}`);

  const { toast } = useToast();

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isPresentationModalOpen, setIsPresentationModalOpen] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockUpdateProduct, setStockUpdateProduct] = useState<Product | null>(null);

  const catalogMap = useMemo(() => {
    if (categoriesLoading || brandsLoading || presentationsLoading) return { categories: new Map(), brands: new Map(), presentations: new Map() };
    return {
      categories: new Map(allCategories.map(c => [c.id, c.name])),
      brands: new Map(allBrands.map(b => [b.id, b.name])),
      presentations: new Map(allPresentations.map(p => [p.id, p.name])),
    };
  }, [allCategories, allBrands, allPresentations, categoriesLoading, brandsLoading, presentationsLoading]);


  const filteredProducts = useMemo(() => {
    const sortedProducts = [...allProducts].sort((a, b) => (a.order || 99) - (b.order || 99));
    if (!searchTerm) return sortedProducts;
    return sortedProducts.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allProducts, searchTerm]);


  const handleDataUpdated = (newEntityId?: string) => {
    setQueryKey(prev => prev + 1);
  };

  const handleOpenNewProduct = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsProductModalOpen(true);
  };

  const handleStockUpdate = (product: Product) => {
    setStockUpdateProduct(product);
    setIsStockModalOpen(true);
  };

  const isLoading = productsLoading || categoriesLoading || brandsLoading || presentationsLoading;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Inventario de productos</h2>
            <p className="text-muted-foreground">
              Administra los productos de tu negocio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Settings className="mr-2 h-4 w-4" />Administrar Catálogos</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setIsCategoryModalOpen(true)}>Categorías</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsBrandModalOpen(true)}>Marcas</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsPresentationModalOpen(true)}>Formatos/Presentaciones</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => setIsUploadModalOpen(true)}><Upload className="mr-2 h-4 w-4" /> Importar</Button>
            <Button onClick={handleOpenNewProduct}><Plus className="mr-2 h-4 w-4" />Nuevo Producto</Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle>Listado de productos</CardTitle>
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar producto..." className="pl-10 w-full md:w-[300px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Precio de venta al público</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Opciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        {searchTerm ? "No se encontraron productos." : "No hay productos registrados."}
                      </TableCell>
                    </TableRow>
                  ) : filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.nombre}</TableCell>
                      <TableCell>{catalogMap.categories.get(product.category_id) || 'N/A'}</TableCell>
                      <TableCell>{catalogMap.brands.get(product.brand_id) || 'N/A'}</TableCell>
                      <TableCell>${product.public_price?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleStockUpdate(product)}>
                          {product.stock}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditProduct(product)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {isProductModalOpen && (
        <NewProductModal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          onDataSaved={handleDataUpdated}
          product={editingProduct}
        />
      )}

      {stockUpdateProduct && (
        <StockUpdateModal
          isOpen={isStockModalOpen}
          onClose={() => setIsStockModalOpen(false)}
          onStockUpdated={handleDataUpdated}
          product={stockUpdateProduct}
        />
      )}

      {isUploadModalOpen && (
        <UploadProductsModal
          isOpen={isUploadModalOpen}
          onOpenChange={setIsUploadModalOpen}
          onUploadComplete={handleDataUpdated}
        />
      )}

      {isCategoryModalOpen && (
        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onDataSaved={(newId) => { handleDataUpdated(); }}
          existingCategories={allCategories}
        />
      )}

      {isBrandModalOpen && (
        <BrandModal
          isOpen={isBrandModalOpen}
          onClose={() => setIsBrandModalOpen(false)}
          onDataSaved={(newId) => { handleDataUpdated(); }}
        />
      )}

      {isPresentationModalOpen && (
        <PresentationModal
          isOpen={isPresentationModalOpen}
          onClose={() => setIsPresentationModalOpen(false)}
          onDataSaved={(newId) => { handleDataUpdated(); }}
        />
      )}

    </>
  );
}
