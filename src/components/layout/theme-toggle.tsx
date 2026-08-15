"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, THEME_LIGHT_CLASS, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // Read the attribute the server already rendered, rather than guessing
    // again on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting the server-rendered value; reading the DOM during render is not allowed.
    setTheme(document.documentElement.classList.contains(THEME_LIGHT_CLASS) ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    // Applied immediately so the switch feels instant, and persisted so the
    // next server render agrees with what's already on screen.
    document.documentElement.classList.toggle(THEME_LIGHT_CLASS, next === "light");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
