'use client';

import React, { useState, useEffect, useRef } from 'react';

interface LazySectionProps {
  children: React.ReactNode;
  minHeight?: string;
  forceMount?: boolean;
  rootMargin?: string;
  className?: string;
}

export function LazySection({
  children,
  minHeight = '400px',
  forceMount = false,
  rootMargin = '450px 0px',
  className,
}: LazySectionProps) {
  const [shouldMount, setShouldMount] = useState(forceMount);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceMount) {
      setShouldMount(true);
    }
  }, [forceMount]);

  useEffect(() => {
    if (shouldMount) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [shouldMount, rootMargin]);

  if (shouldMount) {
    return <>{children}</>;
  }

  return <div ref={containerRef} style={{ minHeight }} className={className} aria-hidden="true" />;
}
