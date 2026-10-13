'use client';

import { useAuth } from '@/contexts/firebase-auth-context';
import { useFeatures } from '@/hooks/use-features';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, TrendingUp, Calendar, Target, DollarSign, Star, Award, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, format } from 'date-fns';
import { Sale } from '@/lib/types';
import { where, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
    const { user } = useAuth();
    const { enableBarberDashboard } = useFeatures();

    // Query Sales for the current month
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        `dashboard-sales-${format(start, 'yyyy-MM')}`,
        where('fecha_hora_venta', '>=', Timestamp.fromDate(start)),
        where('fecha_hora_venta', '<=', Timestamp.fromDate(end))
    );
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<any>('profesionales');
    const { data: empresaData } = useFirestoreQuery<any>('empresa');
    const { toast } = useToast();

    const dashboardData = useMemo(() => {
        if (!sales || !user) return null;

        const currentMonthSales = sales.filter(s => {
            const date = s.fecha_hora_venta?.toDate ? s.fecha_hora_venta.toDate() : new Date(s.fecha_hora_venta);
            return isWithinInterval(date, { start, end });
        });

        const todaySales = currentMonthSales.filter(s => {
            const date = s.fecha_hora_venta?.toDate ? s.fecha_hora_venta.toDate() : new Date(s.fecha_hora_venta);
            return isWithinInterval(date, { start: startOfDay(new Date()), end: endOfDay(new Date()) });
        });

        // Personal Stats
        // Find professional ID linked to user
        const myProfessionalId = professionals?.find((p: any) => p.userId === user.uid)?.id || user.uid;

        // If user is admin, show global stats or personal if they have a professional profile?
        // Let's focus on "My Stats".

        let mySales = [];
        let myTotal = 0;
        let myTodayTotal = 0;
        let myRanking = 0;

        // Group sales by professional to build ranking
        const salesByProf: Record<string, number> = {};

        currentMonthSales.forEach(sale => {
            sale.items?.forEach(item => {
                const profId = item.barbero_id;
                const amount = (item.precio || 0) * (item.cantidad || 1);
                salesByProf[profId] = (salesByProf[profId] || 0) + amount;

                if (profId === myProfessionalId) {
                    myTotal += amount;
                    // check if today
                    const date = sale.fecha_hora_venta?.toDate ? sale.fecha_hora_venta.toDate() : new Date(sale.fecha_hora_venta);
                    if (isWithinInterval(date, { start: startOfDay(new Date()), end: endOfDay(new Date()) })) {
                        myTodayTotal += amount;
                    }
                }
            });
        });

        // Ranking
        const rankedProfs = Object.entries(salesByProf)
            .sort(([, a], [, b]) => b - a)
            .map(([id, total], index) => ({ id, total, rank: index + 1 }));

        const myRankEntry = rankedProfs.find(p => p.id === myProfessionalId);
        myRanking = myRankEntry ? myRankEntry.rank : (rankedProfs.length + 1);

        // Gamification: Levels
        // Level 1: 0-10k, Level 2: 10k-25k, Level 3: 25k-50k, Level 4: 50k+
        let level = 1;
        let levelName = 'Novato';
        let progressToNext = 0;
        let nextLevelTarget = 10000;

        if (myTotal >= 50000) { level = 4; levelName = 'Leyenda'; nextLevelTarget = 100000; progressToNext = 100; }
        else if (myTotal >= 25000) { level = 3; levelName = 'Maestro'; nextLevelTarget = 50000; progressToNext = ((myTotal - 25000) / 25000) * 100; }
        else if (myTotal >= 10000) { level = 2; levelName = 'Profesional'; nextLevelTarget = 25000; progressToNext = ((myTotal - 10000) / 15000) * 100; }
        else { progressToNext = (myTotal / 10000) * 100; }

        return {
            myProfessionalId,
            myTotal,
            myTodayTotal,
            myRanking,
            rankedProfs,
            level,
            levelName,
            progressToNext,
            nextLevelTarget
        };

    }, [sales, user, professionals]);

    if (!enableBarberDashboard) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                <div className="bg-muted p-4 rounded-full mb-4">
                    <Trophy className="h-10 w-10 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Panel de Rendimiento</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                    Esta funcionalidad está desactivada actualmente. Contacta al administrador para habilitar el Dashboard de gamificación.
                </p>
            </div>
        );
    }

    if (salesLoading || professionalsLoading) {
        return <div className="p-8 space-y-4">
            <Skeleton className="h-12 w-[250px]" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
            </div>
            <Skeleton className="h-[400px] w-full" />
        </div>;
    }

    return (
        <div className="flex-1 space-y-6 p-8 pb-20 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Hola, {user?.displayName?.split(' ')[0] || 'Barbero'} 👋</h2>
                    <p className="text-muted-foreground">Aquí está tu rendimiento de este mes.</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center space-x-2 bg-muted/30 border border-border/60 px-3 py-1.5 rounded-xl">
                        <Trophy className="h-4 w-4 text-[#C5A880]" />
                        <span className="font-bold text-xs sm:text-sm text-foreground">Nivel {dashboardData?.level}: {dashboardData?.levelName}</span>
                    </div>
                    {dashboardData?.myProfessionalId && (
                        <button 
                            onClick={() => {
                                const displayUrl = empresaData?.[0]?.website_slug || window.location.origin;
                                const baseUrl = displayUrl.endsWith('/') ? displayUrl.slice(0, -1) : displayUrl;
                                const link = `${baseUrl}/reservar?professionalId=${user?.uid}`;
                                navigator.clipboard.writeText(link);
                                toast({ title: "Link copiado", description: "Tu enlace personal ha sido copiado al portapapeles." });
                            }}
                            className="flex items-center text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                        >
                            <Share2 className="w-3.5 h-3.5 mr-1" /> Copiar mi enlace de citas
                        </button>
                    )}
                </div>
            </div>

            {/* Gamification Banner */}
            <Card className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white border border-slate-800 shadow-xl rounded-2xl">
                <div className="header-light-beam absolute inset-0 pointer-events-none" />
                <CardContent className="p-5 sm:p-6 relative z-10">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="space-y-1.5 text-center md:text-left">
                            <h3 className="text-xl sm:text-2xl font-bold flex items-center gap-2 justify-center md:justify-start">
                                <Award className="h-6 w-6 text-[#C5A880] shrink-0" />
                                <span>{dashboardData?.levelName}</span>
                            </h3>
                            <p className="text-slate-300 text-xs sm:text-sm">
                                Has generado <b className="text-white">${(dashboardData?.myTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> este mes.
                                {dashboardData && dashboardData.level < 4 && ` ¡Faltan $${((dashboardData.nextLevelTarget || 0) - (dashboardData.myTotal || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para el siguiente nivel!`}
                            </p>
                        </div>
                        <div className="w-full md:w-1/3 space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold text-slate-300">
                                <span>Progreso Nivel {(dashboardData?.level || 0) + 1}</span>
                                <span className="text-[#C5A880] font-bold">{Math.round(dashboardData?.progressToNext || 0)}%</span>
                            </div>
                            <Progress value={dashboardData?.progressToNext} className="h-2.5 bg-black/40 [&>div]:bg-[#C5A880]" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-3.5 sm:gap-4 grid-cols-2 lg:grid-cols-4">
                <Card className="border border-border/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium">Ventas Hoy</CardTitle>
                        <DollarSign className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg sm:text-2xl font-bold text-foreground">
                            ${(dashboardData?.myTodayTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">+0% desde ayer (Simulado)</p>
                    </CardContent>
                </Card>
                <Card className="border border-border/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium">Ventas Mensuales</CardTitle>
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg sm:text-2xl font-bold text-foreground">
                            ${(dashboardData?.myTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">Progreso mensual</p>
                    </CardContent>
                </Card>
                <Card className="border border-border/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium">Ranking Global</CardTitle>
                        <Trophy className="h-4 w-4 text-[#C5A880]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg sm:text-2xl font-bold text-foreground">#{dashboardData?.myRanking}</div>
                        <p className="text-[11px] text-muted-foreground">de {professionals?.length || 0} barberos</p>
                    </CardContent>
                </Card>
                <Card className="border border-border/60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs sm:text-sm font-medium">Meta Mensual</CardTitle>
                        <Target className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg sm:text-2xl font-bold text-foreground">
                            ${(dashboardData?.nextLevelTarget || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <Progress value={dashboardData?.progressToNext} className="h-2 mt-2 [&>div]:bg-blue-500" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Top Barberos del Mes</CardTitle>
                        <CardDescription>
                            Ranking basado en ventas totales de este mes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            {dashboardData?.rankedProfs.slice(0, 5).map((prof: any, i: number) => {
                                const professional = professionals?.find((p: any) => p.id === prof.id);
                                return (
                                    <div className="flex items-center" key={prof.id}>
                                        <div className={cn(
                                            "font-bold text-base w-8 shrink-0",
                                            i === 0 ? "text-[#C5A880]" : i === 1 ? "text-slate-300" : "text-muted-foreground"
                                        )}>
                                            #{i + 1}
                                        </div>
                                        <Avatar className="h-9 w-9 shrink-0 border border-border/60">
                                            <AvatarImage src={professional?.avatarUrl} alt="Avatar" />
                                            <AvatarFallback className="bg-[#202A49] text-white text-xs">{professional?.name?.substring(0, 2)}</AvatarFallback>
                                        </Avatar>
                                        <div className="ml-3.5 space-y-0.5 min-w-0 flex-1">
                                            <p className="text-xs sm:text-sm font-semibold leading-tight text-foreground truncate">{professional?.name || 'Desconocido'}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                                {professional?.email}
                                            </p>
                                        </div>
                                        <div className="ml-auto font-semibold text-xs sm:text-sm text-foreground shrink-0 pl-2">
                                            ${(prof.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Próximas Citas</CardTitle>
                        <CardDescription>
                            Tu agenda para hoy.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-neutral-500 text-center py-8">
                            Funcionalidad en desarrollo...
                            <br />
                            <a href="/agenda" className="text-primary underline mt-2 block">Ver Agenda Completa</a>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
