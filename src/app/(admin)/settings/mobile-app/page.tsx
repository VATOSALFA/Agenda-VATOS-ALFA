'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { db, storage } from '@/lib/firebase-client';
import { collection, addDoc, updateDoc, doc, deleteDoc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface AppAviso {
    id: string;
    titulo: string;
    descripcion: string;
    imagenUrl: string | null;
    fechaExpiracion: Timestamp | null;
    activo: boolean;
}

interface AppPromocion {
    id: string;
    titulo: string;
    descripcion: string;
    imagenUrl: string | null;
    codigoDescuento: string;
    mostrarQr: boolean;
    activo: boolean;
}

export default function MobileAppSettingsPage() {
    const { toast } = useToast();
    
    // -- AVISOS --
    const { data: avisos, loading: loadingAvisos } = useFirestoreQuery<AppAviso>('app_avisos');
    const [isSavingAviso, setIsSavingAviso] = useState(false);
    
    // -- PROMOCIONES --
    const { data: promociones, loading: loadingPromos } = useFirestoreQuery<AppPromocion>('app_promociones');
    const [isSavingPromo, setIsSavingPromo] = useState(false);
    
    // -- MEMBRESIA VIP --
    const [membresiaBenefits, setMembresiaBenefits] = useState<string[]>([]);
    const [newBenefit, setNewBenefit] = useState('');
    const [loadingMembresia, setLoadingMembresia] = useState(true);
    const [isSavingMembresia, setIsSavingMembresia] = useState(false);

    useEffect(() => {
        async function fetchMembresia() {
            try {
                const docRef = doc(db, 'ajustes_sitio', 'membresia_vip');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setMembresiaBenefits(docSnap.data().beneficios || []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingMembresia(false);
            }
        }
        fetchMembresia();
    }, []);

    const [avisoForm, setAvisoForm] = useState({ titulo: '', descripcion: '', fechaExpiracion: '', activo: true });
    const [avisoFile, setAvisoFile] = useState<File | null>(null);

    const [promoForm, setPromoForm] = useState({ titulo: '', descripcion: '', codigoDescuento: '', mostrarQr: true, activo: true });
    const [promoFile, setPromoFile] = useState<File | null>(null);

    const handleCreateAviso = async () => {
        if (!avisoForm.titulo) return toast({ title: 'Error', description: 'El título es obligatorio', variant: 'destructive' });
        setIsSavingAviso(true);
        try {
            let imagenUrl = null;
            if (avisoFile) {
                const storageRef = ref(storage, "app_avisos/" + Date.now() + "_" + avisoFile.name);
                await uploadBytes(storageRef, avisoFile);
                imagenUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, 'app_avisos'), {
                ...avisoForm,
                imagenUrl,
                fechaExpiracion: avisoForm.fechaExpiracion ? Timestamp.fromDate(new Date(avisoForm.fechaExpiracion)) : null,
                createdAt: Timestamp.now()
            });

            toast({ title: 'Éxito', description: 'Aviso creado correctamente.' });
            setAvisoForm({ titulo: '', descripcion: '', fechaExpiracion: '', activo: true });
            setAvisoFile(null);
        } catch (e) {
            toast({ title: 'Error', description: 'No se pudo crear el aviso.', variant: 'destructive' });
        } finally {
            setIsSavingAviso(false);
        }
    };

    const handleToggleAviso = async (id: string, currentStatus: boolean) => {
        await updateDoc(doc(db, 'app_avisos', id), { activo: !currentStatus });
    };

    const handleDeleteAviso = async (id: string) => {
        if (!confirm('¿Eliminar este aviso?')) return;
        await deleteDoc(doc(db, 'app_avisos', id));
    };

    const handleCreatePromo = async () => {
        if (!promoForm.titulo) return toast({ title: 'Error', description: 'El título es obligatorio', variant: 'destructive' });
        setIsSavingPromo(true);
        try {
            let imagenUrl = null;
            if (promoFile) {
                const storageRef = ref(storage, "app_promociones/" + Date.now() + "_" + promoFile.name);
                await uploadBytes(storageRef, promoFile);
                imagenUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, 'app_promociones'), {
                ...promoForm,
                imagenUrl,
                createdAt: Timestamp.now()
            });

            toast({ title: 'Éxito', description: 'Promoción creada correctamente.' });
            setPromoForm({ titulo: '', descripcion: '', codigoDescuento: '', mostrarQr: true, activo: true });
            setPromoFile(null);
        } catch (e) {
            toast({ title: 'Error', description: 'No se pudo crear la promoción.', variant: 'destructive' });
        } finally {
            setIsSavingPromo(false);
        }
    };

    const handleTogglePromo = async (id: string, currentStatus: boolean) => {
        await updateDoc(doc(db, 'app_promociones', id), { activo: !currentStatus });
    };

    const handleDeletePromo = async (id: string) => {
        if (!confirm('¿Eliminar esta promoción?')) return;
        await deleteDoc(doc(db, 'app_promociones', id));
    };

    const handleAddBenefit = () => {
        if (!newBenefit.trim()) return;
        setMembresiaBenefits(prev => [...prev, newBenefit.trim()]);
        setNewBenefit('');
    };

    const handleRemoveBenefit = (index: number) => {
        setMembresiaBenefits(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveMembresia = async () => {
        setIsSavingMembresia(true);
        try {
            await setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                beneficios: membresiaBenefits,
                updatedAt: Timestamp.now()
            });
            toast({ title: 'Éxito', description: 'Privilegios actualizados correctamente.' });
        } catch (e) {
            toast({ title: 'Error', description: 'No se pudieron guardar los privilegios.', variant: 'destructive' });
        } finally {
            setIsSavingMembresia(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold tracking-tight">App Móvil</h3>
                <p className="text-muted-foreground">
                    Gestiona los comunicados, sugerencias y privilegios VIP de tu aplicación móvil VATOS ALFA.
                </p>
            </div>

            <Tabs defaultValue="avisos" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="avisos">Avisos y Comunicados</TabsTrigger>
                    <TabsTrigger value="sugerencias">Sugerencias y Promociones</TabsTrigger>
                    <TabsTrigger value="membresia">Privilegios VIP</TabsTrigger>
                </TabsList>
                
                {/* AVISOS TAB */}
                <TabsContent value="avisos" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Nuevo Aviso</CardTitle>
                            <CardDescription>Crea un comunicado para la pantalla de inicio de la app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Título</Label>
                                    <Input value={avisoForm.titulo} onChange={e => setAvisoForm({...avisoForm, titulo: e.target.value})} placeholder="Ej. Cerrado por festivo" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fecha de Expiración (Opcional)</Label>
                                    <Input type="datetime-local" value={avisoForm.fechaExpiracion} onChange={e => setAvisoForm({...avisoForm, fechaExpiracion: e.target.value})} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea value={avisoForm.descripcion} onChange={e => setAvisoForm({...avisoForm, descripcion: e.target.value})} placeholder="Mensaje para los clientes..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Imagen del aviso (Opcional)</Label>
                                <Input type="file" accept="image/*" onChange={e => setAvisoFile(e.target.files?.[0] || null)} />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-2">
                                    <Switch checked={avisoForm.activo} onCheckedChange={c => setAvisoForm({...avisoForm, activo: c})} />
                                    <Label>Publicar inmediatamente</Label>
                                </div>
                                <Button onClick={handleCreateAviso} disabled={isSavingAviso}>
                                    {isSavingAviso ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Crear Aviso
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Avisos Activos e Historial</h4>
                        {loadingAvisos ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /> : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {avisos?.map(aviso => (
                                    <Card key={aviso.id} className={!aviso.activo ? 'opacity-60' : ''}>
                                        {aviso.imagenUrl && (
                                            <div className="w-full h-32 overflow-hidden rounded-t-lg bg-muted">
                                                <img src={aviso.imagenUrl} alt="Aviso" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <CardContent className="p-4 relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h5 className="font-bold">{aviso.titulo}</h5>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={aviso.activo} onCheckedChange={() => handleToggleAviso(aviso.id, aviso.activo)} />
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAviso(aviso.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-2">{aviso.descripcion}</p>
                                            {aviso.fechaExpiracion && (
                                                <Badge variant="outline" className="text-xs">
                                                    Expira: {format(aviso.fechaExpiracion.toDate(), "dd MMM yyyy, HH:mm", { locale: es })}
                                                </Badge>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>
                
                {/* PROMOCIONES TAB */}
                <TabsContent value="sugerencias" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Nueva Promoción / Sugerencia</CardTitle>
                            <CardDescription>Añade banners promocionales y cupones de descuento a la app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Título de la promoción</Label>
                                    <Input value={promoForm.titulo} onChange={e => setPromoForm({...promoForm, titulo: e.target.value})} placeholder="Ej. 20% en Corte Fade" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Código de Descuento (Opcional)</Label>
                                    <Input value={promoForm.codigoDescuento} onChange={e => setPromoForm({...promoForm, codigoDescuento: e.target.value.toUpperCase()})} placeholder="Ej. FADE20" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción o Sugerencia</Label>
                                <Textarea value={promoForm.descripcion} onChange={e => setPromoForm({...promoForm, descripcion: e.target.value})} placeholder="Detalles de la promo..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Banner Publicitario (Opcional)</Label>
                                <Input type="file" accept="image/*" onChange={e => setPromoFile(e.target.files?.[0] || null)} />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <Switch checked={promoForm.mostrarQr} onCheckedChange={c => setPromoForm({...promoForm, mostrarQr: c})} />
                                        <Label>Mostrar como Código QR</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch checked={promoForm.activo} onCheckedChange={c => setPromoForm({...promoForm, activo: c})} />
                                        <Label>Activo</Label>
                                    </div>
                                </div>
                                <Button onClick={handleCreatePromo} disabled={isSavingPromo}>
                                    {isSavingPromo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Crear Promoción
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Promociones Activas</h4>
                        {loadingPromos ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /> : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {promociones?.map(promo => (
                                    <Card key={promo.id} className={!promo.activo ? 'opacity-60' : ''}>
                                        {promo.imagenUrl && (
                                            <div className="w-full h-32 overflow-hidden rounded-t-lg bg-muted">
                                                <img src={promo.imagenUrl} alt="Banner" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <CardContent className="p-4 relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h5 className="font-bold">{promo.titulo}</h5>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={promo.activo} onCheckedChange={() => handleTogglePromo(promo.id, promo.activo)} />
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeletePromo(promo.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-4">{promo.descripcion}</p>
                                            
                                            {promo.codigoDescuento && (
                                                <div className="flex items-center gap-2 bg-muted p-2 rounded-md w-fit">
                                                    <Badge variant="default" className="text-sm tracking-wider">{promo.codigoDescuento}</Badge>
                                                    {promo.mostrarQr && <Badge variant="secondary" className="text-xs">QR Activado</Badge>}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* MEMBRESIA VIP TAB */}
                <TabsContent value="membresia" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Privilegios de Membresía VIP</CardTitle>
                            <CardDescription>Construye la lista de beneficios que verán los usuarios VIP en la app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {loadingMembresia ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /> : (
                                <>
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <Input 
                                                value={newBenefit} 
                                                onChange={e => setNewBenefit(e.target.value)} 
                                                placeholder="Ej. Cortesía de cerveza en cada visita" 
                                                onKeyDown={e => e.key === 'Enter' && handleAddBenefit()}
                                            />
                                            <Button onClick={handleAddBenefit} variant="secondary">Agregar</Button>
                                        </div>
                                        
                                        <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                                            {membresiaBenefits.length === 0 ? (
                                                <p className="text-sm text-muted-foreground text-center py-4">No hay beneficios configurados.</p>
                                            ) : (
                                                membresiaBenefits.map((benefit, idx) => (
                                                    <div key={idx} className="flex items-center justify-between bg-background p-3 rounded-md border shadow-sm">
                                                        <div className="flex items-center gap-3">
                                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                            <span className="font-medium">{benefit}</span>
                                                        </div>
                                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveBenefit(idx)}>
                                                            <Trash2 className="w-4 h-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-4">
                                        <Button onClick={handleSaveMembresia} disabled={isSavingMembresia} className="w-full md:w-auto">
                                            {isSavingMembresia ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                            Guardar Beneficios VIP
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
