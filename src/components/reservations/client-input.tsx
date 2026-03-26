
import { useState, useEffect, useMemo } from 'react';
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
import { useCallback } from 'react';

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

    // Pre-normalize clients for faster filtering
    const normalizedClients = useMemo(() => {
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return clients.map(client => {
            // Trim individual fields to handle database inconsistencies
            const nombre = (client.nombre || '').trim();
            const apellido = (client.apellido || '').trim();
            const telefono = (client.telefono || '').trim();
            
            const fullName = `${nombre} ${apellido}`.trim();
            const searchTerms = `${nombre} ${apellido} ${telefono}`.trim();
            const normalized = normalize(searchTerms);

            return {
                ...client,
                fullName,
                searchTerms,
                normalized
            };
        });
    }, [clients]);

    // Manual filtering and limiting to ensure high performance
    const filteredClients = useMemo(() => {
        const query = search.trim();
        if (!query) return [];
        
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const searchNormalized = normalize(query);
        
        // Split search into words to allow non-contiguous matching (e.g. "Ale pac" matches "Alejandro Pacheco")
        const searchWords = searchNormalized.split(/\s+/).filter(word => word.length > 0);
        
        if (searchWords.length === 0) return [];

        return normalizedClients
            .filter(client => {
                // ALL search words must be present in the client's normalized string
                return searchWords.every(word => client.normalized.includes(word));
            })
            .slice(0, 30); // Limiting to top 30 results for instant typing
    }, [normalizedClients, search]);

    return (
        <Command filter={() => 1} className="h-auto overflow-visible bg-transparent">
            <Popover open={open && search.trim().length > 0} onOpenChange={setOpen} modal={false}>
                <PopoverTrigger asChild>
                    <div
                        className="flex items-center border rounded-md px-3 border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
                        onClick={() => {
                            if (search.trim().length > 0) setOpen(true);
                        }}
                    >
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <CommandPrimitive.Input
                            value={search}
                            onValueChange={(val) => {
                                setSearch(val);
                                if (onSearchChange) onSearchChange(val);
                                if (val.trim().length > 0) setOpen(true);
                                else setOpen(false);
                            }}
                            onFocus={() => {
                                if (search.trim().length > 0) setOpen(true);
                            }}
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
                            {filteredClients.map((client) => {
                                return (
                                    <CommandItem
                                        key={client.id}
                                        value={client.id} 
                                        onSelect={() => handleSelect(client.id, client.fullName)}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={() => handleSelect(client.id, client.fullName)}
                                        className="cursor-pointer !pointer-events-auto hover:bg-accent hover:text-accent-foreground"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === client.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {client.fullName}
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
