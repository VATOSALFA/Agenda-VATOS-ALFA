

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { writeBatch, collection, Timestamp, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client } from '@/lib/types';

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

interface UploadClientsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUploadComplete: () => void;
}

type ParsedClient = Omit<Client, 'id' | 'creado_en'>;

export function UploadClientsModal({ isOpen, onOpenChange, onUploadComplete }: UploadClientsModalProps) {
  const [parsedData, setParsedData] = useState<ParsedClient[]>([]);
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
          
          const headers: string[] = json[0].map((h: any) => String(h).toLowerCase().trim());
          const nameIndex = headers.indexOf('nombre');
          const lastnameIndex = headers.indexOf('apellido');
          const emailIndex = headers.indexOf('correo');
          const phoneIndex = headers.indexOf('telefono');
          const birthDateIndex = headers.indexOf('fecha de nacimiento');
          
          if (nameIndex === -1 || lastnameIndex === -1 || phoneIndex === -1) {
              toast({ variant: 'destructive', title: 'Formato incorrecto', description: 'El archivo debe contener las columnas: nombre, apellido, y telefono.' });
              return;
          }

          const data: ParsedClient[] = json.slice(1).map(row => ({
            nombre: row[nameIndex] || '',
            apellido: row[lastnameIndex] || '',
            correo: row[emailIndex] || '',
            telefono: String(row[phoneIndex] || ''),
            fecha_nacimiento: row[birthDateIndex] instanceof Date ? format(row[birthDateIndex], 'yyyy-MM-dd') : null,
          })).filter(client => client.nombre && client.apellido && client.telefono); 

          setParsedData(data);

        } catch (error) {
            console.error("Error parsing file:", error);
            toast({ variant: 'destructive', title: 'Error al leer el archivo', description: 'Asegúrate de que sea un archivo de Excel válido.' });
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
    if (parsedData.length === 0) {
        toast({ variant: 'destructive', title: 'No hay datos', description: 'No hay clientes válidos para importar.' });
        return;
    }
    setIsProcessing(true);
    try {
        const batch = writeBatch(db);
        parsedData.forEach(clientData => {
            const clientRef = doc(collection(db, 'clientes'));
            batch.set(clientRef, {
                ...clientData,
                creado_en: Timestamp.now()
            });
        });
        await batch.commit();
        toast({ title: '¡Éxito!', description: `${parsedData.length} clientes han sido importados.` });
        onUploadComplete();
        handleClose();
    } catch (error) {
        console.error("Error uploading clients:", error);
        toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron guardar los clientes.' });
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
          <DialogTitle>Cargar Clientes desde Excel o CSV</DialogTitle>
          <DialogDescription>
            Sube un archivo .xlsx, .xls o .csv para importar tus clientes de forma masiva.
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
                    Asegúrate de que tu archivo .xlsx o .csv tenga las columnas: <strong>nombre</strong>, <strong>apellido</strong>, <strong>telefono</strong>, y (opcionalmente) <strong>correo</strong> y <strong>fecha de nacimiento</strong>. 
                    <a href="/Base de datos clientes.csv" download="plantilla-clientes.csv" className="font-bold text-primary hover:underline ml-2">Descargar archivo de ejemplo</a>.
                </AlertDescription>
             </Alert>
          </div>
        ) : (
            <div className="flex-grow flex flex-col overflow-hidden">
                <p className="text-sm font-semibold mb-2">Vista previa de la importación ({parsedData.length} clientes)</p>
                <ScrollArea className="border rounded-md flex-grow">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Apellido</TableHead>
                                <TableHead>Correo</TableHead>
                                <TableHead>Teléfono</TableHead>
                                <TableHead>Fecha de Nacimiento</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedData.slice(0, 100).map((client, index) => (
                                <TableRow key={index}>
                                    <TableCell>{client.nombre}</TableCell>
                                    <TableCell>{client.apellido}</TableCell>
                                    <TableCell>{client.correo || 'N/A'}</TableCell>
                                    <TableCell>{client.telefono}</TableCell>
                                    <TableCell>{client.fecha_nacimiento || 'N/A'}</TableCell>
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
            Importar {parsedData.length > 0 ? parsedData.length : ''} Clientes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
