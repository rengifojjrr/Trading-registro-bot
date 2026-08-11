import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const nextParam = searchParams.next;
  const next =
    typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/";

  return <LoginForm next={next} />;
}
