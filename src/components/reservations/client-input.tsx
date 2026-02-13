
import { useState, useEffect } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import type { Client } from '@/lib/types';

import { Command as CommandPrimitive } from "cmdk";

interface ClientInputProps {
    value: string;
    onChange: (value: string) => void;
    clients: Client[];
    loading?: boolean;
    onSearchChange?: (value: string) => void;
}

export const ClientInput = ({ value, onChange, clients, loading, onSearchChange }: ClientInputProps) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!value) return;

        let foundName = "";
        const found = clients.find((c) => c.id === value);
        if (found) {
            foundName = `${found.nombre} ${found.apellido || ''}`.trim();
        }

        if (foundName) setSearch(foundName);
    }, [value, clients]);

    const handleSelect = (id: string, name: string) => {
        onChange(id);
        setSearch(name);
        if (onSearchChange) onSearchChange(name);
        setOpen(false);
    };

    return (
        <Command className="h-auto overflow-visible bg-transparent">
            <Popover open={open} onOpenChange={setOpen} modal={false}>
                <PopoverTrigger asChild>
                    <div
                        className="flex items-center border rounded-md px-3 border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
                        onClick={() => setOpen(true)}
                    >
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <CommandPrimitive.Input
                            value={search}
                            onValueChange={(val) => {
                                setSearch(val);
                                if (onSearchChange) onSearchChange(val);
                                if (!open) setOpen(true);
                            }}
                            onFocus={() => setOpen(true)}
                            placeholder="Buscar cliente por nombre o teléfono..."
                            className="border-none focus:ring-0 h-9 p-0 bg-transparent flex-grow outline-none placeholder:text-muted-foreground w-full py-2 text-sm"
                            disabled={loading}
                        />
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[calc(100vw-4rem)] sm:w-[500px] p-0 z-[200]"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <CommandList>
                        <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                        <CommandGroup>
                            {clients.map((client) => {
                                const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
                                const searchTerms = `${fullName} ${client.telefono || ''}`.trim();
                                return (
                                    <CommandItem
                                        key={client.id} // Use ID as key
                                        value={searchTerms} // Use Name + Phone for filtering
                                        onSelect={() => handleSelect(client.id, fullName)}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={() => handleSelect(client.id, fullName)}
                                        className="cursor-pointer !pointer-events-auto hover:bg-accent hover:text-accent-foreground"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === client.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {fullName}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </PopoverContent>
            </Popover>
        </Command>
    );
};
