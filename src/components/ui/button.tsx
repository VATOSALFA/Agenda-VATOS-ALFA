
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { playAgendaClickSound } from "@/lib/notification-sound"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        alfa: "btn-vatos-alfa font-bold",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, onClick, ...props }, ref) => {
    const isAlfa = variant === 'alfa' || (typeof className === 'string' && className.includes('btn-vatos-alfa'))
    const Comp = asChild ? Slot : "button"

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      playAgendaClickSound();
      onClick?.(e);
    };

    if (isAlfa && !asChild) {
      const isPill = typeof className === 'string' && (className.includes('rounded-full') || className.includes('pill'))
      const isRounded2Xl = typeof className === 'string' && className.includes('rounded-2xl')
      const isRoundedLg = typeof className === 'string' && className.includes('rounded-lg')
      const isRoundedMd = typeof className === 'string' && className.includes('rounded-md')

      // Radios exteriores e interiores concéntricos (diferencia de 1.5px del padding del borde)
      const outerRadiusClass = isPill ? "rounded-full" : isRounded2Xl ? "rounded-2xl" : isRoundedLg ? "rounded-lg" : isRoundedMd ? "rounded-md" : "rounded-xl"
      const innerRadiusClass = isPill ? "rounded-full" : isRounded2Xl ? "rounded-[14.5px]" : isRoundedLg ? "rounded-[6.5px]" : isRoundedMd ? "rounded-[4.5px]" : "rounded-[10.5px]"

      return (
        <Comp
          className={cn(
            buttonVariants({ variant, size, className }),
            "btn-vatos-alfa select-none p-[1.5px] border-none overflow-hidden relative inline-flex items-center justify-center",
            outerRadiusClass
          )}
          ref={ref}
          onClick={handleClick}
          {...props}
        >
          {/* 1. Haz de luz láser que recorre el contorno exterior exacto (idéntico a ShinyButton de la app móvil) */}
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none animate-conic-laser z-0"
            aria-hidden="true"
          />

          {/* 2. Cuerpo interior del botón (degradado navy profundo) */}
          <span
            className={cn(
              "relative z-[1] inline-flex items-center justify-center w-full h-full text-white overflow-hidden select-none pointer-events-none",
              "bg-gradient-to-b from-[#18223c] to-[#0d1424]",
              innerRadiusClass
            )}
          >
            {/* 3. Haz de luz oblicuo que viaja periódicamente de izquierda a derecha */}
            <span
              className="absolute inset-0 w-1/2 h-full -skew-x-20 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-btn-light-sweep pointer-events-none z-[2]"
              aria-hidden="true"
            />

            {/* 4. Contenido del botón en primer plano */}
            <span
              className={cn(
                "relative z-10 inline-flex items-center justify-center gap-1.5 w-full h-full",
                size === 'icon' ? "p-0" : "px-3 py-1"
              )}
            >
              {children}
            </span>
          </span>
        </Comp>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
