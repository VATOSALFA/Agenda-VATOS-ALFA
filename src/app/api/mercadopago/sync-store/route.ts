
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffAccess } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
    try {
        const bearerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || undefined;
        try {
            await verifyStaffAccess(bearerToken, { requireGeneralAdmin: true });
        } catch (authErr: any) {
            const msg = String(authErr?.message || '');
            const status = msg.includes('403') || msg.includes('permiso') || msg.includes('Administrador General')
                ? 403
                : 401;
            return NextResponse.json({ error: msg || 'No autorizado.' }, { status });
        }

        const body = await req.json();
        const { accessToken, userId } = body || {};

        if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length < 10) {
            return NextResponse.json({ error: "AccessToken de Mercado Pago inválido." }, { status: 400 });
        }
        const cleanUserId = String(userId || '').trim();
        if (!/^\d{4,25}$/.test(cleanUserId)) {
            return NextResponse.json({ error: "UserID de Mercado Pago inválido." }, { status: 400 });
        }

        // 1. SEARCH/CREATE SYSTEM STORE (V2)
        // To satisfy MP Quality, we must create a store via API.
        // We will look fo our specific "System Store" (VatosAlfaSystemStore).
        // If it exists, we use it. If not, we CREATE IT (this triggers the quality check).

        const SYSTEM_EXTERNAL_ID = "SucursalVatosAlfa_Sistema_V1";
        console.log("Buscando sucursal del sistema...");

        const searchStores = await fetch(`https://api.mercadopago.com/users/${cleanUserId}/stores/search?external_id=${SYSTEM_EXTERNAL_ID}`, {
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

            const storeRes = await fetch(`https://api.mercadopago.com/users/${cleanUserId}/stores`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(storeData)
            });
            const storeResult = await storeRes.json();
            if (!storeRes.ok) {
                console.error("MP store create failed:", storeResult);
                return NextResponse.json({ error: "No se pudo crear la sucursal en Mercado Pago." }, { status: 400 });
            }
            storeId = storeResult.id;
            storeName = storeData.name;
        }

        console.log("Sucursal ID seleccionada:", storeId);

        // 2. Create POS (Caja) attached to THIS Store
        const posData = {
            name: "Caja Principal",
            fixed_amount: true,
            store_id: Number(storeId),
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
            const getPos = await fetch(`https://api.mercadopago.com/pos?external_id=${posData.external_id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const getPosData = await getPos.json();
            if (getPosData.results && getPosData.results.length > 0) {
                posId = getPosData.results[0].id;
                qr = getPosData.results[0].qr;
                console.log("Caja ya existía, usando la existente.");
            } else {
                return NextResponse.json({ error: "No se pudo crear o recuperar la caja en Mercado Pago." }, { status: 400 });
            }
        }

        return NextResponse.json({
            success: true,
            store: { id: storeId, name: storeName },
            pos: { id: posId, name: posData.name, qr_image: qr?.image }
        });

    } catch (error: any) {
        console.error("Error syncing MP Store/POS:", error);
        return NextResponse.json({ error: "Error interno sincronizando con Mercado Pago." }, { status: 500 });
    }
}
