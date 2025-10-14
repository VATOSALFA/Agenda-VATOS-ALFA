
import AgendaView from '@/components/agenda/agenda-view';
import Header from '@/components/layout/header';

export const dynamic = 'force-dynamic';

export default function Home() {
    return (
        <>
            <Header />
            <div className="pt-16">
                <AgendaView />
            </div>
        </>
    );
}
