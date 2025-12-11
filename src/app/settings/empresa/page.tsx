
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
import { ColorPicker } from '@/components/settings/empresa/color-picker';
import { useTheme } from "@/components/layout/theme-provider";

interface EmpresaSettings {
    id?: string;
    name: string;
    description: string;
    website_slug: string;
    logo_url: string;
    receipt_logo_url?: string;
    theme?: {
        primaryColor?: string;
        secondaryColor?: string;
        accentColor?: string;
        backgroundColor?: string;
        foreground?: string;
        cardColor?: string;
    }
}

export default function EmpresaPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { setThemeColors } = useTheme();
    
    const { data, loading } = useFirestoreQuery<EmpresaSettings>('empresa');
    const settings = data?.[0] || { id: 'main', name: 'VATOS ALFA Barber Shop', description: '', website_slug: 'vatosalfa--agenda-1ae08.us-central1.hosted.app', logo_url: ''};
    
    const form = useForm<EmpresaSettings>({
        defaultValues: settings
    });

    const [primaryColor, setPrimaryColor] = useState('#202A49');
    const [secondaryColor, setSecondaryColor] = useState('#314177');
    const [accentColor, setAccentColor] = useState('#F59E0B');
    const [backgroundColor, setBackgroundColor] = useState('#F8F9FC');
    const [foregroundColor, setForegroundColor] = useState('#000000');
    const [cardColor, setCardColor] = useState('#FFFFFF');

    useEffect(() => {
        if (!loading && data.length > 0) {
            const currentSettings = data[0];
            form.reset(currentSettings);
            if (currentSettings.theme) {
                setPrimaryColor(currentSettings.theme.primaryColor || '#202A49');
                setSecondaryColor(currentSettings.theme.secondaryColor || '#314177');
                setAccentColor(currentSettings.theme.accentColor || '#F59E0B');
                setBackgroundColor(currentSettings.theme.backgroundColor || '#F8F9FC');
                setForegroundColor(currentSettings.theme.foreground || '#000000');
                setCardColor(currentSettings.theme.cardColor || '#FFFFFF');
            }
        }
    }, [data, loading, form]);
    
    useEffect(() => {
        setThemeColors({
          primaryColor,
          secondaryColor,
          accentColor,
          backgroundColor,
          foreground: foregroundColor,
          cardColor
        });
    }, [primaryColor, secondaryColor, accentColor, backgroundColor, foregroundColor, cardColor, setThemeColors]);


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
        if (!settings.id) {
            toast({
                variant: "destructive",
                title: "Error de configuración",
                description: "No se encontró el ID de la configuración de la empresa.",
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const dataToSave: EmpresaSettings = {
                ...formData,
                theme: {
                    primaryColor,
                    secondaryColor,
                    accentColor,
                    backgroundColor,
                    foreground: foregroundColor,
                    cardColor,
                }
            };

            const settingsRef = doc(db, 'empresa', settings.id);
            await setDoc(settingsRef, dataToSave, { merge: true });
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
    <div className="flex-1 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Empresa</h2>
        <p className="text-muted-foreground">
          Configura el nombre de tu empresa, descripción y dirección de tu sitio web de agendamiento.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ColorPicker 
                        label="Color Primario"
                        color={primaryColor}
                        onChange={setPrimaryColor}
                    />
                    <ColorPicker 
                        label="Color Secundario"
                        color={secondaryColor}
                        onChange={setSecondaryColor}
                    />
                     <ColorPicker 
                        label="Color de Acento"
                        color={accentColor}
                        onChange={setAccentColor}
                    />
                     <ColorPicker 
                        label="Color de Fondo"
                        color={backgroundColor}
                        onChange={setBackgroundColor}
                    />
                     <ColorPicker 
                        label="Color de Texto"
                        color={foregroundColor}
                        onChange={setForegroundColor}
                    />
                    <ColorPicker 
                        label="Color de Tarjetas"
                        color={cardColor}
                        onChange={setCardColor}
                    />
                </div>
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
