
'use client';

import { ReactNode, useState, useEffect } from "react";
import { FirebaseProvider } from "./provider";
import { AuthProvider } from "@/contexts/firebase-auth-context";

// This component ensures that Firebase is only initialized on the client side.
export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null; // Or a loading spinner
    }

    return (
        <FirebaseProvider>
            <AuthProvider>
                {children}
            </AuthProvider>
        </FirebaseProvider>
    );
}
