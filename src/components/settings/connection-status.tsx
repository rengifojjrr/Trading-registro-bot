import { CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRotation } from "@/components/settings/key-rotation";
import { TestCoinbaseConnection } from "@/components/settings/test-coinbase-connection";
import { serverEnv } from "@/lib/env";
import { keyAgeInDays } from "@/lib/key-rotation";

function StatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {configured ? (
        <CheckCircle2 className="size-4 text-positive" aria-hidden />
      ) : (
        <XCircle className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span className={configured ? "text-foreground" : "text-muted-foreground"}>
        {label}: {configured ? "configurado" : "no configurado"}
      </span>
    </div>
  );
}

/**
 * Reads only whether server secrets are *present*, never their value --
 * this component must never render a key, token, or any substring of one.
 */
export function ConnectionStatus({
  keyRotatedAt,
  timezone,
}: {
  keyRotatedAt: string | null;
  timezone: string;
}) {
  const env = serverEnv();
  const coinbaseConfigured = Boolean(
    env.COINBASE_CDP_API_KEY_NAME && env.COINBASE_CDP_PRIVATE_KEY,
  );
  const notionConfigured = Boolean(env.NOTION_API_TOKEN && env.NOTION_DATABASE_ID);

  // Resolved on the server: the age would otherwise be read from the
  // client's clock at hydration and disagree with the server's render.
  const keyAgeDays = keyAgeInDays(keyRotatedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integraciones</CardTitle>
        <CardDescription>
          Las claves viven solo en variables de entorno del servidor. Para rotarlas o
          revocarlas, actualiza el secreto en tu proveedor de hosting (o `.env.local` en
          desarrollo) y reinicia la aplicación -- ver README.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatusRow label="Coinbase Advanced (solo lectura)" configured={coinbaseConfigured} />
        {coinbaseConfigured ? (
          <>
            <TestCoinbaseConnection />
            <KeyRotation rotatedAt={keyRotatedAt} ageDays={keyAgeDays} timezone={timezone} />
          </>
        ) : null}
        <StatusRow label="Notion" configured={notionConfigured} />
      </CardContent>
    </Card>
  );
}
