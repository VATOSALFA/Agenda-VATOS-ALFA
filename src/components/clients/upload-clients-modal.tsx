
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { writeBatch, collection, doc, Timestamp, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
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

type ParsedClient = Omit<Client, 'id' | 'creado_en'> & { creado_en?: any };

interface ClientSettings {
  autoClientNumber?: boolean;
}

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
          const dayIndex = headers.indexOf('día del nacimiento');
          const monthIndex = headers.indexOf('mes del nacimiento');
          const yearIndex = headers.indexOf('año de nacimiento');
          const clientSinceDayIndex = headers.indexOf('cliente desde el día');
          const clientSinceMonthIndex = headers.indexOf('cliente desde el mes');
          const clientSinceYearIndex = headers.indexOf('cliente desde el año');
          const totalAppointmentsIndex = headers.indexOf('citas totales');
          const attendedAppointmentsIndex = headers.indexOf('citas asistidas');
          const noShowAppointmentsIndex = headers.indexOf('citas no asistidas');
          const cancelledAppointmentsIndex = headers.indexOf('citas canceladas');
          const totalSpentIndex = headers.indexOf('gasto total');
          const clientNumberIndex = headers.indexOf('número de cliente');

          if (nameIndex === -1 || lastnameIndex === -1 || phoneIndex === -1) {
            toast({ variant: 'destructive', title: 'Formato incorrecto', description: 'El archivo debe contener las columnas: nombre, apellido, y telefono.' });
            return;
          }

          const data: ParsedClient[] = json.slice(1).map(row => {
            let birthDate = null;
            if (birthDateIndex > -1 && row[birthDateIndex] instanceof Date) {
              birthDate = format(row[birthDateIndex], 'yyyy-MM-dd');
            } else if (dayIndex > -1 && monthIndex > -1 && yearIndex > -1) {
              const day = row[dayIndex];
              const month = row[monthIndex];
              const year = row[yearIndex];
              if (day && month && year) {
                birthDate = format(new Date(year, month - 1, day), 'yyyy-MM-dd');
              }
            }

            let clientSinceDate = Timestamp.now();
            if (clientSinceDayIndex > -1 && clientSinceMonthIndex > -1 && clientSinceYearIndex > -1) {
              const day = row[clientSinceDayIndex];
              const month = row[clientSinceMonthIndex];
              const year = row[clientSinceYearIndex];
              if (day && month && year) {
                clientSinceDate = Timestamp.fromDate(new Date(year, month - 1, day));
              }
            }

            return {
              nombre: row[nameIndex] || '',
              apellido: row[lastnameIndex] || '',
              correo: row[emailIndex] || '',
              telefono: String(row[phoneIndex] || ''),
              fecha_nacimiento: birthDate,
              creado_en: clientSinceDate,
              citas_totales: Number(row[totalAppointmentsIndex]) || 0,
              citas_asistidas: Number(row[attendedAppointmentsIndex]) || 0,
              citas_no_asistidas: Number(row[noShowAppointmentsIndex]) || 0,
              citas_canceladas: Number(row[cancelledAppointmentsIndex]) || 0,
              gasto_total: Number(row[totalSpentIndex]) || 0,
              numero_cliente: row[clientNumberIndex] ? String(row[clientNumberIndex]) : undefined,
            }
          }).filter(client => client.nombre && client.apellido && client.telefono);

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
      const settingsRef = doc(db, 'configuracion', 'clientes');
      const settingsSnap = await getDocs(query(collection(db, 'configuracion'), where('__name__', '==', 'clientes')));
      const clientSettings = settingsSnap.docs[0]?.data() as ClientSettings | undefined;
      const autoNumberEnabled = clientSettings?.autoClientNumber ?? false;

      let lastClientNumber = 0;
      if (autoNumberEnabled) {
        const q = query(collection(db, 'clientes'), orderBy('numero_cliente', 'desc'), limit(1));
        const lastClientSnap = await getDocs(q);
        if (!lastClientSnap.empty) {
          const lastClient = lastClientSnap.docs[0].data();
          if (lastClient.numero_cliente && !isNaN(Number(lastClient.numero_cliente))) {
            lastClientNumber = Number(lastClient.numero_cliente);
          }
        }
      }

      const batch = writeBatch(db);
      parsedData.forEach((clientData, index) => {
        const clientRef = doc(collection(db, 'clientes'));
        const dataToSave: Partial<Client> = {
          ...clientData,
          creado_en: clientData.creado_en || Timestamp.now(),
        };

        if (autoNumberEnabled && !clientData.numero_cliente) {
          dataToSave.numero_cliente = String(lastClientNumber + index + 1);
        }

        batch.set(clientRef, dataToSave);
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
      <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col">
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
                Asegúrate de que tu archivo .xlsx, .xls o .csv tenga las columnas: <strong>nombre</strong>, <strong>apellido</strong>, <strong>telefono</strong>, y (opcionalmente) otras columnas como <strong>correo</strong>, <strong>fecha de nacimiento</strong>, etc.
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
                    <TableHead>Gasto Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 100).map((client, index) => (
                    <TableRow key={index}>
                      <TableCell>{client.nombre}</TableCell>
                      <TableCell>{client.apellido}</TableCell>
                      <TableCell>{client.correo || 'N/A'}</TableCell>
                      <TableCell>{client.telefono}</TableCell>
                      <TableCell>${(client.gasto_total || 0).toLocaleString('es-CL')}</TableCell>
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
