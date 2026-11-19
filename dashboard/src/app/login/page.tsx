import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Anmelden · Custos Horti" };

export default function Page() {
  return (
    <div className="login-wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
