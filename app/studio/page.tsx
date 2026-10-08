import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StudioApp } from "./studio-app";

export default function StudioPage() {
  return (
    <Suspense fallback={<StudioFallback />}>
      <ProtectedStudio />
    </Suspense>
  );
}

async function ProtectedStudio() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return (
    <StudioApp
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
    />
  );
}

function StudioFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper text-ink">
      <p className="text-sm text-muted">Opening your studio…</p>
    </div>
  );
}
