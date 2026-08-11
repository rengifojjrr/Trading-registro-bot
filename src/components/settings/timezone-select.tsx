"use client";

import { useMemo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Full runtime IANA zone list -- not a hand-curated subset. */
export function TimezoneSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const zones = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
    return [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Bogota",
      "America/Mexico_City",
      "Europe/London",
      "Europe/Madrid",
      "Asia/Tokyo",
      "Australia/Sydney",
    ];
  }, []);

  return (
    <Select name={name} defaultValue={defaultValue}>
      <SelectTrigger id={name}>
        <SelectValue placeholder="Selecciona una zona horaria" />
      </SelectTrigger>
      <SelectContent>
        {zones.map((zone) => (
          <SelectItem key={zone} value={zone}>
            {zone.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
