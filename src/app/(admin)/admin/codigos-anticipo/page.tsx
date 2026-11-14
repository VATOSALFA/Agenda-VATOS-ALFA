'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Sparkles, Copy, Check, Clock, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthCode } from '@/lib/types';
import { createOneTimeAuthCode } from '@/lib/auth-code-validator';
import { logAuditAction } from '@/lib/audit-logger';

export default function AdminCodigosAnticipoPage() {
  const { toast } = useToast();
  const { db, user, loading: authLoading } = useAuth();
  const [queryKey, setQueryKey] = useState(0);

  const [oneTimePurpose, setOneTimePurpose] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedCode, setLastGeneratedCode] = useState<{
    code: string;
    expiresAt: string;
    purpose: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: authCodes, loading } = useFirestoreQuery<AuthCode>('codigos_autorizacion', queryKey);

  // Filtramos ÚNICAMENTE los códigos temporales que estén ACTIVOS y NO QUEMADOS
  const pendingCodes = useMemo(() => {
    const now = Date.now();
    return (authCodes || [])
      .filter((c) => {
        if (!c.is_one_time || c.used || !c.active) return false;
        if (c.expires_at) {
          const expMs = Date.parse(c.expires_at);
          if (!isNaN(expMs) && expMs <= now) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [authCodes]);

  const canGenerateCodes =
    user?.role === 'Administrador general' ||
    user?.permissions?.includes('generar_codigos_anticipo');

  const handleGenerateCode = async () => {
    if (!db || isGenerating) return;
    setIsGenerating(true);
    try {
      const creatorName = user?.displayName || user?.email || 'Administración';
      const cleanPurpose =
        oneTimePurpose.trim() || 'Exención de anticipo autorizada en recepción';

      const result = await createOneTimeAuthCode({
        db,
        createdBy: creatorName,
        purpose: cleanPurpose,
        expiresInMinutes,
      });

      setLastGeneratedCode({
        code: result.code,
        expiresAt: result.expiresAt,
        purpose: cleanPurpose,
      });
      setOneTimePurpose('');
      setQueryKey((prev) => prev + 1);

      await logAuditAction({
        action: 'Generar Código de Anticipo (4 dígitos)',
        details: `Se generó el código temporal [${result.code}] para omitir anticipo, válido por ${expiresInMinutes} min. Motivo: ${cleanPurpose}`,
        userId: user?.uid || 'unknown',
        userName: creatorName,
        userRole: user?.role,
        severity: 'info',
        localId: user?.local_id || 'default',
      });

      toast({
        title: `Código listo: ${result.code}`,
        description: `Válido por ${expiresInMinutes} minutos para autorizar la cita en recepción.`,
      });
    } catch (error) {
      console.error('Error generating anticipo code:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo generar el código temporal.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = (pin: string) => {
    navigator.clipboard?.writeText(pin);
    setCopiedCode(pin);
    toast({
      title: 'Código copiado',
      description: `El PIN ${pin} se copió al portapapeles.`,
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!authLoading && user && !canGenerateCodes) {
    return (
      <div className="container mx-auto py-12 px-4 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-foreground">Acceso Restringido</h2>
        <p className="text-xs text-muted-foreground">
          No tienes permisos para generar códigos temporales de anticipo. Solicítalos a Gerencia.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 space-y-5 max-w-4xl">
      {/* Encabezado Principal */}
      <div className="pb-2.5 border-b border-border/60">
        <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">
          CÓDIGOS DE ANTICIPO (UN SOLO USO)
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Genera códigos de 4 dígitos para autorizar a Recepción omitir el cobro de anticipo en citas agendadas. Cada código se quema automáticamente tras su primer uso.
        </p>
      </div>

      {/* Tarjeta Generadora con Estilo Oficial Vatos Alfa */}
      <Card className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden">
        <CardHeader className="py-3 px-4 sm:px-5 border-b border-slate-800 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white relative">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#C5A880] shrink-0" />
              <CardTitle className="text-sm font-bold tracking-tight text-white">
                Generador de Código para Omitir Anticipo
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className="border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880] text-[10px] font-sans font-semibold py-0 px-2"
            >
              Se quema al primer uso
            </Badge>
          </div>
          <CardDescription className="relative z-10 text-xs text-slate-300 mt-0.5">
            Ingresa un motivo o nombre del cliente y genera el PIN de 4 dígitos para proporcionárselo a recepción.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <Input
              type="text"
              placeholder="Motivo de la exención (ej. Cliente frecuente, pago en sucursal, autorizado por Bety)"
              value={oneTimePurpose}
              onChange={(e) => setOneTimePurpose(e.target.value)}
              className="h-10 text-xs flex-1 rounded-xl"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerateCode();
                }
              }}
            />
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={expiresInMinutes}
                onChange={(e) => setExpiresInMinutes(Number(e.target.value) || 30)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={15}>Vigencia: 15 min</option>
                <option value={30}>Vigencia: 30 min</option>
                <option value={60}>Vigencia: 60 min</option>
              </select>

              <Button
                type="button"
                onClick={handleGenerateCode}
                disabled={isGenerating}
                variant="alfa"
                className="h-10 px-5 text-xs font-bold shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-1.5 text-white" />
                )}
                Generar Código 4 Dígitos
              </Button>
            </div>
          </div>

          {/* Banner de Código Generado */}
          {lastGeneratedCode && (
            <div className="rounded-xl border-2 border-blue-500 bg-[#0d1424] text-white p-3.5 flex items-center justify-between gap-3 flex-wrap shadow-lg">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#C5A880] shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">
                      Código Temporal Listo:
                    </span>
                    <span className="text-2xl font-bold tracking-[0.25em] text-[#C5A880] font-mono bg-white/5 px-3 py-0.5 rounded-lg border border-[#C5A880]/40">
                      {lastGeneratedCode.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {lastGeneratedCode.purpose} • Válido para 1 sola cita en recepción.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleCopyCode(lastGeneratedCode.code)}
                className="h-9 px-3.5 text-xs font-semibold border-blue-400/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                {copiedCode === lastGeneratedCode.code ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5 text-blue-300" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5 text-blue-300" />
                    Copiar PIN
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Códigos Activos en Espera de Ser Utilizados en Recepción */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader className="py-2.5 px-4 border-b border-border/50 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400 shrink-0" />
              <CardTitle className="text-xs font-semibold tracking-tight text-foreground">
                Códigos Pendientes de Uso en Recepción ({pendingCodes.length})
              </CardTitle>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Desaparecen de aquí automáticamente en cuanto recepción los utiliza
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground w-28">
                  PIN
                </TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">
                  Motivo de Exención
                </TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground hidden sm:table-cell">
                  Generado por
                </TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center w-36">
                  Vigencia
                </TableHead>
                <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground text-right w-24">
                  Copiar
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i} className="h-9">
                    <TableCell colSpan={5} className="py-2 px-3.5">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pendingCodes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center h-16 text-xs text-muted-foreground"
                  >
                    No hay códigos pendientes de uso. Genera uno nuevo arriba cuando recepción lo solicite.
                  </TableCell>
                </TableRow>
              ) : (
                pendingCodes.map((item) => (
                  <TableRow
                    key={item.id}
                    className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40"
                  >
                    <TableCell className="py-1.5 px-3.5 text-xs">
                      <span className="font-mono font-bold tracking-wider px-2 py-0.5 rounded border text-xs text-[#C5A880] border-[#C5A880]/40 bg-[#C5A880]/10">
                        {item.code}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">
                      {item.purpose || item.name}
                    </TableCell>
                    <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {item.created_by || 'Administración'}
                    </TableCell>
                    <TableCell className="py-1.5 px-3 text-center">
                      {item.expires_at ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-blue-400 font-medium">
                          <Clock className="h-3 w-3" />
                          Expira {new Date(item.expires_at).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">30 min</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(item.code)}
                        className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
                        title="Copiar PIN"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
