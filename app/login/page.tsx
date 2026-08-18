import { Suspense } from "react";
import { CinematicLogin } from "@/components/ui/cinematic-login";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-black" />}>
      <CinematicLogin />
    </Suspense>
  );
}
