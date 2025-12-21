"use client";

import Image from "next/image";

interface CustomLoaderProps {
    className?: string;
    size?: number;
}

export function CustomLoader({ className, size = 60 }: CustomLoaderProps) {
    return (
        <div className={`flex flex-col items-center justify-center ${className}`}>
            <div className="relative animate-pulse">
                <Image
                    src="/logo-vatos-alfa.png"
                    alt="Cargando..."
                    width={size}
                    height={size}
                    className="drop-shadow-lg"
                    priority
                />
            </div>
            <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
                Cargando...
            </p>
        </div>
    );
}
