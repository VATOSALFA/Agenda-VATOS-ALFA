'use client';

import { useAuth } from '@/contexts/firebase-auth-context';
import { useFeatures } from '@/hooks/use-features';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, TrendingUp, Calendar, Target, DollarSign, Star, Award } from 'lucide-react';
import { useMemo } from 'react';
import { startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Sale } from '@/lib/types';
import { where } from 'firebase/firestore';

export default function DashboardPage() {
    const { user } = useAuth();
    const { enableBarberDashboard } = useFeatures();

    // Query Sales for the current month
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());

    // We fetch all sales for the month to calculate ranking and personal stats
    // Optimization: In a real app, we might need a dedicated aggregated collection or Cloud Function.
    // For now, client-side filtering of recent sales is acceptable if volume isn't huge.
    // Better: Query by date range if possible, but Firestore constraints might apply.
    // Let's just fetch 'ventas' and filter in memory for prototype.
    // Actually, fetching ALL sales is bad. Let's try to limit if possible, or accept the cost for now.
    // Given the constraints and previous files viewing, let's stick to simple query if possible.
    // However, without a composite index on date, we might struggle.
    // Let's assume we can fetch 'ventas'.
    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<any>('profesionales');

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
        const myProfessionalId = professionals?.find((p: any) => p.userId === user.uid)?.id;

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
                <div className="flex items-center space-x-2 bg-secondary/50 p-2 rounded-lg">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    <span className="font-bold text-sm">Nivel {dashboardData?.level}: {dashboardData?.levelName}</span>
                </div>
            </div>

            {/* Gamification Banner */}
            <Card className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-0 shadow-lg">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="space-y-2 text-center md:text-left">
                            <h3 className="text-2xl font-bold flex items-center gap-2 justify-center md:justify-start">
                                <Award className="h-6 w-6 text-yellow-300" />
                                {dashboardData?.levelName}
                            </h3>
                            <p className="text-indigo-100">
                                Has generado <b>${dashboardData?.myTotal.toLocaleString()}</b> este mes.
                                {dashboardData && dashboardData.level < 4 && ` ¡Faltan $${(dashboardData.nextLevelTarget - dashboardData.myTotal).toLocaleString()} para el siguiente nivel!`}
                            </p>
                        </div>
                        <div className="w-full md:w-1/3 space-y-1">
                            <div className="flex justify-between text-xs font-medium text-indigo-200">
                                <span>Progreso Nivel {(dashboardData?.level || 0) + 1}</span>
                                <span>{Math.round(dashboardData?.progressToNext || 0)}%</span>
                            </div>
                            <Progress value={dashboardData?.progressToNext} className="h-3 bg-black/20" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ventas Hoy</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${dashboardData?.myTodayTotal.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">+0% desde ayer (Simulado)</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ventas Mensuales</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${dashboardData?.myTotal.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Progreso mensual</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ranking Global</CardTitle>
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">#{dashboardData?.myRanking}</div>
                        <p className="text-xs text-muted-foreground">de {professionals?.length || 0} barberos</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Meta Mensual</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${dashboardData?.nextLevelTarget.toLocaleString()}</div>
                        <Progress value={dashboardData?.progressToNext} className="h-2 mt-2" />
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
                                        <div className="font-bold text-lg w-8 text-muted-foreground">#{i + 1}</div>
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={professional?.avatarUrl} alt="Avatar" />
                                            <AvatarFallback>{professional?.name?.substring(0, 2)}</AvatarFallback>
                                        </Avatar>
                                        <div className="ml-4 space-y-1">
                                            <p className="text-sm font-medium leading-none">{professional?.name || 'Desconocido'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {professional?.email}
                                            </p>
                                        </div>
                                        <div className="ml-auto font-medium">
                                            ${prof.total.toLocaleString()}
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
