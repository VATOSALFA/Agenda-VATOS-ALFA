
import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
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

    // Helper to find the name for the current value (ID)
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
        return value; // Fallback
    }, [value, groupedServices, products]);

    const handleSelect = (id: string, name: string) => {
        onChange(id);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {displayLabel || (loading ? "Cargando..." : "Buscar servicio...")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Buscar servicio..." />
                    <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                        {groupedServices.map((group: any) => (
                            <CommandGroup heading={group.name} key={group.name}>
                                {group.items.map((s: ServiceType) => (
                                    <CommandItem
                                        key={s.id}
                                        value={s.name}
                                        onSelect={() => handleSelect(s.id, s.name)}
                                        className="cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === s.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {s.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}

                        {isProduct && products && products.length > 0 && (
                            <CommandGroup heading="Productos">
                                {products.map((p: Product) => (
                                    <CommandItem
                                        key={p.id}
                                        value={p.nombre}
                                        onSelect={() => handleSelect(p.id, p.nombre)}
                                        className="cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === p.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {p.nombre}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
