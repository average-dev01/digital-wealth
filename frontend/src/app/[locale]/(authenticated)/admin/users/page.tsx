import { Suspense } from "react";
import { AdminUsersPage } from "./users-page";

// Server wrapper so `useSearchParams()` in the client page (the `?kyc=` deep
// link from the overview cards) sits inside a Suspense boundary — same shape as
// the public /auth route.
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminUsersPage />
    </Suspense>
  );
}
