
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
import { UploadCloud, FileSpreadsheet, Loader2, Download, X } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';

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
          const clientSinceIndex = headers.indexOf('cliente desde');
          const clientNumberIndex = headers.indexOf('número de cliente');

          if (nameIndex === -1 || lastnameIndex === -1 || phoneIndex === -1) {
            toast({ variant: 'destructive', title: 'Formato incorrecto', description: 'El archivo debe contener las columnas: nombre, apellido, y telefono.' });
            return;
          }

          const data: ParsedClient[] = json.slice(1).map(row => {
            let birthDate = null;
            const birthDateValue = birthDateIndex > -1 ? row[birthDateIndex] : null;

            if (birthDateValue instanceof Date) {
              birthDate = format(birthDateValue, 'yyyy-MM-dd');
            } else if (typeof birthDateValue === 'string') {
              const parsedDate = parse(birthDateValue, 'dd/MM/yyyy', new Date());
              if (isValid(parsedDate)) {
                birthDate = format(parsedDate, 'yyyy-MM-dd');
              }
            } else if (dayIndex > -1 && monthIndex > -1 && yearIndex > -1) {
              const day = row[dayIndex];
              const month = row[monthIndex];
              const year = row[yearIndex];
              if (day && month && year) {
                birthDate = format(new Date(year, month - 1, day), 'yyyy-MM-dd');
              }
            }

            let clientSinceDate = Timestamp.now();
            const clientSinceValue = clientSinceIndex > -1 ? row[clientSinceIndex] : null;

            if (clientSinceValue instanceof Date) {
              clientSinceDate = Timestamp.fromDate(clientSinceValue);
            } else if (typeof clientSinceValue === 'string') {
              const parsedDate = parse(clientSinceValue, 'dd/MM/yyyy', new Date());
              if (isValid(parsedDate)) {
                clientSinceDate = Timestamp.fromDate(parsedDate);
              }
            } else if (clientSinceDayIndex > -1 && clientSinceMonthIndex > -1 && clientSinceYearIndex > -1) {
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

  const downloadTemplate = () => {
    try {
      const headers = [
        'nombre',
        'apellido',
        'telefono',
        'correo',
        'fecha de nacimiento',
        'cliente desde',
        'gasto total'
      ];

      const sampleData = [
        {
          'nombre': 'Juan',
          'apellido': 'Pérez',
          'telefono': '5551234567',
          'correo': 'juan.perez@ejemplo.com',
          'fecha de nacimiento': '15/05/1990',
          'cliente desde': '01/01/2024',
          'gasto total': '1500'
        },
        {
          'nombre': 'María',
          'apellido': 'García',
          'telefono': '5559876543',
          'correo': 'm.garcia@ejemplo.com',
          'fecha de nacimiento': '20/11/1985',
          'cliente desde': '15/06/2023',
          'gasto total': '2400'
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Clientes');

      // Generate XLSX file and trigger download
      XLSX.writeFile(workbook, 'plantilla-clientes-vatos-alfa.xlsx');

      toast({
        title: '¡Descarga iniciada!',
        description: 'Se ha generado la plantilla de ejemplo correctamente.',
      });
    } catch (error) {
      console.error('Error generating template:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo generar la plantilla de ejemplo.'
      });
    }
  };

  const handleUpload = async () => {
    if (parsedData.length === 0) {
      toast({ variant: 'destructive', title: 'No hay datos', description: 'No hay clientes válidos para importar.' });
      return;
    }
    setIsProcessing(true);
    try {
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
      <DialogContent hideCloseButton={true} className="max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
        {/* Header Oficial Vatos Alfa */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0">
              <UploadCloud className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Cargar Clientes desde Excel o CSV
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Importa tus clientes de forma masiva mediante archivo .xlsx o .csv
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex-grow overflow-y-auto">
          {parsedData.length === 0 ? (
            <div className="py-4 space-y-5">
              <div {...getRootProps()} className={`flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-xl cursor-pointer hover:border-blue-500/60 transition-colors ${isDragActive ? 'border-blue-500 bg-blue-500/5' : 'border-border/70'}`}>
                <input {...getInputProps()} />
                <UploadCloud className="h-10 w-10 text-slate-400" />
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Arrastra y suelta tu archivo aquí, o <span className="text-blue-500 font-semibold underline underline-offset-2">haz clic para seleccionarlo</span>.
                </p>
              </div>
              <Alert className="rounded-xl border-border/70">
                <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                <AlertTitle className="text-xs font-semibold">Formato del archivo</AlertTitle>
                <AlertDescription className="space-y-3 text-xs text-muted-foreground">
                  <p>
                    Asegúrate de que tu archivo .xlsx, .xls o .csv contenga las columnas: <strong className="text-foreground">nombre</strong>, <strong className="text-foreground">apellido</strong>, <strong className="text-foreground">telefono</strong>, y opcionalmente <strong className="text-foreground">correo</strong>, <strong className="text-foreground">fecha de nacimiento</strong>.
                  </p>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2 rounded-xl text-xs font-semibold h-8"
                      onClick={downloadTemplate}
                    >
                      <Download className="h-3.5 w-3.5 text-slate-400" />
                      Descargar plantilla de ejemplo (.xlsx)
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="flex-grow flex flex-col overflow-hidden">
              <p className="text-xs font-semibold mb-2">Vista previa de la importación ({parsedData.length} clientes)</p>
              <ScrollArea className="border rounded-xl flex-grow max-h-[45vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/40 text-xs">
                    <TableRow className="h-8">
                      <TableHead className="py-1 px-3 text-xs">Nombre</TableHead>
                      <TableHead className="py-1 px-3 text-xs">Apellido</TableHead>
                      <TableHead className="py-1 px-3 text-xs">Correo</TableHead>
                      <TableHead className="py-1 px-3 text-xs">Teléfono</TableHead>
                      <TableHead className="py-1 px-3 text-xs">Gasto Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 100).map((client, index) => (
                      <TableRow key={index} className="h-8 hover:bg-muted/30">
                        <TableCell className="py-1.5 px-3 text-xs font-medium">{client.nombre}</TableCell>
                        <TableCell className="py-1.5 px-3 text-xs">{client.apellido}</TableCell>
                        <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{client.correo || 'N/A'}</TableCell>
                        <TableCell className="py-1.5 px-3 text-xs">{client.telefono}</TableCell>
                        <TableCell className="py-1.5 px-3 text-xs font-semibold">${(client.gasto_total || 0).toLocaleString('es-MX')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedData.length > 100 && <p className="text-center text-xs text-muted-foreground p-3">Mostrando los primeros 100 de {parsedData.length} registros.</p>}
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing} className="rounded-xl h-9 text-xs">
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={parsedData.length === 0 || isProcessing}
            className="btn-vatos-alfa rounded-xl h-9 px-4 text-xs font-bold text-white shadow-md"
          >
            {isProcessing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Importar {parsedData.length > 0 ? `${parsedData.length} ` : ''}Clientes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
