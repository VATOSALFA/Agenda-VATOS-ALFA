'use client';

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { allPermissions, initialRoles } from '@/lib/permissions';
import { resolveAuthenticatedUserAction, type ServerResolvedUserProfile } from '@/lib/actions/auth-session';
import { usePathname, useRouter } from 'next/navigation';
import { CustomLoader } from "@/components/ui/custom-loader";

import { FirebaseErrorListener } from '@/components/firebase/FirebaseErrorListener';

// Lazy-loaded Firebase modules (avoid loading ~163KB on public pages)
let _firebaseModules: Awaited<ReturnType<typeof loadFirebaseModules>> | null = null;
let _usingSessionOnlyPersistence = false;

const AUTH_PROFILE_CACHE_PREFIX = 'vatos_alfa_auth_profile_';

interface CachedAuthProfile extends ServerResolvedUserProfile {
  cachedAt: number;
}

function saveCachedUserProfile(profile: ServerResolvedUserProfile) {
  if (typeof window === 'undefined' || !profile?.uid) return;
  try {
    const payload: CachedAuthProfile = {
      ...profile,
      cachedAt: Date.now(),
    };
    localStorage.setItem(`${AUTH_PROFILE_CACHE_PREFIX}${profile.uid}`, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

function loadCachedUserProfile(uid: string): CachedAuthProfile | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(`${AUTH_PROFILE_CACHE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAuthProfile;
    if (!parsed || parsed.uid !== uid || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearCachedUserProfile(uid?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (uid) {
      localStorage.removeItem(`${AUTH_PROFILE_CACHE_PREFIX}${uid}`);
      return;
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(AUTH_PROFILE_CACHE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    indexedDBLocalPersistence: authMod.indexedDBLocalPersistence,
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
  audio_settings?: Record<string, any>;
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

  const inFlightValidationRef = useRef<Map<string, Promise<CustomUser>>>(new Map());
  const activeAuthUidRef = useRef<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname.startsWith('/reserva') || pathname === '/privacidad' || pathname === '/terminos' || pathname === '/agenda/display' || pathname.startsWith('/cita') || pathname.startsWith('/promociones') || pathname.startsWith('/blog') || pathname.startsWith('/auth/mobile-google');
  const isAuthPage = pathname === '/login';

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

  const buildCustomUser = (
    firebaseUser: FirebaseUser,
    profile: ServerResolvedUserProfile
  ): CustomUser => {
    return {
      ...firebaseUser,
      uid: firebaseUser.uid,
      displayName: profile.displayName || firebaseUser.displayName,
      email: profile.email || firebaseUser.email,
      role: profile.role,
      permissions: profile.permissions,
      local_id: profile.local_id,
      avatarUrl: profile.avatarUrl || firebaseUser.photoURL || undefined,
      audio_settings: profile.audio_settings || undefined,
      getIdToken: (forceRefresh?: boolean) => firebaseUser.getIdToken(forceRefresh),
      getIdTokenResult: (forceRefresh?: boolean) => firebaseUser.getIdTokenResult(forceRefresh),
      reload: () => firebaseUser.reload(),
      delete: () => firebaseUser.delete(),
      toJSON: () => firebaseUser.toJSON(),
    } as CustomUser;
  };

  const queryClientFirestoreProfile = async (
    firebaseUser: FirebaseUser
  ): Promise<ServerResolvedUserProfile> => {
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
      userRole = customData.role || customData.rol || 'Staff (Sin edición)';
    } else {
      // 1.5. Fallback: Check 'usuarios' by EMAIL
      const usersRef = fb.collection(fb.db, 'usuarios');
      if (firebaseUser.email) {
        const q = fb.query(usersRef, fb.where('email', '==', firebaseUser.email));
        const querySnapshot = await fb.getDocs(q);

        if (!querySnapshot.empty) {
          userDoc = querySnapshot.docs[0];
          customData = userDoc.data();
          userRole = customData.role || customData.rol || 'Staff (Sin edición)';
        } else {
          // 1.6 Fallback: check case-insensitively in 'usuarios'
          const allUsersSnap = await fb.getDocs(usersRef);
          const targetEmail = firebaseUser.email.toLowerCase().trim();
          const matchedDoc = allUsersSnap.docs.find(
            d => (d.data().email || '').toLowerCase().trim() === targetEmail
          );
          if (matchedDoc) {
            userDoc = matchedDoc;
            customData = userDoc.data();
            userRole = customData.role || customData.rol || 'Staff (Sin edición)';
          }
        }
      }

      if (!userDoc) {
        // 2. Check 'profesionales' collection by UID
        const profDocRef = fb.doc(fb.db, 'profesionales', firebaseUser.uid);
        const profDoc = await fb.getDoc(profDocRef);

        if (profDoc.exists()) {
          customData = profDoc.data();
          userRole = 'Staff (Sin edición)';
        } else {
          // 2.5 Fallback: Check 'profesionales' by email
          const prosRef = fb.collection(fb.db, 'profesionales');
          if (firebaseUser.email) {
            const qPro = fb.query(prosRef, fb.where('email', '==', firebaseUser.email));
            const querySnapshotPro = await fb.getDocs(qPro);

            if (!querySnapshotPro.empty) {
              customData = querySnapshotPro.docs[0].data();
              userRole = 'Staff (Sin edición)';
            } else {
              // 2.6 Fallback: check case-insensitively in 'profesionales'
              const allProsSnap = await fb.getDocs(prosRef);
              const targetEmail = firebaseUser.email.toLowerCase().trim();
              const matchedPro = allProsSnap.docs.find(
                d => (d.data().email || '').toLowerCase().trim() === targetEmail
              );
              if (matchedPro) {
                customData = matchedPro.data();
                userRole = 'Staff (Sin edición)';
              }
            }
          }

          if (!customData) {
            // 3. STRICT MODE: User authenticated but NOT AUTHORIZED
            console.warn(`User ${firebaseUser.email} (${firebaseUser.uid}) not found in database. Access Denied.`);
            const accessError: any = new Error("ACCESS_DENIED");
            accessError.userEmail = firebaseUser.email;
            throw accessError;
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

    // Enforce schedule limits for Receptionists
    if (userRole === 'Recepcionista' && customData.local_id) {
      const isWithinHours = await checkLocalSchedule(customData.local_id);
      if (!isWithinHours) {
        console.warn(`User ${customData.email || firebaseUser.email} denied access: outside working hours.`);
        throw new Error("OUTSIDE_HOURS");
      }
    }

    return {
      uid: firebaseUser.uid,
      displayName: customData.name || customData.nombre || firebaseUser.displayName,
      email: customData.email || firebaseUser.email,
      role: userRole,
      permissions: userPermissions,
      local_id: customData.local_id,
      avatarUrl: customData.avatarUrl || firebaseUser.photoURL,
      audio_settings: customData.audio_settings || undefined,
    };
  };

  // Valida permisos deduplicando llamadas concurrentes (signInWithPopup + onAuthStateChanged)
  // y respaldando con verificación criptográfica en servidor si el WebChannel del cliente aún está sincronizando credenciales.
  const validateUserPermissions = async (
    firebaseUser: FirebaseUser,
    options?: { isInteractiveSignIn?: boolean }
  ): Promise<CustomUser> => {
    const existingPromise = inFlightValidationRef.current.get(firebaseUser.uid);
    if (existingPromise) {
      return existingPromise;
    }

    const validationPromise = (async (): Promise<CustomUser> => {
      // 1. Garantizar que el ID token esté vigente y propagado en Firebase Auth antes de consultar Firestore
      let idToken = await firebaseUser.getIdToken(false);

      // 2. Intentar lectura por SDK cliente (con reintento corto si Firestore está cambiando de UNAUTHENTICATED a AUTHENTICATED)
      const retryDelays = options?.isInteractiveSignIn ? [180, 350] : [200];
      let lastClientError: any = null;

      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          const clientProfile = await queryClientFirestoreProfile(firebaseUser);
          saveCachedUserProfile(clientProfile);
          return buildCustomUser(firebaseUser, clientProfile);
        } catch (err: any) {
          if (err?.message === 'ACCESS_DENIED' || err?.message === 'OUTSIDE_HOURS') {
            throw err;
          }
          lastClientError = err;
          const isPermissionRace =
            err?.code === 'permission-denied' ||
            String(err?.message || '').toLowerCase().includes('missing or insufficient permissions');

          if (isPermissionRace && attempt < retryDelays.length) {
            try {
              idToken = await firebaseUser.getIdToken(attempt === 1);
            } catch {
              // Ignore token refresh transient error; fallback handles it
            }
            await sleep(retryDelays[attempt]);
            continue;
          }
          break;
        }
      }

      // 3. Respaldo en Servidor (Firebase Admin SDK + verifyIdToken): inmune a bloqueos de pestañas IndexedDB o desfase de WebChannel
      try {
        let serverResult = await resolveAuthenticatedUserAction(idToken);
        if (serverResult.status === 'invalid_token') {
          idToken = await firebaseUser.getIdToken(true);
          serverResult = await resolveAuthenticatedUserAction(idToken);
        }

        if (serverResult.status === 'access_denied') {
          const accessError: any = new Error('ACCESS_DENIED');
          accessError.userEmail = serverResult.email || firebaseUser.email;
          throw accessError;
        }

        if (serverResult.status === 'outside_hours') {
          throw new Error('OUTSIDE_HOURS');
        }

        if (serverResult.status === 'ok') {
          // Dar un breve margen para que el SyncEngine local termine de absorber el token antes de abrir listeners en /agenda
          if (options?.isInteractiveSignIn) {
            await sleep(150);
          }
          saveCachedUserProfile(serverResult.profile);
          return buildCustomUser(firebaseUser, serverResult.profile);
        }
      } catch (serverErr: any) {
        if (serverErr?.message === 'ACCESS_DENIED' || serverErr?.message === 'OUTSIDE_HOURS') {
          throw serverErr;
        }
        console.warn('Server auth fallback warning:', serverErr);
      }

      // 4. Respaldo de caché local verificada para el mismo UID (evita cerrar la sesión al abrir la PWA durante reconexión de red)
      if (!options?.isInteractiveSignIn) {
        const cached = loadCachedUserProfile(firebaseUser.uid);
        if (cached) {
          if (cached.role === 'Recepcionista' && cached.local_id) {
            const withinHours = await checkLocalSchedule(cached.local_id);
            if (!withinHours) {
              throw new Error('OUTSIDE_HOURS');
            }
          }
          return buildCustomUser(firebaseUser, cached);
        }
      }

      throw lastClientError || new Error('No se pudo verificar la sesión del usuario.');
    })();

    inFlightValidationRef.current.set(firebaseUser.uid, validationPromise);
    try {
      return await validationPromise;
    } finally {
      inFlightValidationRef.current.delete(firebaseUser.uid);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isUnmounted = false;

    const handleOnlineRevalidation = async () => {
      try {
        const fb = await getFirebase();
        const current = fb.auth.currentUser;
        if (!current) return;
        const refreshedUser = await validateUserPermissions(current);
        if (!isUnmounted && fb.auth.currentUser?.uid === current.uid) {
          setUser(refreshedUser);
        }
      } catch (err: any) {
        if (err?.message === 'ACCESS_DENIED' || err?.message === 'OUTSIDE_HOURS') {
          const fb = await getFirebase();
          clearCachedUserProfile(fb.auth.currentUser?.uid);
          await fb.firebaseSignOut(fb.auth);
          if (!isUnmounted) setUser(null);
        }
      }
    };

    (async () => {
      // Load full Firebase client and set up auth listener on all pages
      const fb = await getFirebase();
      if (isUnmounted) return;
      setFirebaseDb(fb.db);
      setFirebaseStorage(fb.storage);

      // IMPORTANTE: No llamar setPersistence(browserLocalPersistence) en cada arranque.
      // getAuth() ya utiliza la jerarquía nativa [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      // migrando sesiones previas automáticamente sin borrar IndexedDB ni cerrar sesiones entre pestañas y la ventana PWA.
      if (typeof (fb.auth as any).authStateReady === 'function') {
        try {
          await (fb.auth as any).authStateReady();
        } catch (e) {
          console.warn('authStateReady warning:', e);
        }
      }

      if (typeof window !== 'undefined') {
        setCurrentSessionId(localStorage.getItem('current_session_id'));
        window.addEventListener('online', handleOnlineRevalidation);
      }

      unsubscribe = fb.onAuthStateChanged(fb.auth, async (firebaseUser) => {
        activeAuthUidRef.current = firebaseUser?.uid || null;

        if (firebaseUser) {
          try {
            const customUser = await validateUserPermissions(firebaseUser);
            if (!isUnmounted && activeAuthUidRef.current === firebaseUser.uid) {
              setUser(customUser);
            }
          } catch (error: any) {
            if (error.message === "ACCESS_DENIED") {
              console.warn("Access denied for user:", firebaseUser.email);
              clearCachedUserProfile(firebaseUser.uid);
              await fb.firebaseSignOut(fb.auth);
            } else if (error.message === "OUTSIDE_HOURS") {
              clearCachedUserProfile(firebaseUser.uid);
              if (typeof window !== 'undefined' && !isAuthPage) {
                alert("Acceso Restringido: Las recepcionistas no pueden acceder a la plataforma fuera del horario de la sucursal (permitido desde 30 mins antes de abrir hasta las 11:00 PM).");
              }
              await fb.firebaseSignOut(fb.auth);
            } else {
              console.error("Error fetching user data from Firestore:", error);
              // Evitar estado zombi donde fb.auth sigue autenticado pero user es null en /login
              await fb.firebaseSignOut(fb.auth).catch(() => {});
            }
            if (!isUnmounted) {
              setUser(null);
            }
          }
        } else {
          if (!isUnmounted) {
            setUser(null);
          }
        }
        if (!isUnmounted) {
          setLoading(false);
        }
      });
    })();

    return () => {
      isUnmounted = true;
      if (unsubscribe) unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnlineRevalidation);
      }
    };
  }, []);

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
    const uidToClear = user?.uid || fb.auth.currentUser?.uid || null;
    await closeCurrentSession();
    clearCachedUserProfile(uidToClear);
    activeAuthUidRef.current = null;
    await fb.firebaseSignOut(fb.auth);
    setUser(null);
    router.push('/login');
  };

  const signInAndSetup = async (email: string, pass: string, rememberMe: boolean = true) => {
    const fb = await getFirebase();
    if (rememberMe === false) {
      await fb.setPersistence(fb.auth, fb.browserSessionPersistence);
      _usingSessionOnlyPersistence = true;
    } else if (_usingSessionOnlyPersistence) {
      await fb.setPersistence(fb.auth, fb.indexedDBLocalPersistence);
      _usingSessionOnlyPersistence = false;
    }

    const userCredential = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    activeAuthUidRef.current = userCredential.user.uid;

    try {
      const customUser = await validateUserPermissions(userCredential.user, { isInteractiveSignIn: true });
      setUser(customUser);
      setLoading(false);
      await createSession(customUser);
    } catch (error) {
      clearCachedUserProfile(userCredential.user.uid);
      activeAuthUidRef.current = null;
      setUser(null);
      await fb.firebaseSignOut(fb.auth).catch(() => {});
      throw error;
    }

    return userCredential.user;
  };

  const signInWithGoogle = async () => {
    const fb = await getFirebase();
    if (_usingSessionOnlyPersistence) {
      try {
        await fb.setPersistence(fb.auth, fb.indexedDBLocalPersistence);
        _usingSessionOnlyPersistence = false;
      } catch {
        // Ignore persistence switch warning
      }
    }

    const provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const userCredential = await fb.signInWithPopup(fb.auth, provider);
    activeAuthUidRef.current = userCredential.user.uid;

    // Validar permisos garantizando que user quede listo en estado antes de redirigir a /agenda
    try {
      const customUser = await validateUserPermissions(userCredential.user, { isInteractiveSignIn: true });
      setUser(customUser);
      setLoading(false);
      await createSession(customUser);
    } catch (error) {
      clearCachedUserProfile(userCredential.user.uid);
      activeAuthUidRef.current = null;
      setUser(null);
      await fb.firebaseSignOut(fb.auth).catch(() => {});
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
