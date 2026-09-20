
'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Search, X, Check, Phone, User, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Client } from '@/lib/types';

interface NewConversationModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClientSelected: (client: Client) => void;
}

export function NewConversationModal({
  isOpen,
  onOpenChange,
  onClientSelected,
}: NewConversationModalProps) {
  const { toast } = useToast();
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedClient(null);
      setIsDropdownOpen(false);
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter clients in real-time as user types
  const filteredClients = useMemo(() => {
    if (!clients || clients.length === 0) return [];

    const clean = (str: string) =>
      (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const query = clean(searchTerm);
    if (!query) {
      // Show first 30 clients when empty
      return clients.slice(0, 30);
    }

    const terms = query.split(/\s+/).filter(Boolean);

    return clients
      .filter((c) => {
        const fullName = clean(`${c.nombre || ''} ${c.apellido || ''}`);
        const phone = (c.telefono || '').replace(/\D/g, '');
        const rawPhone = clean(c.telefono || '');
        const email = clean(c.correo || (c as any).email || '');
        const combined = `${fullName} ${rawPhone} ${phone} ${email}`;

        return terms.every((t) => combined.includes(t));
      })
      .slice(0, 30);
  }, [clients, searchTerm]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsDropdownOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredClients.length ? prev + 1 : 0));
      scrollHighlightedIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredClients.length - 1));
      scrollHighlightedIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isDropdownOpen && filteredClients[highlightedIndex]) {
        handleSelectClient(filteredClients[highlightedIndex]);
      } else if (selectedClient) {
        handleConfirm();
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const scrollHighlightedIntoView = (idx: number) => {
    if (!listRef.current) return;
    const item = listRef.current.children[idx] as HTMLElement;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setSearchTerm(`${client.nombre || ''} ${client.apellido || ''}`.trim());
    setIsDropdownOpen(false);
  };

  const handleClearSelection = () => {
    setSelectedClient(null);
    setSearchTerm('');
    setIsDropdownOpen(true);
    inputRef.current?.focus();
  };

  const handleConfirm = () => {
    if (!selectedClient) {
      toast({
        title: 'Selecciona un cliente',
        description: 'Por favor elige un cliente de la lista para iniciar la conversación.',
        variant: 'destructive',
      });
      return;
    }
    onClientSelected(selectedClient);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-visible gap-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Iniciar Conversación
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escribe el nombre o teléfono del cliente para buscarlo y abrir su chat.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Autocomplete Input Container */}
          <div ref={containerRef} className="relative space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Cliente</span>
              {selectedClient && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Seleccionado
                </span>
              )}
            </label>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Escribe para buscar (ej: Julio, 4423...)"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedClient(null);
                  setIsDropdownOpen(true);
                  setHighlightedIndex(0);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onKeyDown={handleKeyDown}
                className="pl-9 pr-16 h-10 text-sm bg-background border-border/80 focus-visible:ring-primary/20"
                autoComplete="off"
              />

              <div className="absolute right-2 top-2 flex items-center gap-1">
                {searchTerm && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="h-6 w-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(!isDropdownOpen);
                    inputRef.current?.focus();
                  }}
                  className="h-6 w-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Live Dropdown List */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="p-2 border-b bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {clientsLoading
                      ? 'Cargando clientes...'
                      : `${filteredClients.length} cliente${filteredClients.length === 1 ? '' : 's'} encontrado${filteredClients.length === 1 ? '' : 's'}`}
                  </span>
                  <span className="text-[10px]">Usa ↑ ↓ para navegar</span>
                </div>

                <div ref={listRef} className="max-h-60 overflow-y-auto divide-y divide-border/30 p-1">
                  {clientsLoading ? (
                    <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      Cargando clientes...
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground space-y-1">
                      <User className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
                      <p className="font-medium text-foreground">No se encontraron clientes</p>
                      <p className="text-[11px]">
                        No hay coincidencias para &quot;<span className="font-semibold">{searchTerm}</span>&quot;
                      </p>
                    </div>
                  ) : (
                    filteredClients.map((client, idx) => {
                      const isSelected = selectedClient?.id === client.id;
                      const isHighlighted = highlightedIndex === idx;
                      const fullName = `${client.nombre || ''} ${client.apellido || ''}`.trim() || 'Cliente';
                      const initials = (client.nombre?.slice(0, 1) || '') + (client.apellido?.slice(0, 1) || '');

                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectClient(client)}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                            isSelected
                              ? 'bg-primary/15 text-primary'
                              : isHighlighted
                              ? 'bg-muted/80'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="w-8 h-8 border border-border/50 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                                {initials.toUpperCase() || 'CL'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-foreground truncate">
                                {fullName}
                              </p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-muted-foreground/70" />
                                {client.telefono || 'Sin teléfono'}
                              </p>
                            </div>
                          </div>

                          {isSelected && (
                            <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected Client Card Preview */}
          {selectedClient && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between gap-3 animate-in fade-in-0 duration-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar className="w-9 h-9 border-2 border-primary/30 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs">
                    {((selectedClient.nombre?.slice(0, 1) || '') + (selectedClient.apellido?.slice(0, 1) || '')).toUpperCase() || 'CL'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-bold text-xs text-foreground truncate">
                    {selectedClient.nombre} {selectedClient.apellido || ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    {selectedClient.telefono || 'Sin teléfono registrado'}
                  </p>
                </div>
              </div>

              <Badge variant="secondary" className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Listo para chatear
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 flex items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedClient || clientsLoading}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow text-xs"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Abrir Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
