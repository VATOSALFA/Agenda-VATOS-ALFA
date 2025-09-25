
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Facebook, Instagram, Globe } from "lucide-react";
import Image from "next/image";

const CodeBlock = ({ code }: { code: string }) => {
    const { toast } = useToast();
    const copyToClipboard = () => {
        navigator.clipboard.writeText(code);
        toast({
            title: '¡Copiado!',
            description: 'El código ha sido copiado al portapapeles.',
        });
    }

    return (
        <div className="bg-muted/50 rounded-lg p-4 relative">
            <pre className="text-sm whitespace-pre-wrap font-mono">
                <code>{code}</code>
            </pre>
            <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={copyToClipboard}
            >
                <Copy className="h-4 w-4" />
            </Button>
        </div>
    );
};

export default function IntegrationsPage() {

    const iframeCode = `<iframe src="https://vatosalfa--agenda-1ae08.us-central1.hosted.app" style="width: 100%; height: 800px; border: none;"></iframe>`;
    const bannerCode = `<a href="https://vatosalfa--agenda-1ae08.us-central1.hosted.app" target="_blank">\n  <img src="https://agendapro.com/assets/img/boton.png" alt="Reserva tu cita" />\n</a>`;

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Integraciones</h2>
                <p className="text-muted-foreground">
                    Conecta Agenda VATOS ALFA con tus redes sociales y sitio web para aumentar tus reservas.
                </p>
            </div>

            <div className="space-y-8 max-w-5xl">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Facebook className="h-6 w-6 text-blue-600" /> Facebook</CardTitle>
                        <CardDescription>
                            Agrega el botón "Reservar" en la página de Facebook de tu negocio.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Image src="https://placehold.co/600x400.png" data-ai-hint="social media interface" alt="Paso 1" width={600} height={400} className="rounded-lg border" />
                                <p><span className="font-bold">1.</span> En tu página de Facebook, haz click en "+ Agregar un botón".</p>
                            </div>
                            <div className="space-y-2">
                                <Image src="https://placehold.co/600x400.png" data-ai-hint="user interface menu" alt="Paso 2" width={600} height={400} className="rounded-lg border" />
                                <p><span className="font-bold">2.</span> Selecciona la opción "Reservar".</p>
                            </div>
                            <div className="space-y-2">
                                <Image src="https://placehold.co/600x400.png" data-ai-hint="website link form" alt="Paso 3" width={600} height={400} className="rounded-lg border" />
                                <p><span className="font-bold">3.</span> Pega el link de tu sitio web de Agenda VATOS ALFA y ¡listo!</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Instagram className="h-6 w-6 text-pink-500" /> Instagram</CardTitle>
                        <CardDescription>
                            Añade tu link de agendamiento en el perfil de Instagram de tu negocio.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <div className="flex justify-center"><Image src="https://placehold.co/250x500.png" data-ai-hint="mobile phone screen" alt="Paso 1" width={250} height={500} className="rounded-lg border" /></div>
                                <p className="text-center"><span className="font-bold">1.</span> Ve a "Editar perfil" en tu cuenta de Instagram.</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-center"><Image src="https://placehold.co/250x500.png" data-ai-hint="social media profile" alt="Paso 2" width={250} height={500} className="rounded-lg border" /></div>
                                <p className="text-center"><span className="font-bold">2.</span> Agrega el link de tu sitio web de Agenda VATOS ALFA en el campo "Sitio web".</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-center"><Image src="https://placehold.co/250x500.png" data-ai-hint="user profile social" alt="Paso 3" width={250} height={500} className="rounded-lg border" /></div>
                                <p className="text-center"><span className="font-bold">3.</span> ¡Listo! El link aparecerá en tu perfil.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Globe className="h-6 w-6" /> Sitio web</CardTitle>
                        <CardDescription>
                            Para insertar Agenda VATOS ALFA en tu sitio web, copia y pega el siguiente código en el HTML.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CodeBlock code={iframeCode} />
                        <ul className="list-disc pl-5 mt-4 text-sm text-muted-foreground space-y-1">
                            <li>Recomendamos que el ancho (width) sea del 100% y que la altura (height) sea de al menos 800px.</li>
                            <li>Si tienes dudas, contacta a tu desarrollador web.</li>
                        </ul>
                    </CardContent>
                </Card>
                
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Globe className="h-6 w-6" /> Banner sitio web</CardTitle>
                        <CardDescription>
                            Si prefieres agregar un botón o imagen que dirija a tu sitio web de agendamiento, puedes usar el siguiente código.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CodeBlock code={bannerCode} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
