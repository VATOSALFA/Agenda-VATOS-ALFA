
import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
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
                className="flex items-center border rounded-md px-3 border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
                onClick={() => {
                    setOpen(true);
                    setTimeout(() => inputRef.current?.focus(), 0);
                }}
            >
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                    ref={inputRef}
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Buscar servicio..."
                    className="border-none focus:ring-0 h-9 p-0 bg-transparent flex-grow outline-none placeholder:text-muted-foreground w-full py-2 text-sm"
                    disabled={loading}
                />
            </div>

            {open && (
                <div
                    className="absolute left-0 right-0 top-full mt-1 z-[200] rounded-md border bg-popover text-popover-foreground shadow-md"
                    onWheel={(e) => e.stopPropagation()}
                >
                    <div
                        className="max-h-[250px] overflow-y-auto overscroll-contain p-1"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {!hasResults && (
                            <p className="py-6 text-center text-sm text-muted-foreground">No se encontraron resultados.</p>
                        )}
                        {filteredGroups.map((group: any) => (
                            <div key={group.name}>
                                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group.name}</p>
                                {group.items.map((s: ServiceType) => (
                                    <div
                                        key={s.id}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelect(s.id, s.name);
                                        }}
                                        className={cn(
                                            "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                            value === s.id && "bg-accent text-accent-foreground"
                                        )}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4 flex-shrink-0",
                                                value === s.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {s.name}
                                    </div>
                                ))}
                            </div>
                        ))}

                        {isProduct && filteredProducts.length > 0 && (
                            <div>
                                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Productos</p>
                                {filteredProducts.map((p: Product) => (
                                    <div
                                        key={p.id}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelect(p.id, p.nombre);
                                        }}
                                        className={cn(
                                            "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                            value === p.id && "bg-accent text-accent-foreground"
                                        )}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4 flex-shrink-0",
                                                value === p.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {p.nombre}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
