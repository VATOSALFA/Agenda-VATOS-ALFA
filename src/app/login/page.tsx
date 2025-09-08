
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/firebase-auth-context";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { toast } = useToast();
    
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await signInWithEmailAndPassword(auth, email, password);
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
        } finally {
            setIsLoading(false);
        }
    };

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
