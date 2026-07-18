'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { blogPosts } from '@/data/blog-posts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { VatosButton } from '@/components/ui/vatos-button';
import { Scissors, Calendar, User, Clock, ArrowRight, BookOpen, Search } from 'lucide-react';

export default function BlogLandingPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const companyName = 'VATOS ALFA Barber Shop';

    const filteredPosts = blogPosts.filter(post => 
        post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        <Link href="/" className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors">
                            <Scissors className="h-6 w-6 text-primary" />
                            <span>VATOS ALFA</span>
                        </Link>
                    </div>

                    <div className="flex gap-4 items-center">
                        <Link href="/" className="text-sm font-medium hover:text-white transition-colors text-slate-300">
                            Inicio
                        </Link>
                        <Link href="/reservar">
                            <VatosButton variant="default" size="sm">Reservar Cita</VatosButton>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative py-16 md:py-24 overflow-hidden bg-slate-900 border-b border-slate-850">
                <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />
                <div className="container mx-auto px-4 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4 animate-pulse">
                        <BookOpen className="w-3.5 h-3.5" />
                        Estilo & Cuidado Masculino
                    </div>
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
                        Blog de Cuidado Masculino en Querétaro
                    </h1>
                    <p className="text-lg md:text-xl text-slate-300 max-w-[750px] mx-auto mb-10 leading-relaxed">
                        Consejos de expertos, tendencias de cortes de cabello, guías de cuidado de barba y tips de bienestar masculino especialmente diseñados para el clima de Querétaro.
                    </p>

                    {/* Search Bar */}
                    <div className="max-w-md mx-auto relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Buscar artículos (estilos, barba, cortes...)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                    </div>
                </div>
            </section>

            {/* Articles Grid */}
            <main className="flex-1 py-16 bg-slate-950">
                <div className="container mx-auto px-4 max-w-6xl">
                    <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white flex items-center gap-3">
                        Últimos Artículos Publicados
                        <span className="text-sm font-normal text-slate-400">({filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''})</span>
                    </h2>

                    {filteredPosts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {filteredPosts.map((post) => (
                                <Card key={post.slug} className="bg-slate-900 border border-slate-800 overflow-hidden flex flex-col hover:border-slate-700 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 group">
                                    <div className="relative aspect-video w-full overflow-hidden bg-slate-850">
                                        <img
                                            src={post.coverImage}
                                            alt={post.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-md shadow-md">
                                            {post.category}
                                        </div>
                                    </div>
                                    
                                    <CardHeader className="p-5 pb-3">
                                        <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {post.date}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                {post.readTime}
                                            </span>
                                        </div>
                                        <CardTitle className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                                            <Link href={`/blog/${post.slug}`}>
                                                {post.title}
                                            </Link>
                                        </CardTitle>
                                    </CardHeader>
                                    
                                    <CardContent className="p-5 pt-0 pb-6 flex-1">
                                        <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">
                                            {post.description}
                                        </p>
                                    </CardContent>
                                    
                                    <CardFooter className="p-5 pt-0 border-t border-slate-850 flex items-center justify-between">
                                        <span className="text-xs text-slate-400 flex items-center gap-1">
                                            <User className="w-3.5 h-3.5" />
                                            {post.author}
                                        </span>
                                        <Link 
                                            href={`/blog/${post.slug}`} 
                                            className="inline-flex items-center text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors gap-1.5"
                                        >
                                            Leer artículo
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </Link>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl">
                            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">No se encontraron artículos</h3>
                            <p className="text-slate-400">Prueba buscando con palabras clave diferentes.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="py-12 border-t border-slate-800 bg-slate-900 text-center text-sm text-slate-400">
                <div className="container mx-auto px-4 flex flex-col items-center gap-4">
                    <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
                    <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-400">
                        <Link href="/" className="hover:underline hover:text-blue-400 transition-colors">
                            Inicio
                        </Link>
                        <Link href="/privacidad" className="hover:underline hover:text-blue-400 transition-colors">
                            Aviso de Privacidad
                        </Link>
                        <Link href="/terminos" className="hover:underline hover:text-blue-400 transition-colors">
                            Términos y Condiciones
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
