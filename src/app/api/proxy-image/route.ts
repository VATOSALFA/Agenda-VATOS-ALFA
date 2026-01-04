import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return new NextResponse(`Failed to fetch remote image: ${response.statusText}`, { status: response.status });
        }

        const blob = await response.blob();
        const headers = new Headers();
        headers.set('Content-Type', response.headers.get('Content-Type') || 'image/png');
        headers.set('Cache-Control', 'public, max-age=3600'); // Cache for performance

        return new NextResponse(blob, {
            status: 200,
            headers: headers
        });

    } catch (error) {
        console.error("Proxy Image Error:", error);
        return new NextResponse('Internal Server Error fetching image', { status: 500 });
    }
}
