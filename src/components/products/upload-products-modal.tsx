

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { writeBatch, collection, doc, Timestamp } from 'firebase/firestore';
import type { Product } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, FileSpreadsheet, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface UploadProductsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUploadComplete: () => void;
}

type ParsedProduct = Omit<Product, 'id' | 'created_at' | 'active' | 'order'>;

export function UploadProductsModal({ isOpen, onOpenChange, onUploadComplete }: UploadProductsModalProps) {
  const [parsedData, setParsedData] = useState<ParsedProduct[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const { db } = useAuth();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const bstr = event.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (json.length < 2) {
              toast({ variant: 'destructive', title: 'Archivo vacío', description: 'El archivo no contiene datos para importar.' });
              return;
          }

          const headers: string[] = json[0].map((h: any) => String(h).toLowerCase().trim());
          const requiredHeaders = ['nombre', 'marca', 'categoria', 'formato/presentacion'];
          const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

          if (missingHeaders.length > 0) {
              toast({ variant: 'destructive', title: 'Faltan columnas requeridas', description: `Asegúrate de que el archivo contenga las columnas: ${missingHeaders.join(', ')}.` });
              return;
          }

          const getIndex = (name: string) => headers.indexOf(name);

          const data: ParsedProduct[] = json.slice(1).map((row: any[]) => {
              const commissionTypeFromSheet = String(row[getIndex('comision de venta (tipo)')]);
              return {
                nombre: row[getIndex('nombre')] || '',
                barcode: row[getIndex('codigo de barras')] ? String(row[getIndex('codigo de barras')]) : undefined,
                brand_id: row[getIndex('marca')] || '',
                category_id: row[getIndex('categoria')] || '',
                presentation_id: row[getIndex('formato/presentacion')] || '',
                public_price: Number(row[getIndex('precio de venta al publico')]) || 0,
                stock: Number(row[getIndex('cantidad en stock')]) || 0,
                purchase_cost: Number(row[getIndex('costo de compra')]) || undefined,
                internal_price: Number(row[getIndex('precio de venta interna')]) || undefined,
                commission: {
                    value: Number(row[getIndex('comision de venta (valor)')]) || 0,
                    type: commissionTypeFromSheet === '$' ? '$' : '%'
                },
                includes_vat: String(row[getIndex('precio incluye iva')]).toLowerCase() === 'si',
                description: row[getIndex('descripcion')] || undefined,
                stock_alarm_threshold: Number(row[getIndex('alarma de stock (umbral)')]) || undefined,
                notification_email: row[getIndex('email para notificaciones')] || undefined,
                images: row[getIndex('imagenes')] ? String(row[getIndex('imagenes')]).split(',').map(s => s.trim()) : []
              }
          }).filter(product => product.nombre && product.brand_id && product.category_id && product.presentation_id);

          if (data.length === 0) {
            toast({ variant: 'destructive', title: 'No se encontraron datos válidos', description: 'Revisa el contenido del archivo y asegúrate de que los datos requeridos estén presentes.' });
            return;
          }
          
          setParsedData(data);

        } catch (error) {
            console.error("Error parsing file:", error);
            toast({ variant: 'destructive', title: 'Error al leer el archivo', description: 'Asegúrate de que sea un archivo de Excel válido y que los nombres de las columnas coincidan con la plantilla.' });
        }
      };
      reader.readAsBinaryString(file);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const handleUpload = async () => {
    if (!db) return;
    if (parsedData.length === 0) {
        toast({ variant: 'destructive', title: 'No hay datos', description: 'No hay productos válidos para importar.' });
        return;
    }
    setIsProcessing(true);
    try {
        const batch = writeBatch(db);
        parsedData.forEach(productData => {
            const productRef = doc(collection(db, 'productos'));
            const dataToSave = {
              ...productData,
              active: true,
              order: 99,
              created_at: Timestamp.now(),
            };
            batch.set(productRef, dataToSave);
        });
        await batch.commit();
        toast({ title: '¡Éxito!', description: `${parsedData.length} productos han sido importados.` });
        onUploadComplete();
        handleClose();
    } catch (error) {
        console.error("Error uploading products:", error);
        toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron guardar los productos.' });
    } finally {
        setIsProcessing(false);
    }
  }

  const handleClose = () => {
    setParsedData([]);
    setIsProcessing(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Cargar Productos desde Excel o CSV</DialogTitle>
          <DialogDescription>
            Sube un archivo .xlsx, .xls o .csv para importar tus productos de forma masiva.
          </DialogDescription>
        </DialogHeader>

        {parsedData.length === 0 ? (
          <div className="py-8 space-y-6">
             <div {...getRootProps()} className={`flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isDragActive ? 'border-primary bg-primary/5' : ''}`}>
                <input {...getInputProps()} />
                <UploadCloud className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-center text-muted-foreground">
                    Arrastra y suelta tu archivo aquí, o haz clic para seleccionarlo.
                </p>
             </div>
             <Alert>
                <FileSpreadsheet className="h-4 w-4" />
                <AlertTitle>Formato del archivo</AlertTitle>
                <AlertDescription>
                   Asegúrate de que tu archivo tenga todas las columnas del formulario de "Nuevo Producto".
                    <a href="/plantilla-productos.csv" download="plantilla-productos.csv" className="font-bold text-primary hover:underline ml-2">Descargar archivo de ejemplo</a>.
                </AlertDescription>
             </Alert>
          </div>
        ) : (
            <div className="flex-grow flex flex-col overflow-hidden">
                <p className="text-sm font-semibold mb-2">Vista previa de la importación ({parsedData.length} productos)</p>
                <ScrollArea className="border rounded-md flex-grow">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Categoría</TableHead>
                                <TableHead>Precio</TableHead>
                                <TableHead>Stock</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedData.slice(0, 100).map((product, index) => (
                                <TableRow key={index}>
                                    <TableCell>{product.nombre}</TableCell>
                                    <TableCell>{product.brand_id}</TableCell>
                                    <TableCell>{product.category_id}</TableCell>
                                    <TableCell>${(product.public_price || 0).toLocaleString('es-CL')}</TableCell>
                                    <TableCell>{product.stock}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {parsedData.length > 100 && <p className="text-center text-sm text-muted-foreground p-4">Mostrando los primeros 100 de {parsedData.length} registros.</p>}
                </ScrollArea>
            </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={parsedData.length === 0 || isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Importar {parsedData.length > 0 ? parsedData.length : ''} Productos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
