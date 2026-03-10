import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Rounds a number to 2 decimal places, fixing floating point precision errors.
 * e.g. roundMoney(272.0500000000002) => 272.05
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a number as a currency string with exactly 2 decimal places.
 * e.g. formatMoney(1234.5) => "1,234.50"
 */
export function formatMoney(value: number): string {
  return roundMoney(value).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
