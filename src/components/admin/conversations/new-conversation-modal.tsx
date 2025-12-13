
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Combobox } from '@/components/ui/combobox';
import type { Client } from '@/lib/types';


interface NewConversationModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClientSelected: (client: Client) => void;
}

const newConversationSchema = z.object({
  clientId: z.string().min(1, 'Debes seleccionar un cliente.'),
});

type NewConversationFormData = z.infer<typeof newConversationSchema>;

export function NewConversationModal({ isOpen, onOpenChange, onClientSelected }: NewConversationModalProps) {
  const { toast } = useToast();
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  const form = useForm<NewConversationFormData>({
    resolver: zodResolver(newConversationSchema),
    defaultValues: {
      clientId: '',
    },
  });

  const clientOptions = useMemo(() => {
    return clients.map(client => ({
      value: client.id,
      label: `${client.nombre} ${client.apellido} (${client.telefono})`,
    }));
  }, [clients]);

  const onSubmit = (data: NewConversationFormData) => {
    const selectedClient = clients.find(c => c.id === data.clientId);
    if (selectedClient) {
      onClientSelected(selectedClient);
    } else {
        toast({ title: "Error", description: "No se pudo encontrar el cliente seleccionado.", variant: "destructive"})
    }
  };

  const filterFunction = (value: string, search: string) => {
    const option = clients.find(o => o.id === value);
    if (!option) return 0;

    const clientDataString = [
        option.nombre,
        option.apellido,
        option.telefono,
    ].join(' ').toLowerCase();

    const searchTerms = search.toLowerCase().split(' ').filter(Boolean);

    if (searchTerms.every(term => clientDataString.includes(term))) {
        return 1;
    }
    return 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Iniciar Conversación</DialogTitle>
              <DialogDescription>
                Busca un cliente para abrir su chat en el panel principal.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Combobox
                      options={clientOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Busca un cliente..."
                      loading={clientsLoading}
                      filter={filterFunction}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={clientsLoading}>
                {clientsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                Abrir Chat
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
