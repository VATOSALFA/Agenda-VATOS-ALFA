
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Filter, Search, Edit, Trash2, Upload, Settings, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Tag, Sparkles, Layers, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-4 sm:pt-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Inventario de productos</h2>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Administra los productos de tu negocio.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-xl border-border/60 hover:bg-white/5 font-medium text-xs sm:text-sm h-9">
                  <Settings className="mr-1.5 h-4 w-4 text-slate-400" />
                  <span className="hidden xs:inline">Administrar </span>Catálogos
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5 min-w-[200px]">
                <DropdownMenuItem 
                  onSelect={() => setIsCategoryModalOpen(true)}
                  className="cursor-pointer rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white text-xs sm:text-sm py-2 px-3 flex items-center gap-2 group transition-colors"
                >
                  <Tag className="h-4 w-4 text-slate-300 group-hover:text-white group-focus:text-white transition-colors" />
                  <span className="font-medium text-white">Categorías</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onSelect={() => setIsBrandModalOpen(true)}
                  className="cursor-pointer rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white text-xs sm:text-sm py-2 px-3 flex items-center gap-2 group transition-colors"
                >
                  <Sparkles className="h-4 w-4 text-slate-300 group-hover:text-white group-focus:text-white transition-colors" />
                  <span className="font-medium text-white">Marcas</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onSelect={() => setIsPresentationModalOpen(true)}
                  className="cursor-pointer rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white text-xs sm:text-sm py-2 px-3 flex items-center gap-2 group transition-colors"
                >
                  <Layers className="h-4 w-4 text-slate-300 group-hover:text-white group-focus:text-white transition-colors" />
                  <span className="font-medium text-white">Formatos / Presentaciones</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="outline" 
              onClick={() => setIsUploadModalOpen(true)}
              className="rounded-xl border-border/60 hover:bg-white/5 font-medium text-xs sm:text-sm h-9"
            >
              <Upload className="mr-1.5 h-4 w-4 text-slate-400" /> 
              Importar
            </Button>

            <Button 
              variant="alfa" 
              onClick={handleOpenNewProduct}
              className="rounded-xl text-xs sm:text-sm h-9 px-3.5 font-bold shadow-md"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo Producto
            </Button>
          </div>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-3.5 sm:p-5 border-b border-border/60">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold">Listado de productos</CardTitle>
                <Badge variant="secondary" className="rounded-full text-[11px] px-2 py-0.5 font-normal">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}
                </Badge>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar producto..." 
                  className="pl-9 h-9 rounded-xl border-border/60 bg-background/50 focus:bg-background text-xs sm:text-sm w-full" 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Mobile Cards View (< 640px) */}
            <div className="sm:hidden divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-3.5 space-y-2.5">
                    <Skeleton className="h-5 w-3/4 rounded-lg" />
                    <Skeleton className="h-4 w-1/2 rounded-lg" />
                    <div className="flex justify-between items-center pt-1">
                      <Skeleton className="h-6 w-16 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-lg" />
                    </div>
                  </div>
                ))
              ) : filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {searchTerm ? "No se encontraron productos coincidentes." : "No hay productos registrados."}
                </div>
              ) : (
                paginatedProducts.map((product) => {
                  const cat = catalogMap.categories.get(product.category_id);
                  const brand = catalogMap.brands.get(product.brand_id);
                  const stockNumber = Number(product.stock || 0);

                  return (
                    <div key={product.id} className="p-3.5 space-y-2 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{product.nombre}</p>
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                            {cat && <span>{cat}</span>}
                            {cat && brand && <span>•</span>}
                            {brand && <span>{brand}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-bold text-sm text-foreground">
                            ${product.public_price?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleStockUpdate(product)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                            stockNumber <= 0
                              ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                              : "bg-muted/30 text-foreground border-border/60 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/5"
                          )}
                        >
                          <span className="text-[10px] text-muted-foreground uppercase font-medium">Stock:</span>
                          <span>{product.stock}</span>
                        </button>

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10" 
                          onClick={() => handleEditProduct(product)}
                          title="Editar producto"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table View (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/60 bg-muted/20">
                    <TableHead className="py-2.5 px-4 text-xs font-semibold cursor-pointer select-none hover:bg-muted/40 transition-colors group" onClick={() => requestSort('nombre')}>
                      <div className="flex items-center gap-1 group-hover:text-foreground">
                        Nombre
                        <SortIcon field="nombre" />
                      </div>
                    </TableHead>
                    <TableHead className="py-2.5 px-4 text-xs font-semibold cursor-pointer select-none hover:bg-muted/40 transition-colors group" onClick={() => requestSort('categoria')}>
                      <div className="flex items-center gap-1 group-hover:text-foreground">
                        Categoría
                        <SortIcon field="categoria" />
                      </div>
                    </TableHead>
                    <TableHead className="py-2.5 px-4 text-xs font-semibold cursor-pointer select-none hover:bg-muted/40 transition-colors group" onClick={() => requestSort('marca')}>
                      <div className="flex items-center gap-1 group-hover:text-foreground">
                        Marca
                        <SortIcon field="marca" />
                      </div>
                    </TableHead>
                    <TableHead className="py-2.5 px-4 text-xs font-semibold cursor-pointer select-none hover:bg-muted/40 transition-colors group text-right" onClick={() => requestSort('precio')}>
                      <div className="flex items-center justify-end gap-1 group-hover:text-foreground">
                        Precio de venta
                        <SortIcon field="precio" />
                      </div>
                    </TableHead>
                    <TableHead className="py-2.5 px-4 text-xs font-semibold cursor-pointer select-none hover:bg-muted/40 transition-colors group text-center" onClick={() => requestSort('stock')}>
                      <div className="flex items-center justify-center gap-1 group-hover:text-foreground">
                        Stock
                        <SortIcon field="stock" />
                      </div>
                    </TableHead>
                    <TableHead className="py-2.5 px-4 text-xs font-semibold text-right">Opciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-b border-border/40">
                        <TableCell colSpan={6} className="py-3 px-4"><Skeleton className="h-7 w-full rounded-md" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-xs text-muted-foreground">
                        {searchTerm ? "No se encontraron productos coincidentes." : "No hay productos registrados."}
                      </TableCell>
                    </TableRow>
                  ) : paginatedProducts.map((product) => {
                    const stockNumber = Number(product.stock || 0);

                    return (
                      <TableRow key={product.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <TableCell className="py-2.5 px-4 text-xs font-medium text-foreground">{product.nombre}</TableCell>
                        <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">{catalogMap.categories.get(product.category_id) || '—'}</TableCell>
                        <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">{catalogMap.brands.get(product.brand_id) || '—'}</TableCell>
                        <TableCell className="py-2.5 px-4 text-xs font-semibold text-right">
                          ${product.public_price?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-xs text-center">
                          <button
                            type="button"
                            onClick={() => handleStockUpdate(product)}
                            className={cn(
                              "inline-flex items-center justify-center min-w-[42px] px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                              stockNumber <= 0
                                ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                                : "bg-muted/30 text-foreground border-border/60 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/5"
                            )}
                            title="Actualizar stock"
                          >
                            {product.stock}
                          </button>
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10" 
                              onClick={() => handleEditProduct(product)}
                              title="Editar producto"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {!isLoading && filteredProducts.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs sm:text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground">Filas por página:</span>
              <Select
                value={`${itemsPerPage}`}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[68px] rounded-lg border-border/60 text-xs">
                  <SelectValue placeholder={itemsPerPage} />
                </SelectTrigger>
                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                  <SelectItem value="10" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">10</SelectItem>
                  <SelectItem value="20" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">20</SelectItem>
                  <SelectItem value="50" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">50</SelectItem>
                  <SelectItem value="100" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Página <strong className="text-foreground">{currentPage}</strong> de <strong className="text-foreground">{totalPages}</strong>
              </span>
              <div className="flex items-center space-x-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 rounded-lg border-border/60 hover:bg-white/5 text-xs"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-0.5" />
                  <span className="hidden xs:inline">Anterior</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 rounded-lg border-border/60 hover:bg-white/5 text-xs"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  <span className="hidden xs:inline">Siguiente</span>
                  <ChevronRight className="h-4 w-4 ml-0.5" />
                </Button>
              </div>
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
