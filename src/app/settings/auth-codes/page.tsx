
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, PlusCircle, Edit, Trash2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const mockCodes = [
    { id: 1, name: 'Beatriz administradora', active: true, code: 'admin', reserves: true, cashbox: false, download: true },
    { id: 2, name: 'Zeus', active: true, code: '2408', reserves: true, cashbox: true, download: true },
    { id: 3, name: 'Azucena', active: true, code: 'Azucena11', reserves: true, cashbox: true, download: true },
    { id: 4, name: 'Beatriz', active: true, code: 'teamookem0702', reserves: true, cashbox: false, download: true },
];

const PermissionBadge = ({ permitted }: { permitted: boolean }) => (
    <Badge variant={permitted ? 'default' : 'secondary'} className={cn(
        permitted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    )}>
        {permitted ? 'Permitido' : 'Denegado'}
    </Badge>
);

const ToggleField = ({ name, label, control, description }: { name: string, label: string, control: any, description?: string }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
        <div>
            <Label htmlFor={name} className="font-medium">{label}</Label>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Controller
            name={name}
            control={control}
            render={({ field }) => (
                <Switch
                    id={name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                />
            )}
        />
    </div>
);


export default function AuthCodesPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            requireForReservations: false,
            requireForCashbox: false,
            requireForDownloads: true,
        }
    });

    const onSubmit = (data: any) => {
        setIsSubmitting(true);
        console.log("Authorization codes settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en los códigos de autorización han sido guardados."
            })
        }, 1500);
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Códigos de autorización</h2>
            <p className="text-muted-foreground">
                Configura códigos y permisos para tu equipo.
            </p>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-5xl">
            <Card>
                <CardHeader>
                    <CardTitle>Configuración General</CardTitle>
                    <CardDescription>
                        Aquí puedes configurar los códigos para tu equipo, definiendo permisos para ingresar y modificar reservas, y para hacer uso del sistema de caja e ingresar y modificar sus componentes.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ToggleField name="requireForReservations" label="Requerir código de cajero para acciones de reservas" control={form.control} />
                    <ToggleField name="requireForCashbox" label="Requerir código de cajero para acciones de caja" control={form.control} />
                    <ToggleField name="requireForDownloads" label="Requerir código de cajero para descargar archivos y reportes" control={form.control} />
                </CardContent>
            </Card>

             <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar Cambios
                </Button>
            </div>
        </form>
        
        <Card>
            <CardHeader className="flex flex-row justify-between items-center">
                <div>
                    <CardTitle>Listado de códigos</CardTitle>
                    <CardDescription>Configura códigos y permisos para tu equipo.</CardDescription>
                </div>
                 <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4"/> Agregar Código</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Activo</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Reservas</TableHead>
                            <TableHead>Caja</TableHead>
                            <TableHead>Descarga de Archivos</TableHead>
                            <TableHead className="text-right">Opciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mockCodes.map(code => (
                            <TableRow key={code.id}>
                                <TableCell className="font-medium">{code.name}</TableCell>
                                <TableCell><Switch checked={code.active} /></TableCell>
                                <TableCell>{code.code}</TableCell>
                                <TableCell><PermissionBadge permitted={code.reserves} /></TableCell>
                                <TableCell><PermissionBadge permitted={code.cashbox} /></TableCell>
                                <TableCell><PermissionBadge permitted={code.download} /></TableCell>
                                <TableCell className="text-right">
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="outline" size="sm" className="bg-orange-400 hover:bg-orange-500 text-white border-orange-500">
                                            <Edit className="mr-2 h-4 w-4" /> Editar
                                        </Button>
                                         <Button variant="destructive" size="sm">
                                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                        </Button>
                                    </div>
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
