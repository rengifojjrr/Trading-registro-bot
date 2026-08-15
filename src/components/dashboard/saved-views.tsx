"use client";

import { Bookmark, Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { deleteView, saveView, type SavedViewState } from "@/app/(dashboard)/saved-views-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SavedView {
  id: string;
  name: string;
  path: string;
  query: string;
}

const initialState: SavedViewState = { error: null, success: false };

/**
 * Named filter combinations for the current page.
 *
 * "Only my losing shorts in the New York session" is a question worth
 * asking every week and tedious to rebuild every time. Because the filters
 * live in the URL, saving one is just storing the query string -- and the
 * chips below are ordinary links, so they work with the back button and can
 * be opened in a new tab like anything else.
 */
export function SavedViews({ views }: { views: SavedView[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const [state, formAction, pending] = useActionState(saveView, initialState);
  const [removing, startRemoving] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // The form stays inline rather than behind a toggle: a toggle would need
  // to be closed on success from inside an effect, and clearing the input
  // is both simpler and lets several views be saved in a row.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      toast.success("Vista guardada.");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const alreadySaved = views.some((v) => v.query === query);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.map((view) => (
        <span
          key={view.id}
          className="group flex items-center gap-1 rounded-full border border-border bg-secondary/40 pr-1 text-sm"
        >
          <Link
            href={view.query ? `${view.path}?${view.query}` : view.path}
            className="rounded-full py-1 pl-3 transition-colors hover:text-primary"
          >
            {view.name}
          </Link>
          <button
            type="button"
            aria-label={`Borrar la vista ${view.name}`}
            disabled={removing}
            onClick={() => startRemoving(async () => void (await deleteView(view.id, view.path)))}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-negative"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}

      <form action={formAction} ref={formRef} className="flex items-center gap-1.5">
        <input type="hidden" name="path" value={pathname} />
        <input type="hidden" name="query" value={query} />
        <Input
          name="name"
          placeholder="Guardar estos filtros como…"
          className="h-8 w-52"
          maxLength={60}
          required
          disabled={alreadySaved}
        />
        <Button type="submit" size="sm" variant="ghost" disabled={pending || alreadySaved}>
          {pending ? <Loader2 className="animate-spin" /> : <Bookmark className="size-4" aria-hidden />}
          {alreadySaved ? "Ya guardada" : "Guardar vista"}
        </Button>
      </form>

    </div>
  );
}
