'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Eye, EyeOff, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetMessage, setResetMessage] = useState('');

    const { toast } = useToast();
    const { user, loading, signInAndSetup } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // Redirect to /agenda if user is already logged in
        if (!loading && user) {
            router.replace('/agenda');
        }
    }, [user, loading, router]);


    if (loading || user) {
        return (
            <div className="flex justify-center items-center h-screen bg-muted/40">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        if (!signInAndSetup) {
            setError("El servicio de autenticación no está disponible. Por favor, recarga la página.");
            setIsLoading(false);
            return;
        }

        try {
            await signInAndSetup(email, password, rememberMe);
            toast({ title: "¡Bienvenido!", description: "Has iniciado sesión correctamente." });
            router.push('/agenda');
        } catch (err: unknown) {
            console.error("Error de inicio de sesión:", err);
            if (err instanceof FirebaseError) {
                switch (err.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        setError("El correo o la contraseña son incorrectos.");
                        break;
                    case 'auth/too-many-requests':
                        setError("Demasiados intentos fallidos. Por favor, inténtalo más tarde.");
                        break;
                    default:
                        setError("Ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
                }
            } else {
                setError("Ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePasswordReset = async () => {
        if (!resetEmail) {
            setResetMessage('Por favor, ingresa tu correo electrónico.');
            return;
        }
        setIsResettingPassword(true);
        setResetMessage('');
        try {
            await sendPasswordResetEmail(auth, resetEmail);
            setResetMessage('Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.');
        } catch (error: any) {
            console.error("Password reset error:", error);
            if (error.code === 'auth/user-not-found') {
                setResetMessage('No se encontró ninguna cuenta con ese correo electrónico.');
            } else {
                setResetMessage('Ocurrió un error. Por favor, inténtalo de nuevo.');
            }
        } finally {
            setIsResettingPassword(false);
        }
    }
    
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-muted/40">
            <div className="flex items-center gap-3 mb-6">
                <Calendar className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold text-slate-800">VATOS ALFA</h1>
            </div>
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
                    <CardDescription>
                        Ingresa tu correo y contraseña para acceder a tu cuenta.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                         <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error de Acceso</AlertTitle>
                            <AlertDescription>
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}
                    {isResettingPassword === false && resetMessage && (
                        <Alert className="mb-4">
                             <AlertTitle>{resetMessage.includes('enviado') ? 'Correo Enviado' : 'Aviso'}</AlertTitle>
                             <AlertDescription>{resetMessage}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@email.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-0 right-0 h-full px-3"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(!!checked)} />
                                <Label htmlFor="remember-me" className="text-sm font-normal">Recordarme</Label>
                            </div>
                            <Button type="button" variant="link" className="px-0 h-auto text-sm" onClick={() => setIsResettingPassword(true)}>¿Olvidaste tu contraseña?</Button>
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Iniciar Sesión
                        </Button>
                    </form>
                </CardContent>
            </Card>
             {isResettingPassword && (
                <Card className="w-full max-w-sm mt-4">
                    <CardHeader className="text-center">
                        <CardTitle>Restablecer Contraseña</CardTitle>
                        <CardDescription>
                            Ingresa tu correo para enviarte un enlace de restablecimiento.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {resetMessage && (
                            <Alert className="mb-4" variant={resetMessage.includes('encontró') ? 'destructive' : 'default'}>
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>{resetMessage.includes('encontró') ? 'Error' : 'Aviso'}</AlertTitle>
                                <AlertDescription>{resetMessage}</AlertDescription>
                            </Alert>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="reset-email">Correo Electrónico</Label>
                            <Input
                                id="reset-email"
                                type="email"
                                placeholder="tu@email.com"
                                required
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button variant="outline" className="w-full" onClick={() => { setIsResettingPassword(false); setResetMessage(''); }}>
                                Volver a Iniciar Sesión
                            </Button>
                            <Button className="w-full" onClick={handlePasswordReset}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Enviar
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
