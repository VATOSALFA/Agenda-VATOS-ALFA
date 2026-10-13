
import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Check, Search, Clock, Scissors, Package, Sparkles } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';
import { dropdownCoordinator } from '@/lib/dropdown-coordinator';
import type { Service as ServiceType, Product } from '@/lib/types';

interface ServiceInputProps {
    value: string;
    onChange: (value: string) => void;
    groupedServices: any[];
    products?: Product[];
    isProduct?: boolean;
    loading?: boolean;
}

export const ServiceInput = ({ value, onChange, groupedServices, products, isProduct, loading }: ServiceInputProps) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const serviceInputId = useId();

    useEffect(() => {
        if (open) {
            dropdownCoordinator.notifyOpen(serviceInputId);
        }
    }, [open, serviceInputId]);

    useEffect(() => {
        return dropdownCoordinator.subscribe((activeId) => {
            if (activeId !== serviceInputId) {
                setOpen(false);
            }
        });
    }, [serviceInputId]);

    // Resolve displayed name from current value (ID)
    const displayLabel = useMemo(() => {
        if (!value) return "";
        for (const group of groupedServices) {
            if (!group.items) continue;
            const found = group.items.find((s: ServiceType) => s.id === value);
            if (found) return found.name;
        }
        if (products) {
            const foundProduct = products.find((p: Product) => p.id === value);
            if (foundProduct) return foundProduct.nombre;
        }
        return "";
    }, [value, groupedServices, products]);

    // Sync search text when value changes externally
    useEffect(() => {
        setSearch(displayLabel);
    }, [displayLabel]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const handleSelect = (id: string, name: string) => {
        onChange(id);
        setSearch(name);
        setOpen(false);
    };

    // Filter services based on search text
    const filteredGroups = useMemo(() => {
        const lowerSearch = search.toLowerCase().trim();
        if (!lowerSearch || lowerSearch === displayLabel.toLowerCase()) return groupedServices;

        return groupedServices
            .map((group: any) => ({
                ...group,
                items: group.items.filter((s: ServiceType) =>
                    s.name.toLowerCase().includes(lowerSearch)
                )
            }))
            .filter((group: any) => group.items.length > 0);
    }, [search, groupedServices, displayLabel]);

    const filteredProducts = useMemo(() => {
        if (!isProduct || !products) return [];
        const lowerSearch = search.toLowerCase().trim();
        if (!lowerSearch || lowerSearch === displayLabel.toLowerCase()) return products;
        return products.filter(p => p.nombre.toLowerCase().includes(lowerSearch));
    }, [search, products, isProduct, displayLabel]);

    const hasResults = filteredGroups.some((g: any) => g.items.length > 0) || filteredProducts.length > 0;

    return (
        <div ref={containerRef} className="relative">
            <div
                className="flex items-center border rounded-xl px-3 border-border/80 bg-card hover:border-primary/40 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 h-10 transition-all cursor-text shadow-2xs"
                onClick={() => {
                    setOpen(true);
                    setTimeout(() => inputRef.current?.focus(), 0);
                }}
            >
                <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                <input
                    ref={inputRef}
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Buscar servicio por nombre..."
                    className="border-none focus:ring-0 h-full p-0 bg-transparent flex-grow outline-none placeholder:text-muted-foreground w-full text-xs sm:text-sm font-medium"
                    disabled={loading}
                />
            </div>

            {open && (
                <div
                    className="absolute left-0 right-0 top-full mt-1.5 z-[250] rounded-2xl border-2 border-blue-500 bg-popover/95 backdrop-blur-md text-popover-foreground shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden"
                    onWheel={(e) => e.stopPropagation()}
                >
                    <div
                        className="max-h-[320px] overflow-y-auto overscroll-contain p-1.5 space-y-1.5"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {!hasResults && (
                            <p className="py-6 text-center text-xs text-muted-foreground">No se encontraron servicios ni productos.</p>
                        )}
                        {filteredGroups.map((group: any) => (
                            <div key={group.name} className="space-y-0.5">
                                <div className={cn(
                                    "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-between",
                                    group.isPopular
                                        ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
                                        : "text-muted-foreground bg-muted/30"
                                )}>
                                    <div className="flex items-center gap-1.5">
                                        {group.isPopular ? (
                                            <Sparkles className="h-3 w-3 text-[#C5A880] shrink-0" />
                                        ) : (
                                            <Scissors className="h-3 w-3 text-slate-400 shrink-0" />
                                        )}
                                        <span className={cn(group.isPopular && "text-blue-400 font-extrabold")}>
                                            {group.name}
                                        </span>
                                    </div>
                                    {group.isPopular && (
                                        <span className="text-[9px] font-medium text-slate-400 normal-case tracking-normal">
                                            Recepción
                                        </span>
                                    )}
                                </div>
                                {group.items.map((s: ServiceType) => {
                                    const isSelected = value === s.id;
                                    return (
                                        <div
                                            key={`${group.name}-${s.id}`}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                handleSelect(s.id, s.name);
                                            }}
                                            className={cn(
                                                "relative flex cursor-pointer select-none items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors",
                                                isSelected
                                                    ? "bg-blue-600 text-white font-bold shadow-xs hover:bg-blue-600"
                                                    : "hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"
                                            )}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <Check
                                                    className={cn(
                                                        "h-3.5 w-3.5 flex-shrink-0 stroke-[2.5]",
                                                        isSelected ? "text-white opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className={cn("text-xs truncate", isSelected ? "text-white font-bold" : "text-foreground font-semibold")}>
                                                        {s.name}
                                                    </p>
                                                    {s.duration ? (
                                                        <p className={cn("text-[10px] flex items-center gap-1 mt-0.5 font-sans", isSelected ? "text-white/80" : "text-muted-foreground")}>
                                                            <Clock className={cn("w-2.5 h-2.5", isSelected ? "text-white/80" : "text-slate-400")} /> {s.duration} min
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {s.price !== undefined && (
                                                <span className={cn("text-xs shrink-0 ml-2 font-sans", isSelected ? "text-white font-bold" : "text-foreground font-semibold")}>
                                                    ${formatMoney(s.price)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {isProduct && filteredProducts.length > 0 && (
                            <div className="space-y-0.5">
                                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 rounded-lg flex items-center gap-1.5">
                                    <Package className="h-3 w-3 text-slate-400" />
                                    <span>Productos</span>
                                </div>
                                {filteredProducts.map((p: Product) => {
                                    const isSelected = value === p.id;
                                    return (
                                        <div
                                            key={p.id}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                handleSelect(p.id, p.nombre);
                                            }}
                                            className={cn(
                                                "relative flex cursor-pointer select-none items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors",
                                                isSelected
                                                    ? "bg-blue-600 text-white font-bold shadow-xs hover:bg-blue-600"
                                                    : "hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"
                                            )}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <Check
                                                    className={cn(
                                                        "h-3.5 w-3.5 flex-shrink-0 stroke-[2.5]",
                                                        isSelected ? "text-white opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <p className={cn("text-xs truncate", isSelected ? "text-white font-bold" : "text-foreground font-semibold")}>
                                                    {p.nombre}
                                                </p>
                                            </div>
                                            {(p.public_price !== undefined || (p as any).precio !== undefined) && (
                                                <span className={cn("text-xs shrink-0 ml-2 font-sans", isSelected ? "text-white font-bold" : "text-foreground font-semibold")}>
                                                    ${formatMoney(p.public_price !== undefined ? p.public_price : (p as any).precio)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
