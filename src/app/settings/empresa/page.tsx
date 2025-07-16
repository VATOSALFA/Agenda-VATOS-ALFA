
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, UploadCloud } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";

export default function EmpresaPage() {
    const { toast } = useToast();

    const websiteUrl = 'vatosalfabarbershop.site.agendapro.com/mx';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(websiteUrl);
        toast({
          title: '¡Copiado!',
          description: 'El enlace a tu sitio web ha sido copiado al portapapeles.',
        });
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Empresa</h2>
        <p className="text-muted-foreground">
          Configura el nombre de tu empresa, descripción y dirección de tu sitio web de agendamiento.
        </p>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Nombre de tu empresa</CardTitle>
            <CardDescription>
              El nombre que aparecerá en todos los lugares de AgendaPro, incluido tu sitio web.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input defaultValue="VATOS ALFA Barber Shop" />
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
                defaultValue="Bienvenidos a VATOS ALFA Barber Shop, un espacio diseñado para los caballeros que buscan estilo, cuidado y relajación en un solo lugar. En VATOS ALFA ofrecemos una experiencia de barbería única, donde combinamos técnicas clásicas con tendencias modernas para resaltar lo mejor de tu imagen personal. Nuestro equipo de barberos altamente capacitados está listo para brindarte un servicio excepcional, asegurando calidad, estilo y satisfacción en cada visita." 
            />
          </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Tu logo</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-8">
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg">
                    <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">Arrastra o selecciona el archivo</p>
                    <Button variant="outline">Subir archivo</Button>
                </div>
                <div className="flex flex-col items-center justify-center p-8 border rounded-lg">
                    <p className="font-semibold mb-4 text-muted-foreground">Previsualización</p>
                    <div className="relative h-24 w-40">
                         <svg viewBox="0 0 165 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
                            <path d="M52.331 43.14L41.363 19.98H45.203L53.747 38.388L53.915 38.388L62.543 19.98H66.215L55.331 43.14H52.331Z" fill="#202A49"/>
                            <path d="M68.6146 43.14V19.98H72.0386V36.3H79.8746V38.868H72.0386V40.452C72.0386 41.508 72.4106 42.06 73.1546 42.06C73.8986 42.06 74.4506 41.676 74.8226 41.208L76.6106 43.14C75.8666 43.8 74.8226 44.22 73.5266 44.22C71.5946 44.22 70.1826 43.224 69.4386 41.292L68.6146 43.14Z" fill="#202A49"/>
                            <path d="M96.0691 40.536L92.2291 33.48L95.5351 27.684L91.6111 19.98H87.1951L90.7591 29.832L84.8431 40.092L82.1311 35.076L85.6111 27.852L81.7711 19.98H77.2711L82.8991 32.556L88.9831 43.14H92.5471L96.0691 40.536Z" fill="#202A49"/>
                            <path d="M106.634 36.3H98.798V43.14H95.374V19.98H106.378C108.682 19.98 110.136 20.892 110.136 22.824C110.136 24.324 109.392 25.236 108.054 25.746V25.914C109.842 26.298 110.976 27.294 110.976 29.1C110.976 31.404 109.11 32.58 106.378 32.58H98.798V28.908H105.742C107.154 28.908 107.898 28.224 107.898 27.312C107.898 26.316 107.026 25.632 105.574 25.632H98.798V23.328H105.406C106.744 23.328 107.446 22.776 107.446 22.032C107.446 21.246 106.786 20.736 105.532 20.736H98.798V36.3H106.634Z" fill="#202A49"/>
                            <path d="M116.324 23.286C115.856 21.354 114.356 19.98 112.01 19.98C109.382 19.98 107.408 22.11 107.408 25.374V37.764C107.408 41.028 109.382 43.14 112.01 43.14C114.356 43.14 115.856 41.778 116.324 39.846H112.984C112.654 40.572 112.144 40.914 111.484 40.914C110.452 40.914 109.842 40.128 109.842 38.346V24.768C109.842 22.986 110.452 22.2 111.484 22.2C112.144 22.2 112.654 22.542 112.984 23.286H116.324Z" fill="#202A49"/>
                            <path d="M129.544 19.98L124.96 32.424L120.376 19.98H116.14L123.514 36.936V43.14H126.778V36.936L134.152 19.98H129.544Z" fill="#202A49"/>
                            <path d="M136.913 43.14V19.98H140.337V36.3H148.173V38.868H140.337V40.452C140.337 41.508 140.709 42.06 141.453 42.06C142.197 42.06 142.749 41.676 143.121 41.208L144.909 43.14C144.165 43.8 143.121 44.22 141.825 44.22C139.893 44.22 138.481 43.224 137.737 41.292L136.913 43.14Z" fill="#202A49"/>
                            <path d="M149.771 43.14V19.98H152.939V43.14H149.771Z" fill="#202A49"/>
                            <path d="M8.28859 19.344C8.28859 16.596 9.42259 14.58 11.6426 14.58C13.8626 14.58 15.0386 16.596 15.0386 19.344C15.0386 22.092 13.8626 24.108 11.6426 24.108C9.42259 24.108 8.28859 22.092 8.28859 19.344ZM30.4886 19.344C30.4886 16.596 31.6226 14.58 33.8426 14.58C36.0626 14.58 37.2386 16.596 37.2386 19.344C37.2386 22.092 36.0626 24.108 33.8426 24.108C31.6226 24.108 30.4886 22.092 30.4886 19.344ZM11.6846 43.14L18.4286 27.6C17.5586 26.856 16.9466 26.244 16.4366 25.548C16.4366 25.548 16.2686 25.338 16.1426 25.146L15.9326 24.87C16.1006 24.786 16.2686 24.702 16.4366 24.618L21.7586 43.14H18.5906L15.2426 33.816L11.8946 43.14H8.72659L1.98259 27.6C2.85259 26.856 3.46459 26.244 3.97459 25.548C3.97459 25.548 4.14259 25.338 4.26859 25.146L4.47859 24.87C4.31059 24.786 4.14259 24.702 3.97459 24.618L-1.34741 43.14H-4.51541L5.56859 19.98H8.77859L11.6846 25.83L14.5906 19.98H17.8006L27.8846 43.14H24.7166L21.3686 33.816L18.0206 43.14H14.8526L11.6846 43.14Z" fill="#202A49"/>
                            <rect x="0.5" y="49.5" width="44" height="1" fill="#202A49"/>
                            <rect x="156.5" y="49.5" width="44" height="1" fill="#202A49"/>
                            <path d="M49 50L53.5 45.5" stroke="#202A49"/>
                            <path d="M152 50L147.5 45.5" stroke="#202A49"/>
                            <path d="M49 50L53.5 54.5" stroke="#202A49"/>
                            <path d="M152 50L147.5 54.5" stroke="#202A49"/>
                            <foreignObject x="58" y="46" width="85" height="15">
                                <p style={{fontSize: '6px', color: '#202A49', textAlign: 'center', fontWeight: 'bold'}}>BARBER SHOP</p>
                            </foreignObject>
                        </svg>
                    </div>
                </div>
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
                    <Input defaultValue="vatosalfabarbershop" />
                    <div className="flex-shrink-0 px-3 py-2 text-sm text-muted-foreground bg-muted border rounded-r-md">
                        .site.agendapro.com/mx
                    </div>
                    <Button variant="outline" onClick={copyToClipboard}><Copy className="mr-2 h-4 w-4" /> Copia tu link</Button>
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

      </div>
    </div>
  );
}
