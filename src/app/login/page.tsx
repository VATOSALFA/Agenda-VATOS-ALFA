
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
<<<<<<< HEAD
import { useState, useEffect } from "react";
=======
import { useState } from "react";
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
import { Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/firebase-auth-context";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
<<<<<<< HEAD
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
<<<<<<< HEAD
    const router = useRouter();
    const { toast } = useToast();
    const { authInstance, user, loading: authLoading } = useAuth();

    useEffect(() => {
        if (!authLoading && user) {
            router.push('/');
        }
    }, [user, authLoading, router]);
    
=======
    const [loginAttempts, setLoginAttempts] = useState(0);
    const router = useRouter();
    const { toast } = useToast();
    const { signIn } = useAuth();

>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

<<<<<<< HEAD
        if (!authInstance) {
            setError("El servicio de autenticación no está disponible. Por favor, recarga la página.");
=======
        if (!signIn) {
             toast({
                variant: "destructive",
                title: "Error de configuración",
                description: "El servicio de autenticación no está disponible.",
            });
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
            setIsLoading(false);
            return;
        }

        try {
<<<<<<< HEAD
            await signInWithEmailAndPassword(authInstance, email, password);
            toast({ title: "¡Bienvenido!", description: "Has iniciado sesión correctamente." });
            router.push('/');
        } catch (err: any) {
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
=======
            const user = await signIn(email, password);
            if (user) {
                toast({ title: "¡Bienvenido!", description: "Has iniciado sesión correctamente." });
                router.push('/');
            } else {
                setLoginAttempts(prev => prev + 1);
                if (loginAttempts + 1 >= 3) {
                     setError("Has superado el número de intentos. Por favor, contacta a tu gerente para recuperar el acceso.");
                } else {
                     setError("El correo o la contraseña son incorrectos.");
                }
            }
        } catch (error: any) {
            console.error("Error de inicio de sesión:", error);
            setError("Ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
        } finally {
            setIsLoading(false);
        }
    };

<<<<<<< HEAD
    if (authLoading || user) {
        return (
          <div className="flex justify-center items-center h-screen bg-muted/40">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        );
    }


=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
    return (
        <div className="flex items-center justify-center h-screen bg-muted/40">
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
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Iniciar Sesión
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
