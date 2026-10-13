
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
                        className="flex items-center border rounded-xl px-3 border-border/80 bg-card hover:border-primary/40 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 h-10 transition-all cursor-text shadow-2xs"
                        onClick={() => {
                            if (search.trim().length > 0) setOpen(true);
                        }}
                    >
                        <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
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
                            className="border-none focus:ring-0 h-full p-0 bg-transparent flex-grow outline-none placeholder:text-muted-foreground w-full text-xs sm:text-sm font-medium"
                            disabled={loading}
                        />
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[calc(100vw-4rem)] sm:w-[500px] p-1.5 z-[250] border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-popover/95 backdrop-blur-md overflow-hidden"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <CommandList className="max-h-[300px]">
                        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No se encontraron clientes.</CommandEmpty>
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
                                        className="cursor-pointer !pointer-events-auto rounded-xl p-2 my-0.5 hover:bg-blue-500/10 transition-colors flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div className="h-7 w-7 rounded-full bg-[#202A49] text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-2xs">
                                                {client.nombre?.slice(0, 1).toUpperCase() || 'C'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-xs text-foreground truncate">{client.fullName}</p>
                                                {client.telefono && (
                                                    <p className="text-[10px] font-mono text-muted-foreground truncate">{client.telefono}</p>
                                                )}
                                            </div>
                                        </div>
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 text-blue-500 shrink-0 ml-2",
                                                value === client.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
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
