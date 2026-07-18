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
        openGraph: {
            title: post.title,
            description: post.description,
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
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
            {/* Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

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
                        <Link href="/blog" className="text-sm font-medium hover:text-white transition-colors text-slate-300">
                            Blog
                        </Link>
                        <Link href="/" className="text-sm font-medium hover:text-white transition-colors text-slate-300">
                            Inicio
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Article Container */}
            <main className="flex-1 py-12 bg-slate-950">
                <article className="container mx-auto px-4 max-w-3xl">
                    {/* Back Button */}
                    <Link 
                        href="/blog" 
                        className="inline-flex items-center text-sm font-semibold text-slate-400 hover:text-blue-400 transition-colors mb-8 group"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform" />
                        Volver al Blog
                    </Link>

                    {/* Meta info */}
                    <header className="mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4">
                            {post.category}
                        </div>
                        
                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-tight">
                            {post.title}
                        </h1>

                        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400 border-y border-slate-850 py-3">
                            <span className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                {post.author}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4" />
                                {post.date}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4" />
                                {post.readTime}
                            </span>
                        </div>
                    </header>

                    {/* Cover Image */}
                    <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl bg-slate-850 mb-10 shadow-lg border border-slate-800">
                        <img
                            src={post.coverImage}
                            alt={post.title}
                            className="w-full h-full object-cover"
                        />
                    </div>

                    {/* Body Content */}
                    <section 
                        className="blog-content leading-relaxed text-slate-300"
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                </article>
            </main>

            {/* Footer */}
            <footer className="py-12 border-t border-slate-800 bg-slate-900 text-center text-sm text-slate-400">
                <div className="container mx-auto px-4 flex flex-col items-center gap-4">
                    <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
                    <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-400">
                        <Link href="/" className="hover:underline hover:text-blue-400 transition-colors">
                            Inicio
                        </Link>
                        <Link href="/blog" className="hover:underline hover:text-blue-400 transition-colors">
                            Blog
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
