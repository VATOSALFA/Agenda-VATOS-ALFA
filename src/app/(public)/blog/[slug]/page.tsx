import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostBySlug, blogPosts } from '@/data/blog-posts';
import { Scissors, Calendar, User, Clock, ChevronLeft, BookOpen } from 'lucide-react';
import { Metadata } from 'next';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
    return blogPosts.map((post) => ({
        slug: post.slug,
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = getPostBySlug(slug);
    if (!post) {
        return {
            title: 'Artículo no encontrado | VATOS ALFA',
        };
    }
    return {
        title: `${post.title} | VATOS ALFA`,
        description: post.description,
        alternates: {
            canonical: `https://vatosalfa.com/blog/${post.slug}`,
        },
        openGraph: {
            title: post.title,
            description: post.description,
            url: `https://vatosalfa.com/blog/${post.slug}`,
            type: 'article',
            publishedTime: post.date,
            authors: [post.author],
            images: [
                {
                    url: post.coverImage,
                    width: 800,
                    height: 450,
                    alt: post.title,
                }
            ],
        }
    };
}

export default async function BlogPostDetailPage({ params }: PageProps) {
    const { slug } = await params;
    const post = getPostBySlug(slug);

    if (!post) {
        notFound();
    }

    const companyName = 'VATOS ALFA Barber Shop';

    // JSON-LD structured data for BlogPosting
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.description,
        "image": post.coverImage,
        "datePublished": post.date,
        "author": {
            "@type": "Person",
            "name": post.author
        },
        "publisher": {
            "@type": "Organization",
            "name": "VATOS ALFA Barber Shop",
            "logo": {
                "@type": "ImageObject",
                "url": "https://www.vatosalfa.com/logo-vatos-alfa.png"
            }
        },
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `https://www.vatosalfa.com/blog/${post.slug}`
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600/30 font-sans">
            {/* Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-blue-500/20 bg-gradient-to-r from-[#10172b]/95 via-[#1c2847]/95 to-[#12192d]/95 backdrop-blur-xl shadow-lg">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <Link href="/" className="flex items-center gap-2 text-white hover:opacity-90 transition-opacity">
                        <img 
                            src="/logo-v-400x400.webp" 
                            alt="Vatos Alfa" 
                            className="w-8 h-8 rounded-full border border-blue-500/40 object-cover shadow-sm"
                        />
                        <span className="font-extrabold tracking-tight text-lg sm:text-xl">VATOS ALFA</span>
                    </Link>

                    <div className="flex gap-4 items-center">
                        <Link href="/blog" className="text-sm font-semibold hover:text-white transition-colors text-slate-300">
                            Blog
                        </Link>
                        <Link href="/" className="text-sm font-semibold hover:text-white transition-colors text-slate-300 hidden sm:inline">
                            Inicio
                        </Link>
                        <Link href="/reservar">
                            <button className="btn-vatos-alfa h-8 px-4 text-xs font-bold text-white rounded-lg shadow-md">
                                Reservar Cita
                            </button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Article Container */}
            <main className="flex-1 py-10 md:py-14 bg-slate-950">
                <article className="container mx-auto px-4 max-w-3xl">
                    {/* Back Button */}
                    <Link 
                        href="/blog" 
                        className="inline-flex items-center text-xs sm:text-sm font-semibold text-slate-400 hover:text-blue-400 transition-colors mb-6 group"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform" />
                        Volver a todos los artículos
                    </Link>

                    {/* Meta info */}
                    <header className="mb-8">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-4">
                            {post.category}
                        </div>
                        
                        <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-tight">
                            {post.title}
                        </h1>

                        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm text-slate-400 border-y border-slate-800 py-3">
                            <span className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-blue-400" />
                                {post.author}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                {post.date}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-blue-400" />
                                {post.readTime}
                            </span>
                        </div>
                    </header>

                    {/* Cover Image */}
                    <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl bg-slate-900 mb-10 shadow-2xl border-2 border-blue-500/30">
                        <img
                            src={post.coverImage}
                            alt={post.title}
                            className="w-full h-full object-cover"
                        />
                    </div>

                    {/* Body Content */}
                    <section 
                        className="blog-content leading-relaxed text-slate-300 text-sm sm:text-base space-y-4"
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />

                    {/* CTA Card */}
                    <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-6 sm:p-8 mt-12 text-center shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                        <div className="header-light-beam pointer-events-none opacity-40" />
                        
                        <div className="relative z-10 flex flex-col items-center">
                            <img 
                                src="/logo-v-400x400.webp" 
                                alt="Vatos Alfa" 
                                className="w-12 h-12 rounded-full border-2 border-blue-500/40 object-cover shadow-md mb-3"
                            />
                            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                                ¿Listo para renovar tu estilo?
                            </h3>
                            <p className="text-slate-300 text-xs sm:text-sm max-w-md mx-auto mb-6 leading-relaxed">
                                Agenda tu cita hoy mismo con nuestros profesionales en Querétaro y vive la experiencia premium de Vatos Alfa.
                            </p>
                            <Link href="/reservar">
                                <button className="btn-vatos-alfa h-11 px-8 text-sm font-bold text-white rounded-xl shadow-lg">
                                    Agendar Cita en Línea
                                </button>
                            </Link>
                        </div>
                    </div>
                </article>
            </main>

            {/* Footer */}
            <footer className="py-10 border-t border-slate-800 bg-slate-900 text-center text-xs text-slate-400">
                <div className="container mx-auto px-4 flex flex-col items-center gap-4">
                    <p className="font-semibold tracking-wider uppercase">© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
                    <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-400">
                        <Link href="/" className="hover:text-blue-400 transition-colors">
                            Inicio
                        </Link>
                        <Link href="/blog" className="hover:text-blue-400 transition-colors">
                            Blog
                        </Link>
                        <Link href="/privacidad" className="hover:text-blue-400 transition-colors">
                            Aviso de Privacidad
                        </Link>
                        <Link href="/terminos" className="hover:text-blue-400 transition-colors">
                            Términos y Condiciones
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
