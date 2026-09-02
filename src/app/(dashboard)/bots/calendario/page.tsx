import { ReviewList } from "@/components/bots/review-list";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { reviewCalendar } from "@/lib/bots/calendar";
import { readBotContext } from "@/lib/bots/queries";

/**
 * El calendario de decisiones.
 *
 * Los cambios de portfolio tienen su día, y fuera de ese día no se hacen. Es
 * la regla que separa gestionar de toquetear.
 */
export default async function ReviewCalendarPage() {
  const context = await readBotContext();
  const sessions = reviewCalendar(new Date(), context.timezone, 60);

  return (
    <>
      <PageHeader
        title="Calendario de decisiones"
        description="Cada domingo veinte minutos; cada dos, los semáforos; el primero de mes, el portfolio; el de trimestre, la robustez; el de enero, las reglas."
      />
      <Card>
        <CardContent className="pt-5">
          <ReviewList sessions={sessions} timezone={context.timezone} />
        </CardContent>
      </Card>
    </>
  );
}
