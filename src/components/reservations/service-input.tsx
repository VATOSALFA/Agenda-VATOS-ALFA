
import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
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
    const [search, setSearch] = useState("");

    useEffect(() => {
        // If value is empty, we don't necessarily clear search, user might be typing.
        // But if value is set externally (e.g. edit mode), we must sync.
        // We can assume valid ID means we should show the name.
        if (!value) return;

        let foundName = "";
        for (const group of groupedServices) {
            if (!group.items) continue;
            const found = group.items.find((s: ServiceType) => s.id === value);
            if (found) { foundName = found.name; break; }
        }
        if (!foundName && products) {
            const foundProduct = products.find((p: Product) => p.id === value);
            if (foundProduct) foundName = foundProduct.nombre;
        }

        if (foundName) setSearch(foundName);
    }, [value, groupedServices, products]);

    const handleSelect = (id: string, name: string) => {
        onChange(id);
        setSearch(name);
        setOpen(false);
    };

    return (
        <Command className="h-auto overflow-visible bg-transparent">
            <Popover open={open} onOpenChange={setOpen} modal={false}>
                <PopoverTrigger asChild>
                    <div className="flex items-center border rounded-md px-3 border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text" onClick={() => setOpen(true)}>

                        <CommandInput
                            value={search}
                            onValueChange={(val) => {
                                setSearch(val);
                                if (!open) setOpen(true);
                            }}
                            onFocus={() => setOpen(true)}
                            placeholder="Buscar servicio..."
                            className="border-none focus:ring-0 h-9 p-0 bg-transparent flex-grow outline-none placeholder:text-muted-foreground"
                            disabled={isProduct}
                        />
                        {/* Optional: Clear button? */}
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 z-[200]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <CommandList>
                        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                        {groupedServices.map((group: any) => (
                            <CommandGroup heading={group.name} key={group.name}>
                                {group.items.map((s: ServiceType) => (
                                    <CommandItem
                                        key={s.id}
                                        value={s.name}
                                        onSelect={() => handleSelect(s.id, s.name)}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={() => handleSelect(s.id, s.name)}
                                        className="cursor-pointer !pointer-events-auto hover:bg-accent hover:text-accent-foreground"
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
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={() => handleSelect(p.id, p.nombre)}
                                        className="cursor-pointer !pointer-events-auto hover:bg-accent hover:text-accent-foreground"
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
                </PopoverContent>
            </Popover>
        </Command>
    );
};
