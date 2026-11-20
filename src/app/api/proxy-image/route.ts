import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRequestIp } from '@/lib/server-auth';

const ALLOWED_IMAGE_HOSTS = new Set([
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
    'vatosalfa.com',
    'www.vatosalfa.com',
    'lh3.googleusercontent.com',
]);

const ALLOWED_CONTENT_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

export async function GET(request: NextRequest) {
    const ip = await getRequestIp();
    const rl = checkRateLimit(`proxy_img:${ip}`, 60, 60_000);
    if (!rl.allowed) {
        return new NextResponse('Too Many Requests', { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(rawUrl);
    } catch {
        return new NextResponse('Invalid URL parameter', { status: 400 });
    }

    if (parsedUrl.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
        return new NextResponse('Forbidden image host', { status: 403 });
    }

    try {
        const response = await fetch(parsedUrl.toString(), { redirect: 'error' });

        if (!response.ok) {
            return new NextResponse(`Failed to fetch remote image: ${response.statusText}`, { status: response.status });
        }

        const rawContentType = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.has(rawContentType)) {
            return new NextResponse('Unsupported image media type', { status: 415 });
        }

        const declaredLength = Number(response.headers.get('Content-Length') || 0);
        if (declaredLength > MAX_IMAGE_BYTES) {
            return new NextResponse('Image exceeds maximum allowed size (8 MB)', { status: 413 });
        }

        const reader = response.body?.getReader();
        if (!reader) {
            return new NextResponse('Empty image stream', { status: 502 });
        }

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > MAX_IMAGE_BYTES) {
                    await reader.cancel().catch(() => {});
                    return new NextResponse('Image exceeds maximum allowed size (8 MB)', { status: 413 });
                }
                chunks.push(value);
            }
        }

        const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
        const headers = new Headers();
        headers.set('Content-Type', rawContentType);
        headers.set('Cache-Control', 'public, max-age=3600');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Content-Security-Policy', 'sandbox');

        return new NextResponse(buffer, {
            status: 200,
            headers: headers
        });

    } catch (error) {
        console.error("Proxy Image Error:", error);
        return new NextResponse('Internal Server Error fetching image', { status: 500 });
    }
}
