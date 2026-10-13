'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { blogPosts } from '@/data/blog-posts';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, User, Clock, ArrowRight, BookOpen, Search } from 'lucide-react';

export default function BlogClientPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const companyName = 'VATOS ALFA Barber Shop';

    const filteredPosts = blogPosts.filter(post => 
        post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600/30 font-sans">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-blue-500/20 bg-gradient-to-r from-[#10172b]/95 via-[#1c2847]/95 to-[#12192d]/95 backdrop-blur-xl shadow-lg">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <Link href="/" prefetch={false} className="flex items-center gap-2 text-white hover:opacity-90 transition-opacity">
                        <img 
                            src="/logo-v-400x400.webp" 
                            alt="Vatos Alfa" 
                            className="w-8 h-8 rounded-full border border-blue-500/40 object-cover shadow-sm"
                        />
                        <span className="font-extrabold tracking-tight text-lg sm:text-xl">VATOS ALFA</span>
                    </Link>

                    <div className="flex gap-4 items-center">
                        <Link href="/" prefetch={false} className="text-sm font-semibold hover:text-white transition-colors text-slate-300 hidden sm:inline">
                            Inicio
                        </Link>
                        <Link href="/reservar" prefetch={false}>
                            <Button variant="alfa" size="sm" className="h-8 px-4 text-xs font-bold shadow-md">
                                Reservar Cita
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative py-16 md:py-20 overflow-hidden bg-gradient-to-b from-[#10172b] via-slate-900 to-slate-950 border-b border-slate-800">
                <div className="header-light-beam pointer-events-none opacity-40" />
                <div className="container mx-auto px-4 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-4">
                        <BookOpen className="w-3.5 h-3.5" />
                        Estilo & Cuidado Masculino
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
                        Blog de Cuidado Masculino en Querétaro
                    </h1>
                    <p className="text-base sm:text-lg text-slate-300 max-w-[750px] mx-auto mb-8 leading-relaxed">
                        Consejos de barberos profesionales, tendencias en cortes de cabello, guías completas para barba y tips de bienestar masculino.
                    </p>

                    {/* Search Bar */}
                    <div className="max-w-md mx-auto relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar artículos (estilos, barba, cortes...)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                        />
                    </div>
                </div>
            </section>

            {/* Articles Grid */}
            <main className="flex-1 py-12 md:py-16 bg-slate-950">
                <div className="container mx-auto px-4 max-w-6xl">
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
                        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
                            Últimos Artículos Publicados
                        </h2>
                        <span className="text-xs sm:text-sm font-medium text-slate-400">
                            {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {filteredPosts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                            {filteredPosts.map((post) => (
                                <Card key={post.slug} className="bg-slate-900 border border-slate-800 overflow-hidden flex flex-col rounded-2xl hover:border-blue-500/50 hover:shadow-[0_10px_30px_rgba(59,130,246,0.12)] transition-all duration-300 group">
                                    <div className="relative aspect-video w-full overflow-hidden bg-slate-800">
                                        <img
                                            src={post.coverImage}
                                            alt={post.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute top-3 left-3 bg-[#202A49] border border-blue-500/30 text-blue-200 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md">
                                            {post.category}
                                        </div>
                                    </div>
                                    
                                    <CardHeader className="p-5 pb-3">
                                        <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
                                            <span className="flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                                {post.date}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-blue-400" />
                                                {post.readTime}
                                            </span>
                                        </div>
                                        <CardTitle className="text-lg sm:text-xl font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                                            <Link href={`/blog/${post.slug}`} prefetch={false}>
                                                {post.title}
                                            </Link>
                                        </CardTitle>
                                    </CardHeader>
                                    
                                    <CardContent className="p-5 pt-0 pb-6 flex-1">
                                        <p className="text-xs sm:text-sm text-slate-400 line-clamp-3 leading-relaxed">
                                            {post.description}
                                        </p>
                                    </CardContent>
                                    
                                    <CardFooter className="p-5 pt-3 border-t border-slate-800/80 flex items-center justify-between bg-slate-950/40">
                                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-blue-400" />
                                            {post.author}
                                        </span>
                                        <Link 
                                            href={`/blog/${post.slug}`} 
                                            prefetch={false}
                                            className="inline-flex items-center text-xs sm:text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors gap-1 group/link"
                                        >
                                            Leer artículo
                                            <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-1 transition-transform" />
                                        </Link>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                            <BookOpen className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                            <h3 className="text-lg font-bold text-white mb-1">No se encontraron artículos</h3>
                            <p className="text-sm text-slate-400">Prueba buscando con palabras clave diferentes.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="py-10 border-t border-slate-800 bg-slate-900 text-center text-xs text-slate-400">
                <div className="container mx-auto px-4 flex flex-col items-center gap-4">
                    <p className="font-semibold tracking-wider uppercase">© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
                    <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-400">
                        <Link href="/" prefetch={false} className="hover:text-blue-400 transition-colors">
                            Inicio
                        </Link>
                        <Link href="/privacidad" prefetch={false} className="hover:text-blue-400 transition-colors">
                            Aviso de Privacidad
                        </Link>
                        <Link href="/terminos" prefetch={false} className="hover:text-blue-400 transition-colors">
                            Términos y Condiciones
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
