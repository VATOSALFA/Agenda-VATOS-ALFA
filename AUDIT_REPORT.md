# INFORME DE AUDITORÍA Y SEGURIDAD - Agenda VATOS ALFA

**Fecha:** 12 de Diciembre, 2025
**Auditor:** Agente AI Senior (Antigravity)
**Estado:** CRÍTICO -> CORREGIDO

## 1. RESUMEN EJECUTIVO

Se ha realizado una auditoría profunda del código fuente, encontrando **vulnerabilidades de seguridad críticas** que ponían en riesgo la integridad total de los datos y el negocio. Estas vulnerabilidades permitían, bajo ciertas condiciones, que usuarios malintencionados obtuvieran privilegios de Administrador o accedieran a datos sensibles. **Todas las vulnerabilidades detectadas han sido neutralizadas y corregidas.**

Además, se optimizó la arquitectura del Layout y la gestión de la Autenticación para prevenir errores de interfaz ("UI Freezing") y componentes "Zombie".

---

## 2. PROBLEMAS CRÍTICOS ENCONTRADOS Y CORREGIDOS

### 🚨 1. Escalada de Privilegios (Vulnerabilidad "Default Admin")
- **Problema:** En `firebase-auth-context.tsx`, si un usuario autenticado no tenía un documento asociado en `usuarios` ni `profesionales` (ej. un registro interrumpido o script externo), el sistema **automáticamente le otorgaba el rol de 'Administrador general'**.
- **Impacto:** Un atacante podía registrarse y obtener control total del sistema inmediatamente.
- **Corrección:** Se eliminó este fallback. Ahora, si no existe el documento, el usuario recibe un rol seguro de "Staff (Sin edición)" o se le deniega el acceso, registrando la anomalía.

### 🔓 2. Reglas de Firestore Inseguras
- **Problema:** El archivo `firestore.rules` tenía una regla `match /{document=**} { allow read, write: if request.auth != null; }`.
- **Impacto:** Cualquier usuario logueado (incluyendo clientes o staff básico) podía leer, borrar o sobrescribir **toda la base de datos**.
- **Corrección:** Se reescribieron las reglas aplicando una estrategia de "Whitelist". Ahora solo se permite acceso explícito collection-por-collection (`usuarios`, `ventas`, `reservas`, etc.), manteniendo `empresa` público para lectura (configuración visual).

### 🧟 3. Componentes Zombie y Double-Wrapping
- **Problema:** El proveedor `LocalProvider` se instanciaba dos veces (en `layout.tsx` y `firebase-auth-context.tsx`), causando conflictos de estado. Además, rutas protegidas renderizaban contenido "fantasma" antes de redirigir.
- **Corrección:** Se eliminó la duplicidad de Providers y se implementó un "Guard" estricto en el `AuthProvider` que retorna `null` hasta confirmar la sesión, evitando renders indeseados.

### 📜 4. Problemas de Scroll y Layout
- **Problema:** `AppLayout` forzaba `h-screen overflow-y-auto` en el contenedor `main`. Esto rompía el comportamiento nativo de scroll y causaba problemas al abrir Modales (dobles barras de scroll o bloqueos).
- **Corrección:** Se cambió a `min-h-screen`, delegando el scroll al `body` del navegador, lo cual es el estándar para compatibilidad con librerías de UI modernas (Shadcn/Radix).

### 🐛 5. Código Frágil en Hooks
- **Problema:** `useFirestoreQuery` intentaba acceder a propiedades internas y privadas de Firebase (`_op`, `_field`) para detectar consultas por ID. Esto es altamente propenso a fallar con actualizaciones de librerías.
- **Corrección:** Se refactorizó el hook para utilizar lógica estándar de `query` y `onSnapshot`, eliminando la dependencia de APIs privadas.

---

## 3. ACCIONES REQUERIDAS DEL USUARIO

Para aplicar los cambios correctamente en su entorno local, por favor ejecute:

1.  **Instalar Dependencias:** Se detectó la ausencia de `node_modules` o errores de tipos.
    ```bash
    npm install
    # o
    npm ci
    ```
2.  **Desplegar Reglas de Seguridad:**
    ```bash
    firebase deploy --only firestore:rules
    ```

---

## 4. SUGERENCIAS FUTURAS (Next Loop)

Para llevar el proyecto al nivel "World Class" definitivo, sugiero:

1.  **Custom Claims (Firebase Auth):** En lugar de leer el rol del usuario desde Firestore en cada carga (cliente), usar Cloud Functions para setear el rol como un "Custom Claim" en el token de Auth. Esto permite validar `request.auth.token.role == 'admin'` directamente en las reglas de seguridad, siendo más rápido, barato y seguro.
2.  **Migración a Server Actions:** Utilizar Server Actions de Next.js para operaciones críticas (crear ventas, modificar inventario) para validar lógica en el servidor y no confiar ciegamente en el cliente.
3.  **Validación Zod en Backend:** Asegurar que los tipos de datos que entran a Firestore validen contra un esquema Zod también en el servidor (o via Cloud Functions trigger).
