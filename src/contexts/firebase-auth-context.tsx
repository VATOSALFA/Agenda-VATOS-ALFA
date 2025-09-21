
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

interface CustomUser extends Partial<FirebaseUser> {
    role?: string;
    permissions?: string[];
    local_id?: string;
    avatarUrl?: string;
    displayName?: string;
}
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  authInstance: Auth;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Partial<AuthContextType>>({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Mock Admin User to grant full access
    const mockAdminUser: CustomUser = {
      uid: '6ITeQawj9hMDyw8xWfRs5n4h5yg2',
      email: 'vatosalfa@gmail.com',
      displayName: 'Vatos Alfa Admin',
      role: 'Administrador general',
      permissions: [
        'ver_agenda',
        'ver_clientes',
        'ver_ventas',
        'ver_productos',
        'ver_reportes',
        'ver_finanzas',
        'ver_administracion',
        'ver_configuracion',
        'crear_reservas',
        'bloquear_horarios',
        'registrar_ventas',
        'ver_conversaciones',
        'ver_locales',
        'ver_profesionales',
        'ver_servicios',
        'ver_whatsapp',
        'ver_comisiones',
        'ver_emails',
        'ver_integraciones',
        'ver_codigos_autorizacion',
        'ver_school',
        'ver_configuracion_empresa',
        'ver_configuracion_sitio_web',
        'ver_configuracion_agenda',
        'ver_configuracion_pagos',
        'ver_configuracion_caja',
        'ver_configuracion_recordatorios',
        'ver_configuracion_clientes',
        'ver_perfil',
        'ver_usuarios_permisos',
        'ver_ventas_facturadas',
        'ver_reporte_comisiones',
        'ver_caja',
        'ver_propinas',
        'ver_inventario',
        'ver_venta_productos',
        'ver_reporte_reservas',
        'ver_reporte_ventas',
        'ver_cierres_caja',
        'ver_configuracion_usuarios'
      ],
      avatarUrl: 'https://placehold.co/100x100'
    };

    setUser(mockAdminUser);
    setLoading(false);
    
    // This part is for when we restore the real authentication
    // const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    //   if (firebaseUser) {
    //     const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
    //     const userDoc = await getDoc(userDocRef);
        
    //     if (userDoc.exists()) {
    //       const customData = userDoc.data();
    //       setUser({
    //         ...firebaseUser,
    //         displayName: customData.name || firebaseUser.displayName,
    //         role: customData.role,
    //         permissions: customData.permissions || [],
    //         local_id: customData.local_id,
    //         avatarUrl: customData.avatarUrl
    //       });
    //     } else {
    //          console.error(`No se encontró documento de usuario en Firestore para UID: ${firebaseUser.uid}.`);
    //          setUser({ ...firebaseUser, role: 'Invitado', permissions: [] }); // Fallback with no permissions
    //     }
    //   } else {
    //     setUser(null);
    //     if (pathname !== '/login') {
    //         router.push('/login');
    //     }
    //   }
    //   setLoading(false);
    // });

    // return () => unsubscribe();
  }, [pathname, router]);

  const signOut = async () => {
    // In mock mode, this will just clear the user state.
    // When restored, it will call firebaseSignOut
    setUser(null); 
    router.push('/login');
    // await firebaseSignOut(auth);
  }

  const value = {
    user,
    loading,
    authInstance: auth,
    signOut,
  };

  if (loading) {
      return (
          <div className="flex justify-center items-center h-screen bg-muted/40">
              <Loader2 className="h-8 w-8 animate-spin" />
          </div>
      )
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
