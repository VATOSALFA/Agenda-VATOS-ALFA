
import Link from 'next/link'
import { Button } from '@/components/ui/button'
 
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center">
      <h2 className="text-4xl font-bold mb-4">Página No Encontrada</h2>
      <p className="text-muted-foreground mb-6">No pudimos encontrar la página que estás buscando.</p>
      <Button asChild>
        <Link href="/">Volver al Inicio</Link>
      </Button>
    </div>
  )
}
