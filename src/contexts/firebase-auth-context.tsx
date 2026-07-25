
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { allPermissions, initialRoles } from '@/lib/permissions';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CustomLoader } from "@/components/ui/custom-loader";

import { FirebaseErrorListener } from '@/components/firebase/FirebaseErrorListener';

// Lazy-loaded Firebase modules (avoid loading ~163KB on public pages)
let _firebaseModules: Awaited<ReturnType<typeof loadFirebaseModules>> | null = null;

async function loadFirebaseModules() {
  const [clientMod, authMod, firestoreMod] = await Promise.all([
    import('@/lib/firebase-client'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  return {
    auth: clientMod.auth,
    db: clientMod.db,
    storage: clientMod.storage,
    onAuthStateChanged: authMod.onAuthStateChanged,
    firebaseSignOut: authMod.signOut,
    signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
    setPersistence: authMod.setPersistence,
    browserLocalPersistence: authMod.browserLocalPersistence,
    browserSessionPersistence: authMod.browserSessionPersistence,
    GoogleAuthProvider: authMod.GoogleAuthProvider,
    signInWithPopup: authMod.signInWithPopup,
    doc: firestoreMod.doc,
    getDoc: firestoreMod.getDoc,
    collection: firestoreMod.collection,
    query: firestoreMod.query,
    where: firestoreMod.where,
    getDocs: firestoreMod.getDocs,
    addDoc: firestoreMod.addDoc,
    serverTimestamp: firestoreMod.serverTimestamp,
    updateDoc: firestoreMod.updateDoc,
  };
}

async function getFirebase() {
  if (_firebaseModules) return _firebaseModules;
  _firebaseModules = await loadFirebaseModules();
  return _firebaseModules;
}


export interface CustomUser extends FirebaseUser {
  role?: string;
  permissions?: string[];
  local_id?: string;
  avatarUrl?: string;
}
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  db: any;
  storage: any;
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
  const [firebaseDb, setFirebaseDb] = useState<any>(null);
  const [firebaseStorage, setFirebaseStorage] = useState<any>(null);

  const pathname = usePathname();
  const router = useRouter();

  const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/inspiracion' || pathname === '/privacidad' || pathname === '/terminos' || pathname === '/agenda/display' || pathname.startsWith('/cita') || pathname.startsWith('/promociones') || pathname.startsWith('/blog');
  const isAuthPage = pathname === '/login';

  // Helper function to validate user against Firestore
  const validateUserPermissions = async (firebaseUser: FirebaseUser) => {
    const fb = await getFirebase();
    let customData: any;
    let userRole: string = 'Staff (Sin edición)';
    let userPermissions: string[] = [];
    let userDoc: any;

    // 1. Check 'usuarios' collection by UID
    const userDocRef = fb.doc(fb.db, 'usuarios', firebaseUser.uid);
    userDoc = await fb.getDoc(userDocRef);

    if (userDoc.exists()) {
      customData = userDoc.data();
      userRole = customData.role || 'Staff (Sin edición)';
    } else {
      // 1.5. Fallback: Check 'usuarios' by EMAIL
      const usersRef = fb.collection(fb.db, 'usuarios');
      const q = fb.query(usersRef, fb.where('email', '==', firebaseUser.email));
      const querySnapshot = await fb.getDocs(q);

      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
        customData = userDoc.data();
        userRole = customData.role || 'Staff (Sin edición)';
      } else {
        // 2. Check 'profesionales' collection by UID
        const profDocRef = fb.doc(fb.db, 'profesionales', firebaseUser.uid);
        const profDoc = await fb.getDoc(profDocRef);

        if (profDoc.exists()) {
          customData = profDoc.data();
          userRole = 'Staff (Sin edición)';
        } else {
          // 2.5 Fallback: Check 'profesionales' by email
          const prosRef = fb.collection(fb.db, 'profesionales');
          const qPro = fb.query(prosRef, fb.where('email', '==', firebaseUser.email));
          const querySnapshotPro = await fb.getDocs(qPro);

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
      const roleDocRef = fb.doc(fb.db, 'roles', roleId);
      const roleDoc = await fb.getDoc(roleDocRef);

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
      const fb = await getFirebase();
      const localDocRef = fb.doc(fb.db, 'locales', localId);
      const localDoc = await fb.getDoc(localDocRef);
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
    let unsubscribe: (() => void) | undefined;

    (async () => {
      // Load full Firebase client and set up auth listener on all pages
      const fb = await getFirebase();
      setFirebaseDb(fb.db);
      setFirebaseStorage(fb.storage);

      // Ensure persistence is set to browserLocalPersistence so logins survive app/tab restarts
      try {
        await fb.setPersistence(fb.auth, fb.browserLocalPersistence);
      } catch (e) {
        // Persistence already configured
      }

      if (typeof window !== 'undefined') {
        setCurrentSessionId(localStorage.getItem('current_session_id'));
      }

      unsubscribe = fb.onAuthStateChanged(fb.auth, async (firebaseUser) => {
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
              await fb.firebaseSignOut(fb.auth);
            } else if (error.message === "OUTSIDE_HOURS") {
              if (typeof window !== 'undefined') {
                alert("Acceso Restringido: Las recepcionistas no pueden acceder a la plataforma fuera del horario de la sucursal (permitido desde 30 mins antes de abrir hasta las 11:00 PM).");
              }
              await fb.firebaseSignOut(fb.auth);
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
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handling redirects in a separate effect to avoid updates during render
  useEffect(() => {
    if (loading) return;

    // Check if running as PWA (standalone app)
    const isStandalonePWA = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true
    );

    // If staff member is logged in, redirect them to /agenda if they are on /login OR if they open the root page / in PWA mode
    if (user) {
      if (isAuthPage || (pathname === '/' && isStandalonePWA)) {
        router.replace('/agenda');
      }
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
        const fb = await getFirebase();
        const activeSessionId = localStorage.getItem('current_session_id');
        if (activeSessionId) {
          const sessionDoc = await fb.getDoc(fb.doc(fb.db, 'sesiones_trabajo', activeSessionId));
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
              await fb.updateDoc(fb.doc(fb.db, 'sesiones_trabajo', activeSessionId), {
                hora_salida: sessionData.ultima_actividad || sessionData.hora_entrada || fb.serverTimestamp(),
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

        const sessionRef = await fb.addDoc(fb.collection(fb.db, 'sesiones_trabajo'), {
          empleado_id: user.uid,
          empleado_nombre: user.displayName || user.email,
          rol: user.role,
          hora_entrada: fb.serverTimestamp(),
          hora_salida: null,
          local_id: user.local_id || null,
          estado: 'activa',
          pagado: false,
          dispositivo: getDeviceInfo(),
          ultima_actividad: fb.serverTimestamp()
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
        const fb = await getFirebase();
        await fb.updateDoc(fb.doc(fb.db, 'sesiones_trabajo', activeSessionId), {
          hora_salida: fb.serverTimestamp(),
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
        const fb = await getFirebase();
        await fb.updateDoc(fb.doc(fb.db, 'sesiones_trabajo', currentSessionId), {
          ultima_actividad: fb.serverTimestamp()
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
    const fb = await getFirebase();
    await closeCurrentSession();
    await fb.firebaseSignOut(fb.auth);
    setUser(null);
    router.push('/login');
  };

  const signInAndSetup = async (email: string, pass: string, rememberMe: boolean = true) => {
    const fb = await getFirebase();
    const persistence = rememberMe !== false ? fb.browserLocalPersistence : fb.browserSessionPersistence;
    await fb.setPersistence(fb.auth, persistence);
    const userCredential = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    
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
    const fb = await getFirebase();
    const provider = new fb.GoogleAuthProvider();
    const userCredential = await fb.signInWithPopup(fb.auth, provider);

    // Explicitly validate user immediately to prevent inconsistent UI state
    try {
      const customUser = await validateUserPermissions(userCredential.user);
      await createSession(customUser);
    } catch (error) {
      // If validation fails, sign out and re-throw so the UI catches it
      await fb.firebaseSignOut(fb.auth);
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
    db: firebaseDb,
    storage: firebaseStorage,
  };


  if (loading) {
    // On public pages, loading is immediately false so this won't show
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
