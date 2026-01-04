
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { accessToken, userId, externalId } = body;

        if (!accessToken || !userId) {
            return NextResponse.json({ error: "Faltan credenciales (AccessToken o UserID)" }, { status: 400 });
        }

        // 1. SEARCH/CREATE SYSTEM STORE (V2)
        // To satisfy MP Quality, we must create a store via API.
        // We will look fo our specific "System Store" (VatosAlfaSystemStore).
        // If it exists, we use it. If not, we CREATE IT (this triggers the quality check).

        const SYSTEM_EXTERNAL_ID = "SucursalVatosAlfa_Sistema_V1";
        console.log("Buscando sucursal del sistema...");

        const searchStores = await fetch(`https://api.mercadopago.com/users/${userId}/stores/search?external_id=${SYSTEM_EXTERNAL_ID}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const searchData = await searchStores.json();

        let storeId;
        let storeName = "VATOS ALFA (Sistema)";

        if (searchData.results && searchData.results.length > 0) {
            const existingStore = searchData.results[0];
            storeId = existingStore.id;
            storeName = existingStore.name;
            console.log(`Usando sucursal de sistema existente: ${storeName} (${storeId})`);
        } else {
            console.log("Creando NUEVA sucursal de sistema para cumplir requisitos de calidad...");
            const storeData = {
                name: "VATOS ALFA Barber Shop (Sistema)",
                business_hours: {
                    monday: [{ open: "08:00", close: "22:00" }],
                    tuesday: [{ open: "08:00", close: "22:00" }],
                    wednesday: [{ open: "08:00", close: "22:00" }],
                    thursday: [{ open: "08:00", close: "22:00" }],
                    friday: [{ open: "08:00", close: "22:00" }],
                    saturday: [{ open: "08:00", close: "22:00" }],
                    sunday: [{ open: "08:00", close: "22:00" }]
                },
                location: {
                    street_number: "1001",
                    street_name: "Av Cerro Sombrerete",
                    city_name: "Querétaro",
                    state_name: "Querétaro",
                    latitude: 20.6184,
                    longitude: -100.3956,
                    reference: "Santiago de Querétaro"
                },
                external_id: SYSTEM_EXTERNAL_ID
            };

            const storeRes = await fetch(`https://api.mercadopago.com/users/${userId}/stores`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(storeData)
            });
            const storeResult = await storeRes.json();
            if (!storeRes.ok) throw new Error("No se pudo crear la sucursal: " + (storeResult.message || storeResult.error));
            storeId = storeResult.id;
            storeName = storeData.name;
        }

        console.log("Sucursal ID seleccionada:", storeId);

        // 2. Create POS (Caja) attached to THIS Store
        const posData = {
            name: "Caja Principal",
            fixed_amount: true,
            store_id: Number(storeId), // Ensure it is a number or string as required, typically Number for MP API
            external_id: "CajaVatosAlfa1"
        };

        console.log("Creando Caja en MP...");
        const posRes = await fetch(`https://api.mercadopago.com/pos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(posData)
        });

        const posResult = await posRes.json();
        let posId = posResult.id;
        let qr = posResult.qr;

        if (!posRes.ok) {
            console.warn("POS creation warning:", posResult);
            // Check if exists by external_id
            const getPos = await fetch(`https://api.mercadopago.com/pos?external_id=${posData.external_id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const getPosData = await getPos.json();
            if (getPosData.results && getPosData.results.length > 0) {
                posId = getPosData.results[0].id;
                qr = getPosData.results[0].qr;
                console.log("Caja ya existía, usando la existente.");
            } else {
                // Try to force creation without external_id if that was the conflict
                // Or return specific error
                return NextResponse.json({ error: "No se pudo crear la caja.", details: posResult }, { status: 400 });
            }
        }

        return NextResponse.json({
            success: true,
            store: { id: storeId, name: storeName },
            pos: { id: posId, name: posData.name, qr_image: qr?.image }
        });

    } catch (error: any) {
        console.error("Error syncing MP Store/POS:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
