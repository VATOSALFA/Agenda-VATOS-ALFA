
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type User as FirebaseUser, setPersistence, browserLocalPersistence, browserSessionPersistence, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { db, auth, storage } from '@/lib/firebase-client';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { allPermissions, initialRoles } from '@/lib/permissions';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CustomLoader } from "@/components/ui/custom-loader";

import { FirebaseErrorListener } from '@/components/firebase/FirebaseErrorListener';


export interface CustomUser extends FirebaseUser {
  role?: string;
  permissions?: string[];
  local_id?: string;
  avatarUrl?: string;
}
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  db: typeof db;
  storage: typeof storage;
  signInAndSetup: (email: string, pass: string, rememberMe?: boolean) => Promise<FirebaseUser>;
  signInWithGoogle: () => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Partial<AuthContextType>>({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  // Helper function to validate user against Firestore
  const validateUserPermissions = async (firebaseUser: FirebaseUser) => {
    let customData: any;
    let userRole: string = 'Staff (Sin edición)';
    let userPermissions: string[] = [];
    let userDoc: any;

    // 1. Check 'usuarios' collection by UID
    const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
    userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      customData = userDoc.data();
      userRole = customData.role || 'Staff (Sin edición)';
    } else {
      // 1.5. Fallback: Check 'usuarios' by EMAIL
      const usersRef = collection(db, 'usuarios');
      const q = query(usersRef, where('email', '==', firebaseUser.email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
        customData = userDoc.data();
        userRole = customData.role || 'Staff (Sin edición)';
      } else {
        // 2. Check 'profesionales' collection by UID
        const profDocRef = doc(db, 'profesionales', firebaseUser.uid);
        const profDoc = await getDoc(profDocRef);

        if (profDoc.exists()) {
          customData = profDoc.data();
          userRole = 'Staff (Sin edición)';
        } else {
          // 2.5 Fallback: Check 'profesionales' by email
          const prosRef = collection(db, 'profesionales');
          const qPro = query(prosRef, where('email', '==', firebaseUser.email));
          const querySnapshotPro = await getDocs(qPro);

          if (!querySnapshotPro.empty) {
            customData = querySnapshotPro.docs[0].data();
            userRole = 'Staff (Sin edición)';
          } else {
            // 3. STRICT MODE: User authenticated but NOT AUTHORIZED
            console.warn(`User ${firebaseUser.email} (${firebaseUser.uid}) not found in database. Access Denied.`);
            throw new Error("ACCESS_DENIED");
          }
        }
      }
    }

    // 4. Fetch permissions based on Role
    if (userRole === 'Administrador general') {
      userPermissions = allPermissions.map(p => p.key);
    } else {
      const roleId = userRole.toLowerCase().replace(/ /g, '_');
      const roleDocRef = doc(db, 'roles', roleId);
      const roleDoc = await getDoc(roleDocRef);

      if (roleDoc.exists()) {
        userPermissions = roleDoc.data().permissions || [];
      } else {
        const initialRole = initialRoles.find(r => r.title === userRole);
        userPermissions = initialRole ? initialRole.permissions : [];
      }
    }

    return {
      ...firebaseUser,
      displayName: customData.name || firebaseUser.displayName,
      email: customData.email || firebaseUser.email,
      role: userRole,
      permissions: userPermissions,
      uid: firebaseUser.uid,
      local_id: customData.local_id,
      avatarUrl: customData.avatarUrl || firebaseUser.photoURL,
    };
  };

  const checkLocalSchedule = async (localId: string): Promise<boolean> => {
    try {
      const localDocRef = doc(db, 'locales', localId);
      const localDoc = await getDoc(localDocRef);
      if (!localDoc.exists()) return true;

      const localData = localDoc.data();
      const schedule = localData.schedule;
      if (!schedule) return true;

      const now = new Date();
      const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      const currentDay = days[now.getDay()];

      const dayConfig = schedule[currentDay];
      if (!dayConfig || dayConfig.enabled === false) return false;

      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeInMins = currentHour * 60 + currentMinute;

      // Enforce 11:00 PM hard stop
      const hardEndLimitInMins = 23 * 60;
      if (currentTimeInMins > hardEndLimitInMins) {
        return false;
      }

      // Enforce 30 minutes before opening start limit
      const startTimeStr = dayConfig.start || '10:00';
      const [startH, startM] = startTimeStr.split(':').map(Number);
      const startTimeInMins = startH * 60 + startM;
      const allowedStartInMins = startTimeInMins - 30;

      if (currentTimeInMins < allowedStartInMins) {
        return false;
      }

      return true;
    } catch (e) {
      console.error("Error checking local schedule:", e);
      return true; // fallback
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentSessionId(localStorage.getItem('current_session_id'));
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const customUser = await validateUserPermissions(firebaseUser);

          // Enforce schedule limits for Receptionists
          if (customUser.role === 'Recepcionista' && customUser.local_id) {
            const isWithinHours = await checkLocalSchedule(customUser.local_id);
            if (!isWithinHours) {
              console.warn(`User ${customUser.email} denied access: outside working hours.`);
              throw new Error("OUTSIDE_HOURS");
            }
          }

          setUser(customUser);
        } catch (error: any) {
          if (error.message === "ACCESS_DENIED") {
            console.warn("Access denied for user:", firebaseUser.email);
            await firebaseSignOut(auth);
          } else if (error.message === "OUTSIDE_HOURS") {
            if (typeof window !== 'undefined') {
              alert("Acceso Restringido: Las recepcionistas no pueden acceder a la plataforma fuera del horario de la sucursal (permitido desde 30 mins antes de abrir hasta las 11:00 PM).");
            }
            await firebaseSignOut(auth);
          } else {
            console.error("Error fetching user data from Firestore:", error);
          }
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/inspiracion' || pathname === '/privacidad' || pathname === '/terminos' || pathname === '/agenda/display' || pathname.startsWith('/cita') || pathname.startsWith('/promociones');
  const isAuthPage = pathname === '/login';

  // Handling redirects in a separate effect to avoid updates during render
  useEffect(() => {
    if (loading) return;

    if (user && isAuthPage) {
      router.replace('/agenda');
    }

    if (!user && !isAuthPage && !isPublicPage) {
      router.replace('/login');
    }

  }, [user, loading, pathname, router, isAuthPage, isPublicPage]);

  const getDeviceInfo = () => {
    if (typeof window === 'undefined') return 'Desconocido';
    const ua = window.navigator.userAgent;
    
    // Check standalone mode (PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

    let os = 'Desconocido';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/ipad|iphone|ipod/i.test(ua)) os = 'iOS';
    else if (/macintosh/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    let deviceType = 'Desktop';
    if (/mobi/i.test(ua)) deviceType = 'Móvil';
    if (/ipad/i.test(ua) || (os === 'Android' && !/mobi/i.test(ua)) || (os === 'iOS' && /ipad/i.test(ua)) || (window.innerWidth >= 768 && window.innerWidth <= 1024)) {
      deviceType = 'Tablet';
    }

    let browser = 'Browser';
    if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/edge|edg/i.test(ua)) browser = 'Edge';

    const appType = isStandalone ? ' (App)' : ' (Navegador)';
    return `${deviceType} - ${os} (${browser})${appType}`;
  };

  const createSession = async (user: CustomUser) => {
    // Only create session for non-clients (e.g. receptionists, admins)
    if (user && user.role !== 'Cliente') {
      try {
        const activeSessionId = localStorage.getItem('current_session_id');
        if (activeSessionId) {
          const sessionDoc = await getDoc(doc(db, 'sesiones_trabajo', activeSessionId));
          if (sessionDoc.exists()) {
            const sessionData = sessionDoc.data();
            const start = sessionData.hora_entrada?.toDate();
            const today = new Date();
            const isSameDay = start && 
              start.getDate() === today.getDate() && 
              start.getMonth() === today.getMonth() && 
              start.getFullYear() === today.getFullYear();

            if (!isSameDay) {
              // Auto-close session from previous day using its last activity or start time
              await updateDoc(doc(db, 'sesiones_trabajo', activeSessionId), {
                hora_salida: sessionData.ultima_actividad || sessionData.hora_entrada || serverTimestamp(),
                estado: 'cerrada'
              });
              localStorage.removeItem('current_session_id');
            } else {
              // Same day: reuse the session
              setCurrentSessionId(activeSessionId);
              return;
            }
          }
        }

        const sessionRef = await addDoc(collection(db, 'sesiones_trabajo'), {
          empleado_id: user.uid,
          empleado_nombre: user.displayName || user.email,
          rol: user.role,
          hora_entrada: serverTimestamp(),
          hora_salida: null,
          local_id: user.local_id || null,
          estado: 'activa',
          pagado: false,
          dispositivo: getDeviceInfo(),
          ultima_actividad: serverTimestamp()
        });
        localStorage.setItem('current_session_id', sessionRef.id);
        setCurrentSessionId(sessionRef.id);
      } catch (e) {
        console.error("Error creating work session:", e);
      }
    }
  };

  const closeCurrentSession = async () => {
    const activeSessionId = localStorage.getItem('current_session_id');
    if (activeSessionId) {
      try {
        await updateDoc(doc(db, 'sesiones_trabajo', activeSessionId), {
          hora_salida: serverTimestamp(),
          estado: 'cerrada'
        });
        localStorage.removeItem('current_session_id');
        setCurrentSessionId(null);
      } catch (e) {
        console.error("Error closing work session:", e);
      }
    }
  };

  // Keep receptionist sessions updated every 60 seconds (Heartbeat)
  useEffect(() => {
    if (!currentSessionId || !user || user.role !== 'Recepcionista') return;

    const intervalId = setInterval(async () => {
      try {
        await updateDoc(doc(db, 'sesiones_trabajo', currentSessionId), {
          ultima_actividad: serverTimestamp()
        });
      } catch (e) {
        console.error("Error updating session heartbeat:", e);
      }
    }, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentSessionId, user]);

  const signOut = async () => {
    await closeCurrentSession();
    await firebaseSignOut(auth);
    setUser(null);
    router.push('/login');
  };

  const signInAndSetup = async (email: string, pass: string, rememberMe: boolean = false) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    
    // Explicitly validate user and start session
    try {
      const customUser = await validateUserPermissions(userCredential.user);
      await createSession(customUser);
    } catch (error) {
       console.error("User validation failed during sign in:", error);
    }

    return userCredential.user;
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);

    // Explicitly validate user immediately to prevent inconsistent UI state
    try {
      const customUser = await validateUserPermissions(userCredential.user);
      await createSession(customUser);
    } catch (error) {
      // If validation fails, sign out and re-throw so the UI catches it
      await firebaseSignOut(auth);
      throw error;
    }

    return userCredential.user;
  };

  const value = {
    user,
    loading,
    signInAndSetup,
    signInWithGoogle,
    signOut,
    db,
    storage,
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <CustomLoader size={80} />
      </div>
    );
  }

  // Logic to wrap safe content
  // If we are logged in and in a protected route, we explicitly block rendering until we are sure
  if (!user && !isAuthPage && !isPublicPage) {
    return null; // Don't render anything while redirecting
  }

  // Common return for both authenticated and public/auth pages
  // The layout wrapper (sidebar/header) is now handled by AuthGuard in the root layout
  return (
    <AuthContext.Provider value={value as AuthContextType}>
      {children}
      <FirebaseErrorListener />
    </AuthContext.Provider>
  );
};
