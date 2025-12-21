import { CustomLoader } from "@/components/ui/custom-loader";

export default function Loading() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background/80 backdrop-blur-sm">
            <CustomLoader size={80} />
        </div>
    );
}
