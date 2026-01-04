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
     * Prints text or binary data to the connected printer.
     */
    public async print(content: string | Uint8Array): Promise<void> {
        if (!this.characteristic) {
            throw new Error("No hay impresora conectada.");
        }

        let data: Uint8Array;
        if (typeof content === 'string') {
            const encoder = new TextEncoder();
            data = encoder.encode(content);
        } else {
            data = content;
        }

        // Chunking for BLE limits (usually 20 bytes default, expanded to 512 in newer versions, but ~500 safety)
        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await this.characteristic.writeValue(chunk);
        }
    }

    /**
     * Prints an image from a URL.
     * Resizes to 384px width (standard 58mm) and dither/thresholds to B&W.
     */
    public async printImage(imageUrl: string): Promise<void> {
        if (!imageUrl) return;
        try {
            console.log("Processing image for print:", imageUrl);
            const bitmap = await this.processImage(imageUrl);
            const rasterCommand = this.generateRasterData(bitmap);
            await this.print(rasterCommand);
        } catch (error) {
            console.error("Failed to print image:", error);
            // Don't throw, just log so text ticket still prints
        }
    }

    private async processImage(videoUrl: string, targetWidth: number = 384): Promise<{ data: Uint8Array; width: number; height: number }> {
        return new Promise((resolve, reject) => {
            // Use local proxy to bypass CORS issues with external Firebase/CDN images
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(videoUrl)}`;

            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Calculate height preserving aspect ratio
                const ratio = targetWidth / img.width;
                const targetHeight = Math.round(img.height * ratio);

                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Cannot get canvas context"));
                    return;
                }

                // White background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                const data = imageData.data;
                const monochromeData = new Uint8Array(targetWidth * targetHeight / 8);

                // Simple Thresholding (could use Dithering for better photos, but fine for logos)
                // We pack 1 bit per pixel. 0 = White/Transparent (Paper), 1 = Black (Dot)
                // NOTE: ESC/POS Raster format might vary. GS v 0 usually expects 1 = Print (Black).
                let byteIndex = 0;
                let bitIndex = 7;
                let currentByte = 0;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const alpha = data[i + 3];

                    // Luminance formula
                    const gray = (r * 0.299 + g * 0.587 + b * 0.114);

                    // If transparent or bright -> 0 (White/Paper)
                    // If dark -> 1 (Black/Print)
                    const isPrint = (alpha > 128 && gray < 128) ? 1 : 0;

                    if (isPrint) {
                        currentByte |= (1 << bitIndex);
                    }

                    bitIndex--;
                    if (bitIndex < 0) {
                        monochromeData[byteIndex] = currentByte;
                        byteIndex++;
                        currentByte = 0;
                        bitIndex = 7;
                    }
                }
                // Flush last partial byte (unlikely with 384 width which is byte aligned)
                if (bitIndex !== 7) {
                    monochromeData[byteIndex] = currentByte;
                }

                resolve({ data: monochromeData, width: targetWidth, height: targetHeight });
            };
            img.onerror = (e) => {
                console.error("Image Load Error:", e);
                reject(new Error("Failed to load image via proxy. Check URL or Network."));
            };
            img.src = proxyUrl;
        });
    }

    private generateRasterData(image: { data: Uint8Array; width: number; height: number }): Uint8Array {
        const { data, width, height } = image;
        // GS v 0 m xL xH yL yH d1...dk
        // m=0 (density normal), xL,xH = bytes width, yL,yH = dots height
        const xBytes = Math.ceil(width / 8);
        const xL = xBytes % 256;
        const xH = Math.floor(xBytes / 256);
        const yL = height % 256;
        const yH = Math.floor(height / 256);

        // Command header: GS v 0 m xL xH yL yH
        const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

        const combined = new Uint8Array(header.length + data.length);
        combined.set(header);
        combined.set(data, header.length);

        return combined;
    }

    private removeAccents(str: string): string {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    private wordWrap(text: string, maxLength: number): string[] {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            if (currentLine.length + 1 + words[i].length <= maxLength) {
                currentLine += ' ' + words[i];
            } else {
                lines.push(currentLine);
                currentLine = words[i];
            }
        }
        lines.push(currentLine);
        return lines;
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

        let receipt = "";

        receipt += INITIALIZE;
        receipt += ALIGN_CENTER;

        // Store Name (Wrapped & Sanitized)
        const storeName = this.removeAccents(data.storeName || "VATOS ALFA");
        receipt += BOLD_ON + storeName + "\n" + BOLD_OFF;

        // Address (Wrapped & Sanitized)
        if (data.storeAddress) {
            const address = this.removeAccents(data.storeAddress);
            const addressLines = this.wordWrap(address, 32);
            addressLines.forEach(line => receipt += line + "\n");
        }
        receipt += "--------------------------------\n";

        receipt += ALIGN_LEFT;
        receipt += `Fecha: ${data.date}\n`;

        // Customer (Wrapped & Sanitized)
        const customerName = this.removeAccents(data.customerName || "Cliente General");
        const customerLines = this.wordWrap(`Cliente: ${customerName}`, 32);
        customerLines.forEach(line => receipt += line + "\n");

        if (data.reservationId) receipt += `Reserva: ${data.reservationId.slice(0, 8)}\n`;

        receipt += "--------------------------------\n";
        receipt += BOLD_ON + "CANT  DESCRIPCION      IMPORTE" + BOLD_OFF + "\n";

        data.items.forEach((item: any) => {
            const qty = item.cantidad.toString().padStart(2, "0");
            const priceVal = (item.subtotal || 0).toFixed(2);
            const price = "$" + priceVal;

            // Calculate available space for name
            // Qty (2) + Space (2) + Name (X) + Space (1) + Price (Length) = 32
            // 4 + X + 1 + PriceLength = 32
            // X = 32 - 5 - PriceLength
            const maxNameLen = 32 - 5 - price.length;

            const rawName = this.removeAccents(item.nombre);
            const nameLines = this.wordWrap(rawName, maxNameLen > 0 ? maxNameLen : 10);

            // First line: QTY  NAME  PRICE
            const firstName = nameLines[0].padEnd(maxNameLen, " ");
            receipt += `${qty}  ${firstName} ${price}\n`;

            // Subsequent lines:      NAME
            for (let i = 1; i < nameLines.length; i++) {
                receipt += `    ${nameLines[i]}\n`; // Indent to align with description column
            }
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
        receipt += this.removeAccents("¡Gracias por su preferencia!") + "\n";
        receipt += "--------------------------------\n";
        receipt += FEED;

        return receipt;
    }

    public isConnected(): boolean {
        return this.device?.gatt?.connected || false;
    }
}
