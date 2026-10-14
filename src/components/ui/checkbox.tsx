"use client"

import * as React from "react"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "checked" | "defaultChecked" | "onChange"> {
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onCheckedChange, onClick, disabled, ...props }, ref) => {
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState<boolean>(
      Boolean(defaultChecked)
    )

    const isControlled = checked !== undefined
    const currentChecked = isControlled ? checked : uncontrolledChecked
    const isChecked = currentChecked === true
    const isIndeterminate = currentChecked === "indeterminate"
    const dataState = isIndeterminate ? "indeterminate" : isChecked ? "checked" : "unchecked"

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e)
      if (e.defaultPrevented || disabled) return
      const nextChecked = isIndeterminate ? true : !isChecked
      if (!isControlled) {
        setUncontrolledChecked(nextChecked)
      }
      onCheckedChange?.(nextChecked)
    }

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isIndeterminate ? "mixed" : isChecked}
        data-state={dataState}
        disabled={disabled}
        ref={ref}
        onClick={handleClick}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground flex items-center justify-center transition-colors",
          className
        )}
        {...props}
      >
        {isChecked && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
        {isIndeterminate && <Minus className="h-3.5 w-3.5 stroke-[2.5]" />}
      </button>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

