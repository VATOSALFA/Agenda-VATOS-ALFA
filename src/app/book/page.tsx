
'use client';

import { useMemo, useState } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Service, ServiceCategory } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { where } from 'firebase/firestore';


export default function BookPage() {
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', where('active', '==', true));
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
    const [selectedServices, setSelectedServices] = useState<Service[]>([]);
    const router = useRouter();

    const servicesByCategory = useMemo(() => {
        if (categoriesLoading || servicesLoading) return [];

        const sortedCategories = [...categories].sort((a,b) => a.order - b.order);
        const sortedServices = [...services].sort((a,b) => a.order - b.order);

        return sortedCategories.map(category => ({
          ...category,
          services: sortedServices.filter(service => service.category === category.id && service.active)
        })).filter(category => category.services.length > 0);
    }, [categories, services, categoriesLoading, servicesLoading]);

    const handleServiceToggle = (service: Service) => {
        setSelectedServices(prev => 
            prev.some(s => s.id === service.id)
                ? prev.filter(s => s.id !== service.id)
                : [...prev, service]
        );
    }
    
    const totalDuration = useMemo(() => selectedServices.reduce((acc, s) => acc + s.duration, 0), [selectedServices]);
    const totalPrice = useMemo(() => selectedServices.reduce((acc, s) => acc + s.price, 0), [selectedServices]);

    const isLoading = servicesLoading || categoriesLoading;

    const handleNextStep = () => {
        const serviceIds = selectedServices.map(s => s.id).join(',');
        router.push(`/book/schedule?services=${serviceIds}`);
    }

    return (
        <div className="bg-muted/40 min-h-screen py-12">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Selecciona tus servicios</CardTitle>
                                <CardDescription>Elige uno o más servicios para continuar.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <div className="space-y-4">
                                        <Skeleton className="h-8 w-1/4" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-8 w-1/4 mt-4" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {servicesByCategory.map(categoryGroup => (
                                            <div key={categoryGroup.id}>
                                                <h3 className="text-lg font-semibold mb-2">{categoryGroup.name}</h3>
                                                <div className="space-y-2">
                                                    {categoryGroup.services.map(service => (
                                                        <div 
                                                            key={service.id} 
                                                            className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer"
                                                            onClick={() => handleServiceToggle(service)}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <Checkbox 
                                                                    id={service.id} 
                                                                    checked={selectedServices.some(s => s.id === service.id)}
                                                                    onCheckedChange={() => handleServiceToggle(service)}
                                                                />
                                                                <div>
                                                                    <Label htmlFor={service.id} className="font-medium cursor-pointer">{service.name}</Label>
                                                                    <p className="text-sm text-muted-foreground">{service.duration} min</p>
                                                                </div>
                                                            </div>
                                                            <p className="font-semibold text-primary">${service.price.toLocaleString('es-CL')}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    <div className="lg:col-span-1 sticky top-24">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Tu Cita</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {selectedServices.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">Selecciona un servicio para comenzar.</p>
                                ) : (
                                    <div className="space-y-4">
                                        <ScrollArea className="h-48 pr-4">
                                            <div className="space-y-2">
                                            {selectedServices.map(service => (
                                                <div key={service.id} className="flex justify-between items-center text-sm">
                                                    <span>{service.name}</span>
                                                    <span className="font-medium">${service.price.toLocaleString('es-CL')}</span>
                                                </div>
                                            ))}
                                            </div>
                                        </ScrollArea>
                                        <div className="border-t pt-4 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Duración total</span>
                                                <span className="font-medium">{totalDuration} min</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-lg">
                                                <span>Total</span>
                                                <span>${totalPrice.toLocaleString('es-CL')}</span>
                                            </div>
                                        </div>
                                        <Button className="w-full" size="lg" disabled={selectedServices.length === 0} onClick={handleNextStep}>
                                            Elegir Fecha y Hora <ArrowRight className="ml-2 h-4 w-4"/>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
