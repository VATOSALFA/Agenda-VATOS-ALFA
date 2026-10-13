

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { writeBatch, collection, doc, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import type { Product, Commission } from '@/lib/types';

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
import { UploadCloud, FileSpreadsheet, Loader2, X } from 'lucide-react';
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
            const commissionValue = Number(row[getIndex('comision de venta (valor)')]) || 0;
            const commissionTypeFromSheet = String(row[getIndex('comision de venta (tipo)')]);

            const commission: Commission = {
              value: commissionValue,
              type: commissionTypeFromSheet === '$' ? '$' : '%',
            };

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
              commission: commission,
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
      <DialogContent hideCloseButton={true} className="max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
        {/* Official Vatos Alfa Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-blue-900/40 flex-shrink-0">
          <div className="header-light-beam" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UploadCloud className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                  Importar Productos
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Sube un archivo .xlsx, .xls o .csv para importar tus productos de forma masiva
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {parsedData.length === 0 ? (
          <div className="p-4 sm:p-6 space-y-4 flex-grow overflow-y-auto">
            <div 
              {...getRootProps()} 
              className={`flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                isDragActive 
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-border/60 hover:border-blue-500/60 bg-muted/10 hover:bg-muted/20'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="h-12 w-12 text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-foreground text-center">
                Arrastra y suelta tu archivo aquí, o haz clic para seleccionarlo
              </p>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Formatos compatibles: .xlsx, .xls, .csv
              </p>
            </div>
            <Alert className="rounded-xl border-border/60 bg-muted/20">
              <FileSpreadsheet className="h-4 w-4 text-slate-400" />
              <AlertTitle className="text-xs font-semibold">Formato del archivo</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Asegúrate de que tu archivo contenga las columnas requeridas (Nombre, Marca, Categoría, Formato/Presentación).
                <a href="/plantilla-productos.csv" download="plantilla-productos.csv" className="font-bold text-blue-400 hover:underline ml-1">
                  Descargar archivo de ejemplo
                </a>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex-grow flex flex-col overflow-hidden p-4 sm:p-6">
            <p className="text-xs font-semibold mb-2">Vista previa de la importación ({parsedData.length} productos detectados)</p>
            <ScrollArea className="border border-border/60 rounded-xl flex-grow overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <TableRow className="border-b border-border/60">
                    <TableHead className="text-xs py-2 px-3">Nombre</TableHead>
                    <TableHead className="text-xs py-2 px-3">Marca</TableHead>
                    <TableHead className="text-xs py-2 px-3">Categoría</TableHead>
                    <TableHead className="text-xs py-2 px-3 text-right">Precio</TableHead>
                    <TableHead className="text-xs py-2 px-3 text-center">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 100).map((product, index) => (
                    <TableRow key={index} className="border-b border-border/40 hover:bg-muted/20">
                      <TableCell className="text-xs py-2 px-3 font-medium">{product.nombre}</TableCell>
                      <TableCell className="text-xs py-2 px-3 text-muted-foreground">{product.brand_id}</TableCell>
                      <TableCell className="text-xs py-2 px-3 text-muted-foreground">{product.category_id}</TableCell>
                      <TableCell className="text-xs py-2 px-3 text-right font-semibold">${(product.public_price || 0).toLocaleString('es-MX')}</TableCell>
                      <TableCell className="text-xs py-2 px-3 text-center">{product.stock}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedData.length > 100 && <p className="text-center text-xs text-muted-foreground p-3">Mostrando los primeros 100 de {parsedData.length} registros.</p>}
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="p-4 sm:p-5 border-t border-border/60 flex items-center justify-end gap-3 bg-muted/10 flex-shrink-0">
          <Button variant="outline" className="rounded-xl border-border/60 hover:bg-white/5 font-medium" onClick={handleClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button variant="alfa" className="rounded-xl font-bold shadow-md px-5" onClick={handleUpload} disabled={parsedData.length === 0 || isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Importar {parsedData.length > 0 ? `${parsedData.length} ` : ''}Productos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
