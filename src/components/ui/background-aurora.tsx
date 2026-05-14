'use client';

import React, { useEffect, useRef, useState } from 'react';

const BackgroundAurora = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        setIsMobile(window.innerWidth < 768);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let width = 0;
        let height = 0;

        // Stars configuration — fewer on mobile for performance
        const STAR_COUNT = isMobile ? 80 : 200;
        const NEBULA_COUNT = isMobile ? 3 : 5;

        interface Star {
            x: number;
            y: number;
            radius: number;
            opacity: number;
            twinkleSpeed: number;
            twinkleOffset: number;
        }

        interface Nebula {
            x: number;
            y: number;
            radiusX: number;
            radiusY: number;
            hue: number;
            opacity: number;
            driftX: number;
            driftY: number;
        }

        let stars: Star[] = [];
        let nebulae: Nebula[] = [];

        const resize = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            width = parent.clientWidth;
            height = parent.clientHeight;
            const dpr = Math.min(window.devicePixelRatio, isMobile ? 1 : 2);
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.scale(dpr, dpr);
        };

        const initStars = () => {
            stars = Array.from({ length: STAR_COUNT }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 1.5 + 0.3,
                opacity: Math.random() * 0.8 + 0.2,
                twinkleSpeed: Math.random() * 0.02 + 0.005,
                twinkleOffset: Math.random() * Math.PI * 2,
            }));
        };

        const initNebulae = () => {
            nebulae = Array.from({ length: NEBULA_COUNT }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                radiusX: Math.random() * 200 + 100,
                radiusY: Math.random() * 150 + 80,
                hue: 200 + Math.random() * 60, // Blue-purple range
                opacity: 0.04 + Math.random() * 0.04,
                driftX: (Math.random() - 0.5) * 0.15,
                driftY: (Math.random() - 0.5) * 0.1,
            }));
        };

        resize();
        initStars();
        initNebulae();

        let time = 0;
        // On mobile, throttle to ~20fps (every 3 frames) for battery savings
        let frameCount = 0;
        const FRAME_SKIP = isMobile ? 3 : 1;

        const draw = () => {
            frameCount++;
            if (frameCount % FRAME_SKIP !== 0) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            time += 0.016 * FRAME_SKIP;

            ctx.clearRect(0, 0, width, height);

            // Draw nebulae (soft glowing clouds)
            for (const n of nebulae) {
                const nx = n.x + Math.sin(time * 0.3 + n.hue) * 20 * n.driftX;
                const ny = n.y + Math.cos(time * 0.2 + n.hue) * 15 * n.driftY;

                const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.radiusX);
                grad.addColorStop(0, `hsla(${n.hue}, 70%, 50%, ${n.opacity})`);
                grad.addColorStop(0.5, `hsla(${n.hue + 20}, 60%, 40%, ${n.opacity * 0.5})`);
                grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.ellipse(nx, ny, n.radiusX, n.radiusY, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw stars with twinkling
            for (const s of stars) {
                const twinkle = Math.sin(time * s.twinkleSpeed * 60 + s.twinkleOffset);
                const alpha = s.opacity * (0.5 + 0.5 * twinkle);

                ctx.fillStyle = `rgba(220, 230, 255, ${alpha})`;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            animationId = requestAnimationFrame(draw);
        };

        draw();

        window.addEventListener('resize', () => {
            resize();
            initStars();
            initNebulae();
        });

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resize);
        };
    }, [isMobile]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-0 pointer-events-none"
            aria-hidden="true"
        />
    );
};

export default BackgroundAurora;
