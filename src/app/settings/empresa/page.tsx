
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { useForm, Controller } from "react-hook-form";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useEffect, useState } from "react";
import { ImageUploader } from "@/components/shared/image-uploader";
import { Loader2 } from "lucide-react";

interface EmpresaSettings {
    id?: string;
    name: string;
    description: string;
    website_slug: string;
    logo_url: string;
    receipt_logo_url?: string;
}

export default function EmpresaPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { data, loading } = useFirestoreQuery<EmpresaSettings>('empresa');
    const settings = data?.[0] || { id: 'main', name: 'VATOS ALFA Barber Shop', description: '', website_slug: 'vatosalfa--agenda-1ae08.us-central1.hosted.app', logo_url: ''};
    
    const form = useForm<EmpresaSettings>({
        defaultValues: settings
    });
    
    useEffect(() => {
        if (!loading && data.length > 0) {
            form.reset(data[0]);
        }
    }, [data, loading, form]);

    const websiteUrl = `https://${form.watch('website_slug') || 'vatosalfa--agenda-1ae08.us-central1.hosted.app'}`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(websiteUrl);
        toast({
          title: '¡Copiado!',
          description: 'El enlace a tu sitio web ha sido copiado al portapapeles.',
        });
    }

    const onSubmit = async (formData: EmpresaSettings) => {
        if (!db) {
             toast({
                variant: "destructive",
                title: "Error de base de datos",
                description: "No se pudo conectar con la base de datos.",
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const settingsRef = doc(db, 'empresa', settings.id);
            await setDoc(settingsRef, formData, { merge: true });
            toast({
                title: '¡Guardado!',
                description: 'La información de la empresa ha sido actualizada.',
            });
        } catch (error) {
            console.error("Error updating company settings:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo guardar la configuración. Inténtalo de nuevo.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Empresa</h2>
        <p className="text-muted-foreground">
          Configura el nombre de tu empresa, descripción y dirección de tu sitio web de agendamiento.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Nombre de tu empresa</CardTitle>
            <CardDescription>
              El nombre que aparecerá en todos los lugares de Agenda VATOS ALFA, incluido tu sitio web.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input {...form.register('name')} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Descripción</CardTitle>
            <CardDescription>
              Cuéntale a tus clientes sobre tu empresa, sobre los servicios que ofreces o tu propuesta de valor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea 
                rows={6}
                {...form.register('description')}
            />
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Logo de la empresa</CardTitle>
                <CardDescription>Este logo aparecerá en la parte superior de los recibos y comprobantes.</CardDescription>
            </CardHeader>
            <CardContent>
               <Controller
                  name="receipt_logo_url"
                  control={form.control}
                  render={({ field }) => (
                      <ImageUploader
                          folder="receipt_logos"
                          currentImageUrl={field.value}
                          onUpload={(url) => field.onChange(url)}
                          onRemove={() => field.onChange('')}
                      />
                  )}
               />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Dirección de tu sitio web de agendamiento</CardTitle>
                <CardDescription>
                    Destaca tu marca personalizando la dirección de tu sitio web. Una dirección única también mejora la visibilidad de tu sitio en Google.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="flex items-center space-x-2">
                    <Input {...form.register('website_slug')} />
                    <Button type="button" variant="outline" onClick={copyToClipboard}><Copy className="mr-2 h-4 w-4" /> Copia tu link</Button>
                </div>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Personalización</CardTitle>
                <CardDescription>
                Configura los colores de tu sitio web, LinkPro y de los emails que recibirán tus clientes.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground text-center py-6">Opciones de personalización de color estarán disponibles aquí.</p>
            </CardContent>
        </Card>

        <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Guardar Cambios
            </Button>
        </div>
      </form>
    </div>
  );
}
