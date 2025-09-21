"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

export default function FirebaseTestPage() {
  const [email, setEmail] = useState("ZeusAlejandro.VatosAlfa@gmail.com");
  const [pass, setPass] = useState("Vatosalfa1");
  const [status, setStatus] = useState("Sin sesión");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setStatus(u ? `Sesión: ${u.email ?? u.uid}` : "Sin sesión");
    });
    return () => unsub();
  }, []);

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setStatus("Login OK");
    } catch (e: any) {
      setStatus("Error login: " + e.message);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setStatus("Sesión cerrada");
  };

  const escribir = async () => {
    try {
      await addDoc(collection(db, "diagnostico"), {
        ok: true,
        by: user?.uid ?? "unknown",
        createdAt: serverTimestamp(),
      });
      setStatus("Escritura OK en 'diagnostico'");
    } catch (e: any) {
      setStatus("Error escribiendo: " + e.message);
    }
  };

  const leer = async () => {
    try {
      const snap = await getDocs(collection(db, "diagnostico"));
      setStatus(`Leí ${snap.size} documentos`);
    } catch (e: any) {
      setStatus("Error leyendo: " + e.message);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Prueba Firebase</h1>
      <p>{status}</p>

      {!user ? (
        <div style={{ display: "grid", gap: 8, maxWidth: 360, marginTop: 12 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Contraseña"
            type="password"
          />
          <button onClick={login}>Iniciar sesión</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={escribir}>Escribir</button>
          <button onClick={leer}>Leer</button>
          <button onClick={logout}>Cerrar sesión</button>
        </div>
      )}
    </main>
  );
}
