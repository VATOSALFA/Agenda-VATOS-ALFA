'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Scissors, User } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { CustomLoader } from '@/components/ui/custom-loader';

export default function LandingPage() {
    const { data: services, loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: professionals, loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const { data: empresa, loading: loadingEmpresa } = useFirestoreQuery<any>('empresa');

    if (loadingServices || loadingEmpresa) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <CustomLoader size={50} />
            </div>
        );
    }

    const companyName = empresa?.[0]?.name || 'Vatos Alfa';
    const companySlogan = empresa?.[0]?.slogan || 'Estilo y profesionalismo para el hombre moderno.';
    const logoUrl = empresa?.[0]?.logo_url;

    // Safe extraction of price/duration
    const formatPrice = (price: any) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(price) || 0);
    };

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground animation-fade-in">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
                        ) : (
                            <Scissors className="h-6 w-6 text-primary" />
                        )}
                        <span>{companyName}</span>
                    </div>
                    <nav className="flex gap-2">
                        <Link href="/reservar">
                            <Button>Reservar Cita</Button>
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="flex-1 flex flex-col items-center justify-center py-12 md:py-24 lg:py-32 text-center px-4 bg-muted/10 relative overflow-hidden">
                <div className="absolute inset-0 z-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none"></div>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-foreground/70 animate-in slide-in-from-bottom-5 duration-700 z-10">
                    {companySlogan}
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-[700px] mb-8 animate-in slide-in-from-bottom-5 duration-1000 delay-200 z-10">
                    Agenda tu cita en segundos sin registrarte. Selecciona tu servicio, tu barbero favorito y listo.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in duration-1000 delay-300 z-10">
                    <Link href="#servicios">
                        <Button size="lg" className="h-12 px-8 text-lg w-full sm:w-auto">
                            Ver Servicios <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Services */}
            <section id="servicios" className="py-16 md:py-24 container px-4 md:px-6">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestros Servicios</h2>
                    <p className="text-muted-foreground">Calidad y detalle en cada corte.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services?.filter((s: any) => s.active).map((service: any) => (
                        <Card key={service.id} className="hover:shadow-xl transition-all duration-300 border-muted group flex flex-col">
                            <CardHeader>
                                <CardTitle className="group-hover:text-primary transition-colors">{service.name}</CardTitle>
                                <CardDescription className="line-clamp-2">{service.description || 'Servicio profesional de barbería.'}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="flex justify-between items-baseline mt-2">
                                    <span className="text-2xl font-bold">{formatPrice(service.price)}</span>
                                    <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">{service.duration} min</span>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Link href={`/reservar?serviceId=${service.id}`} className="w-full">
                                    <Button className="w-full" size="lg">Agendar Cita</Button>
                                </Link>
                            </CardFooter>
                        </Card>
                    ))}
                    {services?.length === 0 && !loadingServices && (
                        <div className="col-span-full text-center text-muted-foreground p-10 border rounded-lg border-dashed">
                            No hay servicios disponibles en este momento.
                        </div>
                    )}
                </div>
            </section>

            {/* Professionals */}
            {professionals && professionals.length > 0 && (
                <section className="py-16 md:py-24 bg-muted/30">
                    <div className="container px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestro Equipo</h2>
                            <p className="text-muted-foreground">Expertos a tu disposición.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 justify-center">
                            {professionals.filter((p: any) => p.active).map((barber: any) => (
                                <Link href={`/reservar?professionalId=${barber.id}`} key={barber.id} className="group">
                                    <div className="flex flex-col items-center bg-card p-6 rounded-xl shadow-sm border group-hover:border-primary/50 transition-all duration-300 transform group-hover:-translate-y-1 h-full">
                                        <div className="h-24 w-24 md:h-32 md:w-32 rounded-full bg-muted flex items-center justify-center mb-4 overflow-hidden border-2 border-background shadow-md group-hover:ring-2 group-hover:ring-primary group-hover:shadow-lg transition-all relative">
                                            {barber.avatarUrl ? (
                                                <img src={barber.avatarUrl} alt={barber.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <User className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground" />
                                            )}
                                        </div>
                                        <h3 className="font-bold text-lg text-center group-hover:text-primary transition-colors">{barber.name}</h3>
                                        <p className="text-xs md:text-sm text-center text-muted-foreground hidden group-hover:block animate-in fade-in slide-in-from-top-1 mt-1 font-medium text-primary">Ver Disponibilidad</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="py-12 border-t bg-card text-center text-sm text-muted-foreground">
                <div className="container px-4">
                    <div className="flex flex-col items-center justify-center gap-4 mb-4">
                        {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 w-auto opacity-50 grayscale hover:grayscale-0 transition-all" />}
                        <p className="max-w-xs">{empresa?.[0]?.description}</p>
                    </div>
                    <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
                    <Link href="/login" className="mt-4 inline-block text-xs hover:underline opacity-50 hover:opacity-100">Acceso Staff</Link>
                </div>
            </footer>
        </div>
    );
}
