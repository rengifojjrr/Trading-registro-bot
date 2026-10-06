import { rutaInterna } from "@/lib/auth/ruta-interna";

import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = rutaInterna(searchParams.next);

  return <LoginForm next={next} />;
}
