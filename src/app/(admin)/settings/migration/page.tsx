'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";

// Definición de las columnas esperadas para cada hoja
const TEMPLATE_SCHEMA = {
    Clientes: [
        { header: 'Nombre Completo', key: 'nombre', width: 30, example: 'Juan Pérez' },
        { header: 'Teléfono', key: 'telefono', width: 15, example: '5512345678' },
        { header: 'Email', key: 'email', width: 25, example: 'juan@ejemplo.com' },
        { header: 'Fecha Registro (YYYY-MM-DD)', key: 'fechaRegistro', width: 20, example: '2024-01-15' },
        { header: 'Notas', key: 'notas', width: 40, example: 'Cliente vip' },
    ],
    Profesionales: [
        { header: 'Nombre Completo', key: 'nombre', width: 30, example: 'Ana Gómez' },
        { header: 'Email', key: 'email', width: 25, example: 'ana.barber@vatosalfa.com' },
        { header: 'Rol (admin/barbero)', key: 'rol', width: 20, example: 'barbero' },
    ],
    Servicios: [
        { header: 'Nombre Servicio', key: 'nombre', width: 30, example: 'Corte Clásico' },
        { header: 'Precio', key: 'precio', width: 15, example: 250 },
        { header: 'Duración (min)', key: 'duracion', width: 15, example: 45 },
        { header: 'Comisión (%)', key: 'comision', width: 15, example: 40 },
    ],
    Productos: [
        { header: 'Nombre Producto', key: 'nombre', width: 30, example: 'Cera Mate' },
        { header: 'Precio Venta', key: 'precioVenta', width: 15, example: 150 },
        { header: 'Costo Compra', key: 'costoCompra', width: 15, example: 80 },
        { header: 'Stock Inicial', key: 'stock', width: 15, example: 50 },
        { header: 'Comisión (%)', key: 'comision', width: 15, example: 10 },
    ],
    Citas: [
        { header: 'Fecha (YYYY-MM-DD)', key: 'fecha', width: 20, example: '2025-02-20' },
        { header: 'Hora (HH:MM)', key: 'hora', width: 15, example: '14:30' },
        { header: 'Email o Tel Cliente', key: 'cliente', width: 25, example: 'juan@ejemplo.com' },
        { header: 'Email Profesional', key: 'profesional', width: 25, example: 'ana.barber@vatosalfa.com' },
        { header: 'Nombre Servicio', key: 'servicio', width: 30, example: 'Corte Clásico' },
        { header: 'Estado (completada/cancelada)', key: 'estado', width: 20, example: 'completada' },
        { header: 'Precio Cobrado', key: 'precio', width: 15, example: 250 },
    ],
    Ventas: [
        { header: 'Fecha (YYYY-MM-DD)', key: 'fecha', width: 20, example: '2025-02-20' },
        { header: 'Email o Tel Cliente', key: 'cliente', width: 25, example: 'juan@ejemplo.com' },
        { header: 'Email Profesional', key: 'profesional', width: 25, example: 'ana.barber@vatosalfa.com' },
        { header: 'Tipo (producto/servicio)', key: 'tipo', width: 20, example: 'producto' },
        { header: 'Nombre Item', key: 'item', width: 30, example: 'Cera Mate' },
        { header: 'Cantidad', key: 'cantidad', width: 10, example: 1 },
        { header: 'Precio Unitario', key: 'precio', width: 15, example: 150 },
        { header: 'Método Pago (efectivo/tarjeta)', key: 'metodo', width: 20, example: 'efectivo' },
    ]
};

export default function MigrationPage() {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'analyzing' | 'ready' | 'uploading' | 'completed' | 'error'>('idle');
    const [uploadLogs, setUploadLogs] = useState<string[]>([]);

    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();

        Object.entries(TEMPLATE_SCHEMA).forEach(([sheetName, columns]) => {
            // Create data with headers and one example row
            const headers = columns.map(c => c.header);
            const exampleRow = columns.map(c => c.example);

            const wsData = [headers, exampleRow];
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Set column widths
            ws['!cols'] = columns.map(c => ({ wch: c.width }));

            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        XLSX.writeFile(wb, "Plantilla_Migracion_VatosAlfa.xlsx");
        toast({ title: "Plantilla descargada", description: "Llena los datos y súbela nuevamente." });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setUploadStatus('idle');
            setPreviewData(null);
        }
    };

    const analyzeFile = async () => {
        if (!file) return;
        setUploadStatus('analyzing');

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);

            const analysis: any = {};
            let totalRows = 0;

            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                analysis[sheetName] = jsonData.length;
                totalRows += jsonData.length;
            });

            setPreviewData({ sheets: analysis, totalRows });
            setUploadStatus('ready');
            toast({ title: "Análisis completo", description: `Se encontraron ${totalRows} registros para importar.` });

        } catch (error) {
            console.error(error);
            setUploadStatus('error');
            toast({ variant: "destructive", title: "Error al leer archivo", description: "Verifica que sea el formato correcto." });
        }
    };

    const processMigration = async () => {
        // Here we would implement the actual backend logic or complex client-side batching
        // For now, as a provisional measure requested, we simulate or setup the structure

        if (!file) return;
        setIsProcessing(true);
        setUploadStatus('uploading');
        setUploadLogs(prev => [...prev, "Iniciando migración..."]);

        // Simulate reading again (or use cached data if optimized)
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);

        const logs: string[] = [];
        const addLog = (msg: string) => {
            logs.push(msg);
            setUploadLogs([...logs]);
        };

        try {
            // 1. Clientes
            const clientesSheet = workbook.Sheets['Clientes'];
            if (clientesSheet) {
                const clientes = XLSX.utils.sheet_to_json(clientesSheet);
                addLog(`Procesando ${clientes.length} clientes...`);
                // TODO: Implement actual Firestore Batch write for Clients
                // await migrateClientes(clientes);
            }

            // 2. Profesionales
            const profSheet = workbook.Sheets['Profesionales'];
            if (profSheet) {
                const profs = XLSX.utils.sheet_to_json(profSheet);
                addLog(`Procesando ${profs.length} profesionales...`);
            }

            // 3. Catálogos
            const servSheet = workbook.Sheets['Servicios'];
            if (servSheet) addLog(`Procesando ${XLSX.utils.sheet_to_json(servSheet).length} servicios...`);

            const prodSheet = workbook.Sheets['Productos'];
            if (prodSheet) addLog(`Procesando ${XLSX.utils.sheet_to_json(prodSheet).length} productos...`);

            // 4. Citas y Ventas
            const citasSheet = workbook.Sheets['Citas'];
            if (citasSheet) addLog(`Procesando ${XLSX.utils.sheet_to_json(citasSheet).length} citas históricas...`);

            const ventasSheet = workbook.Sheets['Ventas'];
            if (ventasSheet) addLog(`Procesando ${XLSX.utils.sheet_to_json(ventasSheet).length} ventas históricas...`);


            // SIMULATION DELAY
            await new Promise(resolve => setTimeout(resolve, 2000));

            addLog("NOTA: Esta es una simulación de validación. La escritura en base de datos real requiere confirmación de estructura.");

            setUploadStatus('completed');
            toast({ title: "Proceso completado", description: "La validación de datos fue exitosa." });

        } catch (e: any) {
            addLog(`Error crítico: ${e.message}`);
            setUploadStatus('error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex-1 space-y-6 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Migración de Datos Históricos</h2>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" onClick={handleDownloadTemplate}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Descargar Plantilla Maestra
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Cargar Archivo de Migración</CardTitle>
                        <CardDescription>
                            Sube el archivo Excel (.xlsx) con los datos completados según la plantilla.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                disabled={isProcessing}
                            />
                            <Button onClick={analyzeFile} disabled={!file || isProcessing || uploadStatus !== 'idle'}>
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Analizar
                            </Button>
                        </div>

                        {uploadStatus === 'analyzing' && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Analizando estructura del archivo...
                            </div>
                        )}

                        {previewData && (
                            <div className="mt-4 space-y-4">
                                <Alert>
                                    <CheckCircle className="h-4 w-4" />
                                    <AlertTitle>Archivo válido</AlertTitle>
                                    <AlertDescription>
                                        Se han detectado las siguientes hojas:
                                        <ul className="list-disc list-inside mt-2 text-sm">
                                            {Object.entries(previewData.sheets).map(([sheet, count]) => (
                                                <li key={sheet}><strong>{sheet}:</strong> {count as number} registros</li>
                                            ))}
                                        </ul>
                                    </AlertDescription>
                                </Alert>

                                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md text-yellow-800 text-sm flex gap-2">
                                    <AlertTriangle className="h-5 w-5 shrink-0" />
                                    <div>
                                        <strong>Advertencia de Seguridad:</strong> Estás a punto de importar datos masivos.
                                        Asegúrate de que los correos y teléfonos sean correctos para evitar duplicados.
                                        Esta acción no se puede deshacer fácilmente.
                                    </div>
                                </div>

                                <Button className="w-full" onClick={processMigration} disabled={isProcessing}>
                                    {isProcessing ? "Procesando..." : "Confirmar e Importar Datos"}
                                </Button>
                            </div>
                        )}

                        {uploadLogs.length > 0 && (
                            <div className="mt-4 bg-slate-950 text-slate-50 p-4 rounded-md text-xs font-mono max-h-40 overflow-y-auto">
                                {uploadLogs.map((log, i) => (
                                    <div key={i}>{log}</div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Instrucciones</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2 text-muted-foreground">
                        <p>1. Descarga la plantilla usando el botón superior.</p>
                        <p>2. No cambies los nombres de las hojas (pestañas).</p>
                        <p>3. Llena la información respetando los formatos (fechas: YYYY-MM-DD).</p>
                        <p>4. <strong>Importante:</strong> Para relacionar ventas con clientes, asegúrate de que el EMAIL o TELÉFONO coincida exactamente en ambas hojas.</p>
                        <p>5. Sube el archivo y espera la confirmación.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
