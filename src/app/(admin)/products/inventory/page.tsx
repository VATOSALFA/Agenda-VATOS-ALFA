
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Filter, Search, Edit, Trash2, Upload, Settings, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const catalogMap = useMemo(() => {
    if (categoriesLoading || brandsLoading || presentationsLoading) return { categories: new Map(), brands: new Map(), presentations: new Map() };
    return {
      categories: new Map(allCategories.map(c => [c.id, c.name])),
      brands: new Map(allBrands.map(b => [b.id, b.name])),
      presentations: new Map(allPresentations.map(p => [p.id, p.name])),
    };
  }, [allCategories, allBrands, allPresentations, categoriesLoading, brandsLoading, presentationsLoading]);


  const filteredProducts = useMemo(() => {
    let result = [...allProducts];

    // Filter by search term
    if (searchTerm) {
      result = result.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Sort
    if (sortConfig !== null) {
      result.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case 'nombre':
            aValue = (a.nombre || '').toLowerCase();
            bValue = (b.nombre || '').toLowerCase();
            break;
          case 'categoria':
            aValue = (catalogMap.categories.get(a.category_id) || '').toLowerCase();
            bValue = (catalogMap.categories.get(b.category_id) || '').toLowerCase();
            break;
          case 'marca':
            aValue = (catalogMap.brands.get(a.brand_id) || '').toLowerCase();
            bValue = (catalogMap.brands.get(b.brand_id) || '').toLowerCase();
            break;
          case 'precio':
            aValue = a.public_price || 0;
            bValue = b.public_price || 0;
            break;
          case 'stock':
            aValue = a.stock || 0;
            bValue = b.stock || 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by order
      result.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 9999;
        const orderB = b.order !== undefined ? b.order : 9999;
        return orderA - orderB;
      });
    }

    return result;
  }, [allProducts, searchTerm, sortConfig, catalogMap]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (!sortConfig || sortConfig.key !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />;
    if (sortConfig.direction === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
    return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );


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
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('nombre')}>
                      <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                        Nombre
                        <SortIcon field="nombre" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('categoria')}>
                      <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                        Categoría
                        <SortIcon field="categoria" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('marca')}>
                      <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                        Marca
                        <SortIcon field="marca" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('precio')}>
                      <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                        Precio de venta al público
                        <SortIcon field="precio" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('stock')}>
                      <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                        Stock
                        <SortIcon field="stock" />
                      </div>
                    </TableHead>
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
                  ) : paginatedProducts.map((product) => (
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

        {!isLoading && filteredProducts.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-2">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium">Resultados por página</p>
              <Select
                value={`${itemsPerPage}`}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={itemsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
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
        )}
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
