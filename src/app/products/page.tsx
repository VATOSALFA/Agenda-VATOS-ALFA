import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Search, Upload, Plus, Minus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const products = [
  { id: 'PROD001', name: 'Cera Moldeadora "El Patrón"', category: 'Ceras', brand: 'Vatos Alfa Originals', presentation: '150g', price: 15990, stock: 45 },
  { id: 'PROD002', name: 'Aceite para Barba "El Padrino"', category: 'Aceites', brand: 'Vatos Alfa Originals', presentation: '30ml', price: 12990, stock: 32 },
  { id: 'PROD003', name: 'Shampoo Fortalecedor "Sicario"', category: 'Shampoos', brand: 'Barba Fuerte', presentation: '250ml', price: 9990, stock: 15 },
  { id: 'PROD004', name: 'Tónico Capilar Anti-caída', category: 'Tónicos', brand: 'Cabello de Acero', presentation: '100ml', price: 18990, stock: 8 },
  { id: 'PROD005', name: 'Gel de Afeitar Transparente', category: 'Geles', brand: 'Afeitado Perfecto', presentation: '200ml', price: 7990, stock: 50 },
];

export default function ProductsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Inventario de Productos</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Cargar productos (CSV)</Button>
          <Button><PlusCircle className="mr-2 h-4 w-4" /> Agregar nuevo producto</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de Productos</CardTitle>
          <CardDescription>Gestiona el stock de los productos de la barbería.</CardDescription>
           <div className="flex items-center space-x-4 pt-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre, categoría, marca..." className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Presentación</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.brand}</TableCell>
                  <TableCell>{product.presentation}</TableCell>
                  <TableCell>${product.price.toLocaleString('es-CL')}</TableCell>
                  <TableCell>
                    <Badge variant={product.stock > 10 ? 'default' : product.stock > 0 ? 'secondary' : 'destructive'} 
                     className={cn(
                        product.stock > 10 && 'bg-green-100 text-green-800',
                        product.stock > 0 && product.stock <=10 && 'bg-yellow-100 text-yellow-800',
                        product.stock === 0 && 'bg-red-100 text-red-800'
                     )}
                    >
                        {product.stock} unidades
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Plus className="mr-2 h-4 w-4" /> Agregar Stock</DropdownMenuItem>
                        <DropdownMenuItem><Minus className="mr-2 h-4 w-4" /> Retirar Stock</DropdownMenuItem>
                        <DropdownMenuItem>Editar</DropdownMenuItem>
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
  );
}
