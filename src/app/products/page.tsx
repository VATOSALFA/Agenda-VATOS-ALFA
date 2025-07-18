
'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreHorizontal, PlusCircle, Search, Upload, Plus, Minus, Bell, Download, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NewProductModal } from "@/components/products/new-product-modal";
import { CategoryModal } from "@/components/products/category-modal";
import { BrandModal } from "@/components/products/brand-modal";
import { PresentationModal } from "@/components/products/presentation-modal";

const mockProducts = [
    { barcode: '7801234567890', name: 'SERUM COCTEL MULTINUTRIENTES', category: 'Facial', brand: 'VATOS ALFA', presentation: '30 ml', price: 17900, stock: 12 },
    { barcode: '7801234567891', name: 'SERUM CRECIMIENTO CAPILAR 7% MINOXIDIL', category: 'Capilar', brand: 'VATOS ALFA', presentation: '50 ml', price: 19900, stock: 15 },
    { barcode: '7801234567892', name: 'MASCARILLA CARBON ACTIVADO', category: 'Facial', brand: 'VATOS ALFA', presentation: '50 gr', price: 16500, stock: 18 },
    { barcode: '7801234567893', name: 'SHAMPOO CRECIMIENTO ACELERADO', category: 'Capilar', brand: 'VATOS ALFA', presentation: '500 ml', price: 16500, stock: 14 },
    { barcode: '7801234567894', name: 'JABÓN LÍQUIDO PURIFICANTE Y EXFOLIANTE', category: 'Facial', brand: 'VATOS ALFA', presentation: '120 ml', price: 16500, stock: 16 },
    { barcode: '7801234567895', name: 'AFTER SHAVE', category: 'Facial', brand: 'VATOS ALFA', presentation: '100ml', price: 18000, stock: 0 },
];

export default function InventoryPage() {
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isPresentationModalOpen, setIsPresentationModalOpen] = useState(false);

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
                <DropdownMenuItem onSelect={() => setIsNewProductModalOpen(true)}>
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
              {mockProducts.map((product) => (
                <TableRow key={product.barcode} className={cn(product.stock === 0 && 'bg-red-500/10 hover:bg-red-500/20')}>
                  <TableCell className="font-mono text-xs">{product.barcode}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.brand}</TableCell>
                  <TableCell>{product.presentation}</TableCell>
                  <TableCell>${product.price.toLocaleString('es-CL')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <span>{product.stock}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-auto px-2"><Plus className="mr-1 h-3 w-3" /> Stock</Button>
                        <Button size="sm" variant="ghost" className="h-6 w-auto px-2"><Minus className="mr-1 h-3 w-3" /> Stock</Button>
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
                        <DropdownMenuItem>Editar</DropdownMenuItem>
                        <DropdownMenuItem>Ver historial de movimientos</DropdownMenuItem>
                        <DropdownMenuItem>Desactivar producto</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive hover:!text-destructive">Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>

    <NewProductModal 
      isOpen={isNewProductModalOpen}
      onClose={() => setIsNewProductModalOpen(false)}
    />
    <CategoryModal 
      isOpen={isCategoryModalOpen}
      onClose={() => setIsCategoryModalOpen(false)}
    />
    <BrandModal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
    />
    <PresentationModal
        isOpen={isPresentationModalOpen}
        onClose={() => setIsPresentationModalOpen(false)}
    />
    </>
  );
}
