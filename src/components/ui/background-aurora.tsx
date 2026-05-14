'use client';

import React from 'react';

const BackgroundAurora = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none mix-blend-screen opacity-60">
            <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] opacity-50 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.3),rgba(255,255,255,0))] animate-aurora"></div>
            <div className="absolute -top-[50%] -right-[50%] w-[200%] h-[200%] opacity-50 bg-[radial-gradient(circle_at_50%_50%,rgba(65,88,208,0.3),rgba(255,255,255,0))] animate-aurora-reverse"></div>
        </div>
    );
};

export default BackgroundAurora;
