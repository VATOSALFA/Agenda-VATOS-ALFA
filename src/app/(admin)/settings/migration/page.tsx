'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, ArrowDownCircle, ShoppingCart } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { collection, doc, writeBatch, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

type MigrationMode = 'ventas' | 'egresos';

export default function MigrationPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'analyzing' | 'ready' | 'uploading' | 'completed' | 'error'>('idle');
    const [uploadLogs, setUploadLogs] = useState<string[]>([]);
    const [locales, setLocales] = useState<any[]>([]);
    const [migrationMode, setMigrationMode] = useState<MigrationMode>('egresos'); // Default a egresos ahora

    useEffect(() => {
        const fetchLocales = async () => {
            if (!db) return;
            try {
                const snap = await getDocs(collection(db, 'locales'));
                const locs = snap.docs.map(d => ({ id: d.id, name: d.data().name, ...d.data() }));
                setLocales(locs);
            } catch (e) {
                console.error("Error al cargar locales", e);
            }
        };
        fetchLocales();
    }, [db]);

    const parseExcelDate = (input: any): Date | null => {
        if (!input) return null;
        if (input instanceof Date) return input;

        if (typeof input === 'number') {
            const date = XLSX.SSF.parse_date_code(input);
            if (!date) return null;
            return new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S);
        }

        if (typeof input === 'string') {
            const cleanInput = input.trim();
            let matches = cleanInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
            if (matches) {
                return new Date(parseInt(matches[3]), parseInt(matches[2]) - 1, parseInt(matches[1]), matches[4] ? parseInt(matches[4]) : 0, matches[5] ? parseInt(matches[5]) : 0);
            }

            const isoDate = new Date(cleanInput);
            if (!isNaN(isoDate.getTime())) return isoDate;
        }
        return null;
    }

    const parseCurrency = (val: any): number => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const str = val.toString().trim();
        const clean = str.replace(/[^0-9.-]+/g, "");
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    };

    const formatName = (name: string) => {
        if (!name) return '';
        let cleaned = name.trim().replace(/\s+/g, ' ');
        return cleaned.toLowerCase().replace(/(?:^|\s)\S/g, function (a) { return a.toUpperCase(); });
    };

    // ============================================================
    // LÓGICA INTELIGENTE PARA EXTRAER NOMBRE DE "A quién se entrega"
    // ============================================================
    const extractPersonName = (aQuienRaw: string, conceptoRaw: string, knownNames: string[]): string => {
        // 1. PRIMERO: Intentar limpiar la columna "A quién se entrega"
        let candidate = cleanNameFromPhrase(aQuienRaw || '');

        // 2. Si el candidato es válido (es un nombre real, no una fecha/número), usarlo
        if (candidate && isLikelyName(candidate)) {
            // Intentar hacer match con nombres conocidos
            const matched = findBestNameMatch(candidate, knownNames);
            return matched || formatName(candidate);
        }

        // 3. FALLBACK: Buscar nombre en la columna "Concepto"
        candidate = cleanNameFromPhrase(conceptoRaw || '');
        if (candidate && isLikelyName(candidate)) {
            const matched = findBestNameMatch(candidate, knownNames);
            return matched || formatName(candidate);
        }

        // 4. ÚLTIMO FALLBACK: Devolver lo que haya limpio o "Desconocido"
        return formatName(aQuienRaw) || 'Desconocido';
    };

    // Limpia frases comunes para extraer solo el nombre
    const cleanNameFromPhrase = (phrase: string): string => {
        if (!phrase) return '';
        let cleaned = phrase.trim();

        // Patrones comunes que anteceden al nombre
        const patterns = [
            /^se\s+lo\s+(?:di|trajo|entregó|entrego|dio|llevo|llevó)\s+(?:a\s+)?/i,
            /^se\s+los?\s+(?:di|trajo|entregó|entrego|dio|llevo|llevó)\s+(?:a\s+)?/i,
            /^entrego?\s+(?:efectivo\s+)?(?:a\s+)?/i,
            /^entregado\s+(?:a\s+)?/i,
            /^efectivo\s+entregado?\s+(?:a\s+)?/i,
            /^pago?\s+(?:de\s+)?comision(?:es)?\s+(?:de\s+)?/i,
            /^pagoo?\s+(?:de\s+)?comision(?:es)?\s+(?:de\s+)?/i,
            /^comisi[oó]n(?:es)?\s+(?:de\s+)?/i,
            /^propina\s+(?:de\s+)?/i,
            /^pago\s+(?:de\s+)?(?:comisiones?\s+)?(?:de\s+)?/i,
            /^corte\s+de\s+caja/i,
            /^entrego\s+efectivo\s+por\s+corte\s+de\s+caja/i,
        ];

        for (const pattern of patterns) {
            cleaned = cleaned.replace(pattern, '');
        }

        // Quitar la palabra "terminal" al final
        cleaned = cleaned.replace(/\s+terminal$/i, '');

        // Quitar todo después de fecha o número
        // Si lo restante es solo un nombre, limpiarlo
        cleaned = cleaned.trim();

        return cleaned;
    };

    // Verifica si una cadena parece un nombre (no es fecha, no es número puro)
    const isLikelyName = (str: string): boolean => {
        if (!str || str.length < 2) return false;
        // Rechazar strings puramente numéricos o parecidos a fechas
        if (/^\d+$/.test(str.replace(/\s/g, ''))) return false;
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) return false;
        if (/^\d+\s*(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(str)) return false;
        if (/^\d{1,2}\s*(?:de\s+)?(?:feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|ene)/i.test(str)) return false;
        if (/^\d{1,2}[A-Z]{3,}\d{2,4}$/i.test(str)) return false; // 15FEB2025, 180225, etc.
        if (/^CORTE\s+DE\s+CAJA$/i.test(str)) return false;
        // Debe contener al menos una letra
        if (!/[a-záéíóúñA-ZÁÉÍÓÚÑ]/.test(str)) return false;
        return true;
    };

    // Busca el mejor match entre un candidato y los nombres conocidos del sistema
    const findBestNameMatch = (candidate: string, knownNames: string[]): string | null => {
        const candidateLower = candidate.toLowerCase().trim();

        // Match exacto
        for (const name of knownNames) {
            if (name.toLowerCase() === candidateLower) return name;
        }

        // Match parcial: el candidato contiene el primer nombre o viceversa
        for (const name of knownNames) {
            const firstName = name.split(' ')[0].toLowerCase();
            if (firstName.length >= 3 && candidateLower.includes(firstName)) return name;
            if (candidateLower.length >= 3 && name.toLowerCase().includes(candidateLower)) return name;
        }

        return null;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setUploadStatus('idle');
            setPreviewData(null);
            setUploadLogs([]);
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
            toast({ title: "Análisis completo", description: `Se encontraron ${totalRows} filas (modo: ${migrationMode}).` });
        } catch (error) {
            console.error(error);
            setUploadStatus('error');
            toast({ variant: "destructive", title: "Error al leer archivo", description: "Formato inválido." });
        }
    };

    // ============================================================
    // IMPORTACIÓN DE EGRESOS
    // ============================================================
    const processEgresosMigration = async () => {
        if (!file || !db) return;
        setIsProcessing(true);
        setUploadStatus('uploading');
        setUploadLogs(prev => [...prev, "Iniciando importación de EGRESOS..."]);

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);

        const addLog = (msg: string) => {
            setUploadLogs(prev => [...prev, msg]);
        };

        try {
            const mainSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[mainSheetName];
            const rawData = XLSX.utils.sheet_to_json<any>(worksheet);

            addLog(`Leídas ${rawData.length} filas de egresos.`);

            // Cargar locales
            const localIdMap: { [name: string]: string } = {};
            let defaultLocalId = locales.length > 0 ? locales[0].id : '';
            locales.forEach(l => {
                localIdMap[l.name.toLowerCase()] = l.id;
                // Variantes comunes
                const nameLower = l.name.toLowerCase();
                if (nameLower.includes('suc1') || nameLower.includes('barber shop')) {
                    localIdMap['vatos alfa barber shop suc1'] = l.id;
                }
            });

            // Cargar usuarios/profesionales para match de nombres
            const prosSnap = await getDocs(collection(db, 'usuarios'));
            const usersMap = new Map<string, { id: string; name: string }>();
            const knownNames: string[] = [];

            prosSnap.forEach(docSnap => {
                const d = docSnap.data();
                const fullName = `${d.nombre || ''} ${d.apellido || ''}`.trim();
                const firstName = (d.nombre || '').trim();

                usersMap.set(fullName.toLowerCase(), { id: docSnap.id, name: fullName });
                if (firstName) {
                    usersMap.set(firstName.toLowerCase(), { id: docSnap.id, name: fullName });
                }
                if (d.name) {
                    usersMap.set(d.name.toLowerCase(), { id: docSnap.id, name: d.name });
                }
                knownNames.push(fullName);
                if (firstName && firstName !== fullName) knownNames.push(firstName);
            });

            addLog(`Usuarios del sistema: ${knownNames.length} nombres conocidos.`);

            let batch = writeBatch(db);
            let operationCount = 0;
            let batchCount = 0;
            let importedCount = 0;
            let skippedCount = 0;
            let nameExtractionLog: string[] = [];

            const commitBatch = async () => {
                if (operationCount > 0) {
                    await batch.commit();
                    batchCount++;
                    addLog(`Lote ${batchCount} guardado (${operationCount} ops).`);
                    batch = writeBatch(db);
                    operationCount = 0;
                }
            };

            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];

                // FECHA
                const fechaRaw = row['Fecha'] || row['fecha'];
                let fechaEgreso = parseExcelDate(fechaRaw);
                if (!fechaEgreso) {
                    skippedCount++;
                    continue; // Sin fecha no hay egreso válido
                }

                // LOCAL
                const localRaw = (row['Local'] || row['local'] || '').toString().toLowerCase();
                let localId = defaultLocalId;
                if (localIdMap[localRaw]) {
                    localId = localIdMap[localRaw];
                } else {
                    const foundLocal = locales.find(l => localRaw.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(localRaw));
                    if (foundLocal) localId = foundLocal.id;
                }

                // CONCEPTO
                const conceptoRaw = (row['Concepto'] || row['concepto'] || '').toString().trim();

                // A QUIÉN SE ENTREGA (con lógica inteligente)
                const aQuienRaw = (row['A quién se entrega'] || row['A quien se entrega'] || row['a quién se entrega'] || row['a quien se entrega'] || '').toString().trim();

                // COMENTARIOS
                const comentariosRaw = (row['Comentarios'] || row['Cometarios'] || row['comentarios'] || row['cometarios'] || '').toString().trim();

                // MONTO
                const monto = parseCurrency(row['Monto'] || row['monto']);
                if (monto <= 0) {
                    skippedCount++;
                    continue; // Sin monto no hay egreso válido
                }

                // === EXTRACCIÓN INTELIGENTE DE NOMBRE ===
                const extractedName = extractPersonName(aQuienRaw, conceptoRaw, knownNames);

                // Buscar ID del usuario en el sistema
                let aQuienId = '';
                let aQuienNombre = extractedName;

                const matchedUser = usersMap.get(extractedName.toLowerCase());
                if (matchedUser) {
                    aQuienId = matchedUser.id;
                    aQuienNombre = matchedUser.name;
                } else {
                    // Buscar por nombre parcial si no hubo match exacto
                    for (const [key, val] of usersMap.entries()) {
                        const extractedLower = extractedName.toLowerCase();
                        if (key.includes(extractedLower) || extractedLower.includes(key.split(' ')[0])) {
                            aQuienId = val.id;
                            aQuienNombre = val.name;
                            break;
                        }
                    }
                }

                // Log de ejemplo para las primeras filas
                if (i < 5) {
                    nameExtractionLog.push(`Fila ${i + 2}: "${aQuienRaw}" + "${conceptoRaw}" → "${aQuienNombre}" (ID: ${aQuienId || 'N/A'})`);
                }

                // GUARDAR EGRESO
                const newEgresoId = doc(collection(db, 'egresos')).id;
                const egresoData: any = {
                    fecha: Timestamp.fromDate(fechaEgreso),
                    monto: monto,
                    concepto: conceptoRaw || 'Importado desde Excel',
                    aQuien: aQuienNombre,
                    aQuienId: aQuienId || 'importado',
                    local_id: localId,
                    comentarios: comentariosRaw || `Importado: ${aQuienRaw}`,
                    persona_entrega_id: 'migracion_excel',
                    persona_entrega_nombre: 'Migración Excel',
                    origen: 'migracion_excel'
                };

                batch.set(doc(db, 'egresos', newEgresoId), egresoData);
                operationCount++;
                importedCount++;

                if (operationCount >= 450) await commitBatch();
            }

            await commitBatch();

            // Mostrar logs de extracción de nombres
            if (nameExtractionLog.length > 0) {
                addLog("--- Muestra de extracción de nombres ---");
                nameExtractionLog.forEach(log => addLog(log));
                addLog("---");
            }

            addLog(`¡EGRESOS IMPORTADOS! Total: ${importedCount}. Saltados: ${skippedCount}.`);
            setUploadStatus('completed');
            toast({ title: "Egresos importados", description: `${importedCount} egresos registrados exitosamente.` });

        } catch (e: any) {
            console.error(e);
            addLog(`ERROR: ${e.message}`);
            setUploadStatus('error');
        } finally {
            setIsProcessing(false);
        }
    };

    // ============================================================
    // IMPORTACIÓN DE VENTAS (V11 existente)
    // ============================================================
    const processVentasMigration = async () => {
        if (!file || !db) return;
        setIsProcessing(true);
        setUploadStatus('uploading');
        setUploadLogs(prev => [...prev, "Iniciando migración V11 (Pagos Exactos)..."]);

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);

        const addLog = (msg: string) => {
            setUploadLogs(prev => [...prev, msg]);
        };

        try {
            const mainSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[mainSheetName];
            const rawData = XLSX.utils.sheet_to_json<any>(worksheet);

            addLog(`Leídas ${rawData.length} filas.`);
            addLog(`Analizando datos...`);

            const existingClientsMap = new Map<string, string>();
            const existingServicesMap = new Map<string, string>();
            const existingProsMap = new Map<string, string>();

            const localIdMap: { [name: string]: string } = {};
            let defaultLocalId = locales.length > 0 ? locales[0].id : '';
            locales.forEach(l => {
                localIdMap[l.name.toLowerCase()] = l.id;
                if (l.name.toLowerCase().includes('suc1')) localIdMap['suc1'] = l.id;
            });

            const clientsSnap = await getDocs(collection(db, 'clientes'));
            clientsSnap.forEach(doc => {
                const d = doc.data();
                if (d.correo) existingClientsMap.set(d.correo.toLowerCase(), doc.id);
                if (d.telefono) existingClientsMap.set(d.telefono, doc.id);
                if (d.nombre && d.apellido) {
                    const full = `${d.nombre} ${d.apellido}`.trim().toLowerCase();
                    existingClientsMap.set(full, doc.id);
                }
            });

            const servicesSnap = await getDocs(collection(db, 'servicios'));
            servicesSnap.forEach(doc => {
                if (doc.data().nombre) existingServicesMap.set(doc.data().nombre.toLowerCase(), doc.id);
            });

            const prosSnap = await getDocs(collection(db, 'usuarios'));
            let defaultProId = '';
            prosSnap.forEach(doc => {
                const d = doc.data();
                const fullName = `${d.nombre || ''} ${d.apellido || ''}`.trim().toLowerCase();
                existingProsMap.set(fullName, doc.id);
                if (d.nombre) existingProsMap.set(d.nombre.toLowerCase(), doc.id);
                if (!defaultProId && (d.role === 'admin' || fullName.includes('vatos'))) defaultProId = doc.id;
            });
            if (!defaultProId && prosSnap.size > 0) defaultProId = prosSnap.docs[0].id;

            let batch = writeBatch(db);
            let operationCount = 0;
            let batchCount = 0;

            const commitBatch = async () => {
                if (operationCount > 0) {
                    await batch.commit();
                    batchCount++;
                    addLog(`Lote ${batchCount} guardado (${operationCount} ops).`);
                    batch = writeBatch(db);
                    operationCount = 0;
                }
            };

            const clientsToImport = new Map<string, any>();
            let skippedClientCount = 0;

            for (const row of rawData) {
                let nombreRaw = row['Nombre'] || row['nombre'] || row['Nombre cliente'] || '';
                let apellidoRaw = row['Apellido'] || row['apellido'] || '';

                let nombre = '';
                let apellido = '';
                let nombreCompleto = '';

                if (apellidoRaw && apellidoRaw.toString().trim().length > 0) {
                    nombre = formatName(nombreRaw);
                    apellido = formatName(apellidoRaw);
                    nombreCompleto = `${nombre} ${apellido}`;
                } else {
                    const cleanFull = formatName(nombreRaw);
                    nombreCompleto = cleanFull;
                    const partes = cleanFull.split(' ');
                    if (partes.length === 1) {
                        nombre = partes[0];
                    } else if (partes.length === 2) {
                        nombre = partes[0];
                        apellido = partes[1];
                    } else if (partes.length === 3) {
                        nombre = `${partes[0]} ${partes[1]}`;
                        apellido = partes[2];
                    } else if (partes.length >= 4) {
                        nombre = `${partes[0]} ${partes[1]}`;
                        apellido = partes.slice(2).join(' ');
                    }
                }

                const email = (row['Email cliente'] || row['email cliente'] || '').trim().toLowerCase();
                const tel = (row['Teléfono cliente'] || row['telefono cliente'] || '').toString().replace(/\D/g, '');

                const clientKey = email || tel || nombreCompleto.toLowerCase();

                if (!clientKey || clientKey.length < 2) {
                    skippedClientCount++;
                    continue;
                }

                if (clientsToImport.has(clientKey)) continue;

                const fechaClienteRaw = row['Cliente desde'] || row['cliente desde'] || row['Fecha de creación'];
                let fechaRegistroDate = parseExcelDate(fechaClienteRaw);
                if (!fechaRegistroDate) fechaRegistroDate = new Date();

                const isZeus = nombreCompleto.toLowerCase().includes('zeus alejandro pacheco');

                clientsToImport.set(clientKey, {
                    key: clientKey, email, tel, nombre, apellido, nombreCompleto, fechaRegistroDate, isZeus
                });
            }

            let clientsArray = Array.from(clientsToImport.values());
            clientsArray.sort((a, b) => {
                if (a.isZeus) return -1;
                if (b.isZeus) return 1;
                return a.fechaRegistroDate.getTime() - b.fechaRegistroDate.getTime();
            });

            addLog(`Clientes únicos: ${clientsArray.length}. (Saltados: ${skippedClientCount})`);
            addLog(`Guardando clientes...`);

            const clientKeyToIdMap = new Map<string, string>();
            let currentClientNumber = 1;

            for (const client of clientsArray) {
                const numeroCliente = currentClientNumber++;
                let clientId = existingClientsMap.get(client.key) ||
                    existingClientsMap.get(client.email) ||
                    existingClientsMap.get(client.tel) ||
                    existingClientsMap.get(client.nombreCompleto.toLowerCase());

                const dataToSave: any = {
                    numero_cliente: numeroCliente.toString(),
                    creado_en: Timestamp.fromDate(client.fechaRegistroDate),
                    cliente_desde: Timestamp.fromDate(client.fechaRegistroDate),
                };

                if (clientId) {
                    batch.set(doc(db, 'clientes', clientId), dataToSave, { merge: true });
                } else {
                    clientId = doc(collection(db, 'clientes')).id;
                    const newClientData = {
                        ...dataToSave,
                        nombre: client.nombre,
                        apellido: client.apellido,
                        telefono: client.tel || '',
                        correo: client.email || '',
                        notas: 'Importado desde histórico v11',
                        origen: 'migracion_excel',
                        activo: true,
                    };
                    batch.set(doc(db, 'clientes', clientId), newClientData);
                    if (client.email) existingClientsMap.set(client.email, clientId);
                    if (client.tel) existingClientsMap.set(client.tel, clientId);
                    existingClientsMap.set(client.nombreCompleto.toLowerCase(), clientId);
                }

                clientKeyToIdMap.set(client.key, clientId);
                operationCount++;
                if (operationCount >= 450) await commitBatch();
            }
            await commitBatch();

            addLog("Importando ventas...");
            let skippedSales = 0;

            for (const row of rawData) {
                let nombreRaw = row['Nombre'] || row['nombre'] || row['Nombre cliente'] || '';
                let apellidoRaw = row['Apellido'] || row['apellido'] || '';
                let nombreCompleto = '';
                if (apellidoRaw && apellidoRaw.toString().trim().length > 0) {
                    nombreCompleto = `${formatName(nombreRaw)} ${formatName(apellidoRaw)}`;
                } else {
                    nombreCompleto = formatName(nombreRaw);
                }

                const email = (row['Email cliente'] || '').trim().toLowerCase();
                const tel = (row['Teléfono cliente'] || '').toString().replace(/\D/g, '');
                const clientKey = email || tel || nombreCompleto.toLowerCase();

                let clientId = clientKeyToIdMap.get(clientKey) ||
                    existingClientsMap.get(clientKey) ||
                    existingClientsMap.get(email) ||
                    existingClientsMap.get(tel) ||
                    existingClientsMap.get(nombreCompleto.toLowerCase());

                if (!clientId) { skippedSales++; continue; }

                const profName = (row['professional/Vendedor'] || row['Prestador/Vendedor'] || '').trim().toLowerCase();
                const profId = existingProsMap.get(profName) || defaultProId;
                const itemName = (row['Servicio/Producto'] || '').trim();
                const itemType = (row['Items'] || 'Servicio').toLowerCase().includes('producto') ? 'producto' : 'servicio';

                const fechaPagoRaw = row['Fecha de Pago'];
                let fechaPago = parseExcelDate(fechaPagoRaw);
                if (!fechaPago) fechaPago = new Date();

                const localRaw = (row['Local'] || '').toString().toLowerCase();
                let localId = defaultLocalId;
                if (localIdMap[localRaw]) localId = localIdMap[localRaw];
                else {
                    const foundLocal = locales.find(l => localRaw.includes(l.name.toLowerCase()));
                    if (foundLocal) localId = foundLocal.id;
                }

                const total = parseCurrency(row['Total pagado'] || row['Total']);
                const efectivo = parseCurrency(row['Efectivo']);
                const tarjeta = parseCurrency(row['Tarjeta']);
                const online = parseCurrency(row['Online']);
                const transferencia = parseCurrency(row['Transferencia']);

                let metodoPago = 'efectivo';
                if (online > 0) metodoPago = 'online';
                else if (tarjeta > 0) metodoPago = 'tarjeta';
                else if (transferencia > 0) metodoPago = 'transferencia';
                else if (efectivo > 0) metodoPago = 'efectivo';

                const newSaleId = doc(collection(db, 'ventas')).id;
                const itemData = {
                    id: Math.random().toString(36).substr(2, 9),
                    nombre: itemName,
                    cantidad: Number(row['Cantidad'] || 1),
                    precio: parseCurrency(row['Precio'] || total),
                    subtotal: total,
                    tipo: itemType,
                    barbero_id: profId
                };

                const saleData = {
                    cliente_id: clientId,
                    profesional_id: profId,
                    local_id: localId,
                    fecha_hora_venta: Timestamp.fromDate(fechaPago),
                    total, subtotal: total,
                    metodo_pago: metodoPago,
                    estado: 'pagado',
                    items: [itemData],
                    notas: `Importado: ${row['Reserva/Marca'] || ''}`,
                    origen: 'migracion_excel',
                    descuento: { valor: 0, tipo: 'fixed' }
                };

                batch.set(doc(db, 'ventas', newSaleId), saleData);
                operationCount++;
                if (operationCount >= 450) await commitBatch();
            }

            await commitBatch();

            addLog(`¡MIGRACIÓN V11 COMPLETADA!`);
            if (skippedSales > 0) addLog(`Aviso: ${skippedSales} ventas omitidas.`);
            setUploadStatus('completed');
            toast({ title: "Proceso completado" });

        } catch (e: any) {
            console.error(e);
            addLog(`ERROR: ${e.message}`);
            setUploadStatus('error');
        } finally {
            setIsProcessing(false);
        }
    };

    // Dispatcher
    const processMigration = () => {
        if (migrationMode === 'egresos') {
            processEgresosMigration();
        } else {
            processVentasMigration();
        }
    };

    return (
        <div className="flex-1 space-y-6 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Migración de Datos Históricos</h2>
                <div className="flex items-center space-x-2">
                    <Button
                        variant={migrationMode === 'ventas' ? 'default' : 'outline'}
                        onClick={() => { setMigrationMode('ventas'); setUploadStatus('idle'); setPreviewData(null); setUploadLogs([]); }}
                        disabled={isProcessing}
                    >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Ventas / Clientes
                    </Button>
                    <Button
                        variant={migrationMode === 'egresos' ? 'default' : 'outline'}
                        onClick={() => { setMigrationMode('egresos'); setUploadStatus('idle'); setPreviewData(null); setUploadLogs([]); }}
                        disabled={isProcessing}
                    >
                        <ArrowDownCircle className="mr-2 h-4 w-4" />
                        Egresos
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>
                            {migrationMode === 'egresos' ? 'Importar Egresos desde Excel' : 'Importar Ventas / Clientes'}
                        </CardTitle>
                        <CardDescription>
                            {migrationMode === 'egresos' ? (
                                <>
                                    Columnas esperadas: <strong>Fecha, Local, Concepto, A quién se entrega, Comentarios, Monto</strong>.
                                    <br />Los nombres se extraen inteligentemente de frases como &quot;Se lo di a Zeus&quot; o &quot;Comisión de Beatriz&quot;.
                                </>
                            ) : (
                                <>
                                    Algoritmo de lectura numérica para montos y métodos de pago.
                                    <br />Nombres híbridos (separados o juntos).
                                </>
                            )}
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
                                <Loader2 className="h-4 w-4 animate-spin" /> Analizando...
                            </div>
                        )}

                        {previewData && (
                            <div className="mt-4 space-y-4">
                                <Alert>
                                    <CheckCircle className="h-4 w-4" />
                                    <AlertTitle>Archivo analizado ({previewData.totalRows} filas)</AlertTitle>
                                    <AlertDescription>
                                        {migrationMode === 'egresos'
                                            ? 'Listo para importar egresos. Se extraerán nombres automáticamente.'
                                            : 'Listo para importar ventas y clientes.'}
                                    </AlertDescription>
                                </Alert>

                                <Button className="w-full" onClick={processMigration} disabled={isProcessing}>
                                    {isProcessing ? "Procesando..." : migrationMode === 'egresos' ? "Importar Egresos" : "Importar Ventas"}
                                </Button>
                            </div>
                        )}

                        {uploadLogs.length > 0 && (
                            <div className="mt-4 bg-slate-950 text-slate-50 p-4 rounded-md text-xs font-mono max-h-60 overflow-y-auto">
                                {uploadLogs.map((log, i) => (
                                    <div key={i} className="border-b border-slate-800 pb-1 mb-1 last:border-0">{log}</div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>{migrationMode === 'egresos' ? 'Lógica de Egresos' : 'Lógica de Ventas V11'}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2 text-muted-foreground">
                        {migrationMode === 'egresos' ? (
                            <>
                                <p>1. <strong>Extracción de Nombres:</strong> Limpia frases como &quot;Se lo trajo Zeus&quot; → <em>Zeus</em>.</p>
                                <p>2. <strong>Match Inteligente:</strong> Compara con usuarios del sistema para asignar el ID correcto.</p>
                                <p>3. <strong>Fallback a Concepto:</strong> Si &quot;A quién&quot; tiene fecha/número, busca el nombre en &quot;Concepto&quot;.</p>
                                <p>4. <strong>Montos:</strong> Limpia símbolos $ y comas.</p>
                                <p className="pt-2 text-xs border-t">
                                    <strong>Ejemplos:</strong><br />
                                    &quot;Se lo trajo Zeus&quot; → Zeus<br />
                                    &quot;COMISION DE BEATRIZ&quot; → Beatriz<br />
                                    &quot;Se lo di a Alejandro&quot; → Alejandro<br />
                                    &quot;Pago comisiones de Beatriz&quot; → Beatriz
                                </p>
                            </>
                        ) : (
                            <>
                                <p>1. <strong>Lectura Numérica:</strong> Ignora &quot;$&quot; y &quot;,&quot; para montos exactos.</p>
                                <p>2. <strong>Pagos Online:</strong> Se registran como &apos;online&apos;.</p>
                                <p>3. <strong>Clientes sin Contacto:</strong> Usa nombre como fallback.</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
