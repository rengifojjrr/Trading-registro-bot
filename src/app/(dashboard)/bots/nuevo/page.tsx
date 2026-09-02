import { BotForm } from "@/components/bots/bot-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchBotFormOptions } from "@/lib/bots/queries";

export default async function NewBotPage() {
  const options = await fetchBotFormOptions();

  return (
    <>
      <PageHeader
        title="Nuevo bot"
        description="Con su hipótesis en una frase. Los números llegan después, fase a fase."
      />
      <Card>
        <CardContent className="pt-5">
          <BotForm options={options} />
        </CardContent>
      </Card>
    </>
  );
}
