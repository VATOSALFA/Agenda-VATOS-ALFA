'use client';

import React from 'react'
import { cn } from '@/lib/utils'
import { VariantProps, cva } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

const buttonVariants = cva(
    "relative group border text-foreground mx-auto text-center font-medium transition-all duration-300",
    {
        variants: {
            variant: {
                default: "bg-[#0F0F0F] text-white border-blue-500/40 hover:border-blue-500/70 transition-all duration-300",
                solid: "bg-blue-600 hover:bg-blue-700 text-white border-transparent hover:border-foreground/50 transition-all duration-200 shadow-sm",
                ghost: "border-transparent bg-transparent hover:border-zinc-600 hover:bg-white/10",
                primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
                secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent",
                outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                glass: "bg-black/30 backdrop-blur-xl border-blue-500/30 text-white/90 hover:bg-black/40 hover:border-blue-500/60 transition-all duration-500 shadow-2xl",
            },
            size: {
                default: "px-7 py-1.5 rounded-md",
                sm: "px-4 py-1.5 text-sm rounded-md",
                lg: "px-10 py-2.5 text-lg rounded-md",
                pill: "px-6 py-2 text-sm sm:text-base rounded-full",
                icon: "h-10 w-10 text-xl flex items-center justify-center rounded-md",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

interface VatosButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    neon?: boolean;
}

const VatosButton = React.forwardRef<HTMLButtonElement, VatosButtonProps>(
    ({ className, variant, size, asChild = false, neon = true, children, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";

        if (asChild) {
            return (
                <Comp
                    className={cn(buttonVariants({ variant, size, className }))}
                    ref={ref}
                    {...props}
                >{children}</Comp>
            );
        }

        const isPill = size === 'pill';

        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            >
                {/* Top neon line - Centered & Subtle */}
                <span className={cn(
                    "absolute h-[1.5px] opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 top-0 bg-gradient-to-r w-1/2 mx-auto from-transparent via-blue-500 to-transparent z-10 blur-[0.2px] shadow-[0_0_8px_rgba(59,130,246,0.6)]", 
                    neon && "block"
                )} />
                
                <span className="relative z-20 flex items-center justify-center gap-2">
                    {children}
                </span>

                {/* Bottom neon line - Centered & Subtle */}
                <span className={cn(
                    "absolute h-[1.5px] opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 bottom-0 bg-gradient-to-r w-1/2 mx-auto from-transparent via-blue-500 to-transparent z-10 blur-[0.2px] shadow-[0_0_8px_rgba(59,130,246,0.6)]", 
                    neon && "block"
                )} />
                
                {/* Subtle perimeter glow wrap */}
                <span className={cn(
                    "absolute inset-0 border border-blue-500/0 group-hover:border-blue-500/30 transition-all duration-500 pointer-events-none",
                    isPill ? "rounded-full" : "rounded-md"
                )} />
            </Comp>
        );
    }
)

VatosButton.displayName = 'VatosButton';

export { VatosButton, buttonVariants };
