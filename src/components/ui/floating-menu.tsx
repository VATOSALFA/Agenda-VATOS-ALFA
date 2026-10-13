'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Scissors, User, ShoppingBag, Sparkles, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingMenuProps {
    totalItems: number;
    hasActivePromotions: boolean;
}

export default function FloatingMenu({ totalItems, hasActivePromotions }: FloatingMenuProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <div className={cn("hidden sm:flex fixed right-6 z-30 transition-all duration-500", totalItems > 0 ? "bottom-24" : "bottom-20 sm:bottom-24")}>
            <div className="relative flex flex-col items-center">
                <AnimatePresence>
                    {isMenuOpen && (
                        <motion.div 
                            className="flex flex-col items-center gap-4 mb-4"
                            initial="closed"
                            animate="open"
                            exit="closed"
                            variants={{
                                open: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
                                closed: { transition: { staggerChildren: 0.05, staggerDirection: -1 } }
                            }}
                        >
                            {[
                                { href: "#servicios", label: "Servicios", icon: Scissors },
                                { href: "#inspiracion", label: "Inspiración", icon: ImageIcon },
                                { href: "#profesionales", label: "Equipo", icon: User },
                                { href: "#beneficios", label: "Beneficios", icon: Sparkles },
                                { href: "#productos", label: "Productos", icon: ShoppingBag },
                            ].map((item) => (
                                <motion.div
                                    key={item.href}
                                    variants={{
                                        open: { opacity: 1, y: 0, scale: 1 },
                                        closed: { opacity: 0, y: 20, scale: 0.5 }
                                    }}
                                    className="flex items-center group"
                                >
                                    <span className="absolute right-full mr-3 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none shadow-lg">
                                        {item.label}
                                    </span>
                                    <Link href={item.href} onClick={() => setIsMenuOpen(false)} aria-label={item.label}>
                                        <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border border-blue-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:border-blue-500/60 hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all">
                                            <item.icon className="w-5 h-5 text-blue-400" />
                                        </div>
                                    </Link>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main FAB Toggle */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Abrir menú de navegación"
                    className={cn(
                        "w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-black flex items-center justify-center border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.4)] z-50 transition-transform duration-300",
                        isMenuOpen ? "rotate-45" : "rotate-0"
                    )}
                >
                    {isMenuOpen ? (
                        <X className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    ) : (
                        <div className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
                            <Image 
                                src="/icono-pagina-web.webp" 
                                alt="Vatos Alfa" 
                                fill
                                className="rounded-full object-cover border border-white/10" 
                                sizes="(max-width: 768px) 150px, 300px"
                            />
                        </div>
                    )}
                    
                    {/* Pulse effect when closed */}
                    {!isMenuOpen && (
                        <span className="absolute inset-0 rounded-full border-2 border-blue-500/50 animate-ping" />
                    )}
                </button>
            </div>
        </div>
    );
}
