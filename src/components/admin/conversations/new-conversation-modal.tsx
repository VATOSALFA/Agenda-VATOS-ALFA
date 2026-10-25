'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Search, X, Check, Phone, User } from 'lucide-react';
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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedClient(null);
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Filter clients in real-time as user types
  const filteredClients = useMemo(() => {
    if (!clients || clients.length === 0) return [];

    const clean = (val: any) =>
      String(val ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const query = clean(searchTerm);
    if (!query) {
      // Show first 50 clients when empty
      return clients.slice(0, 50);
    }

    const terms = query.split(/\s+/).filter(Boolean);

    return clients
      .filter((c) => {
        const fullName = clean(`${c.nombre || ''} ${c.apellido || ''}`);
        const phone = String(c.telefono ?? '').replace(/\D/g, '');
        const rawPhone = clean(c.telefono);
        const email = clean(c.correo || (c as any).email);
        const combined = `${fullName} ${rawPhone} ${phone} ${email}`;

        return terms.every((t) => combined.includes(t));
      })
      .slice(0, 50);
  }, [clients, searchTerm]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      if (filteredClients[highlightedIndex]) {
        handleSelectClient(filteredClients[highlightedIndex]);
        onClientSelected(filteredClients[highlightedIndex]);
      } else if (selectedClient) {
        handleConfirm();
      }
    } else if (e.key === 'Escape') {
      onOpenChange(false);
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
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-lg w-full h-[600px] max-h-[90vh] p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background flex flex-col gap-0"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Iniciar Conversación
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Escribe el nombre o teléfono del cliente para abrir su chat.
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Buscador de Clientes */}
        <div className="p-4 pb-2 border-b border-border/40 shrink-0 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Buscar por nombre, apellido o teléfono (ej: Julio, 4423...)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="pl-9 pr-9 h-10 text-sm bg-muted/20 border-border/70 focus-visible:ring-blue-500"
              autoComplete="off"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 top-2.5 h-5 w-5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
            <span>
              {clientsLoading
                ? 'Cargando clientes...'
                : `${filteredClients.length} cliente${filteredClients.length === 1 ? '' : 's'} disponible${filteredClients.length === 1 ? '' : 's'}`}
            </span>
            <span className="text-[10px]">Doble clic o Enter para abrir directo</span>
          </div>
        </div>

        {/* Lista de Clientes (Área principal scrolleable con altura amplia) */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {clientsLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span>Cargando clientes...</span>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-muted-foreground p-6 text-center space-y-2">
              <User className="w-8 h-8 text-muted-foreground/30" />
              <p className="font-semibold text-foreground text-sm">No se encontraron clientes</p>
              <p className="text-xs max-w-xs">
                No hay coincidencias para &quot;<span className="font-medium text-foreground">{searchTerm}</span>&quot;.
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
                  onDoubleClick={() => {
                    handleSelectClient(client);
                    onClientSelected(client);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between gap-3 transition-colors border ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500/40 text-foreground shadow-sm'
                      : isHighlighted
                      ? 'bg-muted/40 border-border/60'
                      : 'border-transparent hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-9 h-9 border border-border/40 shrink-0 overflow-hidden">
                      {(client.foto_perfil_url || client.photoURL || client.avatarUrl || client.fotoUrl) && (
                        <AvatarImage
                          src={client.foto_perfil_url || client.photoURL || client.avatarUrl || client.fotoUrl}
                          alt={fullName}
                          className="object-cover"
                        />
                      )}
                      <AvatarFallback className="bg-muted text-foreground font-semibold text-xs">
                        {initials.toUpperCase() || 'CL'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-foreground truncate">
                        {fullName}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-sans mt-0.5">
                        <Phone className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                        <span>{client.telefono || 'Sin teléfono'}</span>
                        {client.numero_cliente && (
                          <span className="text-[10px] text-slate-400">· #{client.numero_cliente}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected ? (
                      <span className="flex items-center gap-1 text-[11px] text-blue-400 font-semibold">
                        <Check className="w-4 h-4 text-blue-400" />
                        Seleccionado
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
                        Elegir
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Vista Previa del Cliente Seleccionado (si hay uno elegido) */}
        {selectedClient && (
          <div className="px-4 py-2.5 bg-blue-500/5 border-t border-blue-500/20 flex items-center justify-between gap-3 shrink-0 animate-in fade-in-0 duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="w-7 h-7 border border-blue-500/30 shrink-0 overflow-hidden">
                {(selectedClient.foto_perfil_url || selectedClient.photoURL || selectedClient.avatarUrl || selectedClient.fotoUrl) && (
                  <AvatarImage
                    src={selectedClient.foto_perfil_url || selectedClient.photoURL || selectedClient.avatarUrl || selectedClient.fotoUrl}
                    alt={selectedClient.nombre}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-blue-500/10 text-blue-400 font-bold text-[10px]">
                  {((selectedClient.nombre?.slice(0, 1) || '') + (selectedClient.apellido?.slice(0, 1) || '')).toUpperCase() || 'CL'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-bold text-xs text-foreground truncate">
                  {selectedClient.nombre} {selectedClient.apellido || ''}
                </p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-sans">
                  <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                  {selectedClient.telefono || 'Sin teléfono'}
                </p>
              </div>
            </div>

            <Badge variant="secondary" className="text-[10px] shrink-0 bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Listo para chatear
            </Badge>
          </div>
        )}

        {/* Footer de Acciones */}
        <DialogFooter className="p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between sm:justify-between shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9 px-3 text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="alfa"
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedClient || clientsLoading}
            className="rounded-xl h-9 px-4 text-xs font-bold text-white shadow-md"
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1 text-slate-300" />
            Abrir Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
