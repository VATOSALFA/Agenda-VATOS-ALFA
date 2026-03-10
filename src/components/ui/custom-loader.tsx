"use client";

import Image from "next/image";

interface CustomLoaderProps {
    className?: string;
    size?: number;
}

export function CustomLoader({ className, size = 60 }: CustomLoaderProps) {
    return (
        <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
            <div className="relative flex items-center justify-center">
                {/* Outer Ring */}
                <div
                    className="absolute rounded-full border-4 border-primary/20"
                    style={{ width: size, height: size }}
                />
                {/* Spinning Indicator */}
                <div
                    className="rounded-full border-4 border-primary border-t-transparent animate-spin"
                    style={{ width: size, height: size }}
                />

                {/* Optional: Small 'V' or Initial inside if desired, keeping it simple for now */}
            </div>

            <p className="text-sm font-medium text-primary animate-pulse tracking-wide">
                CARGANDO...
            </p>
        </div>
    );
}
