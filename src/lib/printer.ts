export class BluetoothPrinter {
    private device: any | null = null;
    private characteristic: any | null = null;
    private server: any | null = null;

    private static instance: BluetoothPrinter;

    private constructor() { }

    public static getInstance(): BluetoothPrinter {
        if (!BluetoothPrinter.instance) {
            BluetoothPrinter.instance = new BluetoothPrinter();
        }
        return BluetoothPrinter.instance;
    }

    /**
     * Connects to a Bluetooth device.
     * Uses a broad filter to find most thermal printers.
     */
    public async connect(): Promise<string> {
        try {
            const nav = navigator as any;
            if (!nav.bluetooth) {
                throw new Error("Web Bluetooth API no está disponible en este navegador/dispositivo.");
            }

            // Common UUIDs for Thermal Printers (BLE)
            // 0x18f0: Standard Service
            // 0xe781...: Xiaomi / Mini Thermal
            // 0xae90...: Zjiang / Xprinter
            // 0xaf30...: Generic
            // 0xffe0...: HMSoft (Simple Serial)
            // 49535343...: ISSC (Very common in generic Chinese printers)
            const OPTIONAL_SERVICES = [
                '000018f0-0000-1000-8000-00805f9b34fb',
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                "0000ae90-0000-1000-8000-00805f9b34fb",
                "0000af30-0000-1000-8000-00805f9b34fb",
                "0000ffe0-0000-1000-8000-00805f9b34fb",
                "49535343-fe7d-4ae5-8fa9-9fafd205e455"
            ];

            // Try to reconnect to previously permitted devices first
            if (nav.bluetooth.getDevices) {
                console.log("Checking for permitted devices...");
                const devices = await nav.bluetooth.getDevices();
                if (devices && devices.length > 0) {
                    console.log("Found permitted device:", devices[0].name);
                    this.device = devices[0];
                }
            }

            if (!this.device) {
                console.log("Requesting Bluetooth Device...");
                this.device = await nav.bluetooth.requestDevice({
                    // Filters are strict. If we miss the specific service UUID, it won't show.
                    // 'acceptAllDevices: true' is easiest for users but requires 'optionalServices' to be exhaustive
                    // for the browser to allow access to them.
                    acceptAllDevices: true,
                    optionalServices: OPTIONAL_SERVICES
                });
            }

            if (!this.device) throw new Error("No se seleccionó ningún dispositivo.");

            console.log('Connecting to GATT Server...');
            if (this.device.gatt?.connected && this.server) {
                console.log("Already connected.");
            } else {
                this.server = await this.device.gatt?.connect() || null;
            }

            if (!this.server) throw new Error("No se pudo conectar al servidor GATT.");

            console.log('Discovering Services...');
            // Instead of guessing, get ALL services the browser has access to (defined in optionalServices)
            const services = await this.server.getPrimaryServices();

            let foundChar: any = null;

            // Iterate all services to find a Writable characteristic
            for (const service of services) {
                console.log("Checking Service:", service.uuid);
                try {
                    const characteristics = await service.getCharacteristics();
                    for (const c of characteristics) {
                        console.log("  - Char:", c.uuid, "Props:", c.properties);
                        if (c.properties.write || c.properties.writeWithoutResponse) {
                            console.log("  -> FOUND WRITABLE CHAR!");
                            foundChar = c;
                            break;
                        }
                    }
                } catch (err) {
                    console.warn("  Could not access characteristics for this service", err);
                }
                if (foundChar) break;
            }

            if (!foundChar) {
                throw new Error("Impresora conectada, pero no se encontró un canal de escritura (UUID desconocido). Verifica que sea una impresora BLE.");
            }

            this.characteristic = foundChar;
            this.device.addEventListener('gattserverdisconnected', this.onDisconnected);

            return this.device.name || "Impresora Conectada";

        } catch (error) {
            console.error('Bluetooth error:', error);
            throw error;
        }
    }

    private onDisconnected = (event: Event) => {
        console.log('Device disconnected');
        // Optional: Reconnect logic here
    };

    /**
     * Prints text to the connected printer.
     */
    public async print(text: string): Promise<void> {
        if (!this.characteristic) {
            throw new Error("No hay impresora conectada.");
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(text);

        // Chunking for BLE limits (usually 20 bytes default, expanded to 512 in newer versions, but ~500 safety)
        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await this.characteristic.writeValue(chunk);
        }
    }

    /**
    * Formats data for printing a simple sales ticket
    */
    public formatTicket(data: any): string {
        const ESC = "\u001B";
        const GS = "\u001D";
        const INITIALIZE = ESC + "@";
        const ALIGN_CENTER = ESC + "a" + "\u0001";
        const ALIGN_LEFT = ESC + "a" + "\u0000";
        const BOLD_ON = ESC + "E" + "\u0001";
        const BOLD_OFF = ESC + "E" + "\u0000";
        const FEED = ESC + "d" + "\u0003"; // Feed 3 lines
        const CUT = GS + "V" + "\u0041" + "\u0003"; // Cut partial

        let receipt = "";

        receipt += INITIALIZE;
        receipt += ALIGN_CENTER;
        receipt += BOLD_ON + (data.storeName || "VATOS ALFA") + "\n" + BOLD_OFF;
        if (data.storeAddress) receipt += data.storeAddress + "\n";
        receipt += "--------------------------------\n";

        receipt += ALIGN_LEFT;
        receipt += `Fecha: ${data.date}\n`;
        receipt += `Cliente: ${data.customerName}\n`;
        if (data.reservationId) receipt += `Reserva: ${data.reservationId.slice(0, 8)}\n`;

        receipt += "--------------------------------\n";
        receipt += BOLD_ON + "CANT  DESCRIPCION      IMPORTE" + BOLD_OFF + "\n";

        data.items.forEach((item: any) => {
            const name = item.nombre.substring(0, 16).padEnd(16, " ");
            const qty = item.cantidad.toString().padStart(2, "0");
            const price = "$" + (item.subtotal || 0).toFixed(2);
            receipt += `${qty}    ${name} ${price}\n`;
        });

        receipt += "--------------------------------\n";
        receipt += ALIGN_LEFT;

        if (data.anticipoPagado > 0) {
            receipt += `Subtotal:       $${data.subtotal.toFixed(2)}\n`;
            receipt += `Anticipo:      -$${data.anticipoPagado.toFixed(2)}\n`;
        }

        if (data.discount > 0) {
            receipt += `Descuento:     -$${data.discount.toFixed(2)}\n`;
        }

        receipt += BOLD_ON + `TOTAL:          $${data.total.toFixed(2)}` + BOLD_OFF + "\n";

        receipt += "--------------------------------\n";
        receipt += ALIGN_CENTER;
        receipt += "¡Gracias por su preferencia!\n";
        receipt += "--------------------------------\n";
        receipt += FEED;
        // receipt += CUT; // Uncomment if printer supports cutter

        return receipt;
    }

    public isConnected(): boolean {
        return this.device?.gatt?.connected || false;
    }
}
