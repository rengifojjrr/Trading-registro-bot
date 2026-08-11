export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="size-2 rounded-full bg-primary" />
        Trading Registro Bot
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
