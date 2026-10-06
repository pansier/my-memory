import * as chrono from "chrono-node";
import { Temporal } from "@js-temporal/polyfill";
export function parseDate(
  phrase: string,
  timezone = "Europe/Amsterdam",
  reference = new Date(),
) {
  const translated = phrase
    .toLowerCase()
    .replace(/overmorgen/g, "in 2 days")
    .replace(/morgen/g, "tomorrow")
    .replace(/vandaag/g, "today")
    .replace(/volgende week/g, "next week")
    .replace(/om (\d{1,2})(?::(\d{2}))?/g, (_, h, m) => `at ${h}:${m ?? "00"}`)
    .replace(/maandag/g, "monday")
    .replace(/dinsdag/g, "tuesday")
    .replace(/woensdag/g, "wednesday")
    .replace(/donderdag/g, "thursday")
    .replace(/vrijdag/g, "friday")
    .replace(/zaterdag/g, "saturday")
    .replace(/zondag/g, "sunday");
  const zoned = Temporal.Instant.from(
    reference.toISOString(),
  ).toZonedDateTimeISO(timezone);
  const wallRef = new Date(
    Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    ),
  );
  return chrono
    .parse(translated, { instant: wallRef, timezone: 0 }, { forwardDate: true })
    .map((p) => {
      const date = Temporal.ZonedDateTime.from(
        {
          timeZone: timezone,
          year: p.start.get("year")!,
          month: p.start.get("month")!,
          day: p.start.get("day")!,
          hour: p.start.get("hour")!,
          minute: p.start.get("minute")!,
        },
        { disambiguation: "reject" },
      );
      return {
        text: p.text,
        dueAt: date.toInstant().toString(),
        timeExplicit: p.start.isCertain("hour"),
      };
    });
}
