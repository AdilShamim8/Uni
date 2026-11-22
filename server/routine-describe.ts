// The words the routine card shows a person about its schedule — the cadence,
// the restrictions, the consequence and the weekday phrases — in the
// conversation's language. Split from routine-requests.ts, which stays within
// its file-size ratchet; the card assembly itself stays there.
import { byLanguage } from "./language.ts";
import { formatInstant, routineCronText } from "./routine-cron-text.ts";
import { plainClock, plainTimeZone } from "../shared/plain-time-zone.ts";
import { serverLine } from "./server-lines.ts";
import { intervalHasRestrictions } from "./routines.ts";
import type { LimitResetEngines, RoutineRequestSchedule } from "./routine-requests.ts";

/** The weekday phrase in the conversation's language, from the pack and Intl day names (as routine-cron-text words them). */
function saidWeekdays(weekdays: readonly number[], language?: string): string {
  const days = [...weekdays].sort((a, b) => a - b).join(",");
  const locale = byLanguage({ en: "en-US", de: "de-DE", "pt-br": "pt-BR", zh: "zh-CN", "zh-tw": "zh-TW" }, language);
  const dayName = (day: number) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(Date.UTC(2023, 0, 1 + day));
  if (days === "0,1,2,3,4,5,6") return serverLine(language, "server.time.weekdays.everyDay");
  if (days === "1,2,3,4,5") return serverLine(language, "server.time.weekdays.weekdays");
  return serverLine(language, "server.time.weekdays.list", { days: weekdays.map((day) => dayName(day)).join(", ") });
}

export function scheduleText(schedule: RoutineRequestSchedule, timeZone: string, engines?: LimitResetEngines, language?: string): string {
  if (schedule.type === "cron") return `${routineCronText(schedule, language)} · Cron: ${schedule.expression}`;
  if (schedule.type === "limit_reset") {
    const name = engines?.name(schedule.engine) ?? schedule.engine;
    return schedule.repeat === "every_reset"
      ? serverLine(language, "server.routines.limitReset.every", { name })
      : serverLine(language, "server.routines.limitReset.once", { name });
  }
  const zone = plainTimeZone(timeZone);
  if (schedule.type === "once") return `${formatInstant(schedule.at, timeZone)} ${zone}`;
  if (schedule.type === "interval") {
    const restricted = intervalHasRestrictions(schedule);
    const cadence = schedule.anchorAt === undefined
      ? restricted
        ? serverLine(language, "server.routines.schedule.intervalDeferred", { minutes: schedule.everyMinutes })
        : serverLine(language, "server.routines.schedule.intervalPlain", { minutes: schedule.everyMinutes })
      : serverLine(language, "server.routines.schedule.intervalAnchored", { minutes: schedule.everyMinutes, instant: formatInstant(schedule.anchorAt, timeZone), zone });
    const restrictions = [
      schedule.weekdays?.length
        ? serverLine(language, "server.routines.schedule.weekdaysInZone", { weekdays: saidWeekdays(schedule.weekdays, language), zone })
        : null,
      schedule.window ? serverLine(language, "server.routines.schedule.duringWindow", { start: plainClock(schedule.window.start), end: plainClock(schedule.window.end), zone }) : null,
      schedule.endsAt !== undefined ? serverLine(language, "server.routines.schedule.until", { instant: formatInstant(schedule.endsAt, timeZone), zone }) : null,
    ].filter((part): part is string => part !== null);
    return restrictions.length ? `${cadence} · ${restrictions.join(" · ")}` : cadence;
  }
  return serverLine(language, "server.routines.schedule.weekdaysAt", { weekdays: saidWeekdays(schedule.weekdays, language), time: plainClock(schedule.time), zone });
}

export function consequenceLine(schedule: RoutineRequestSchedule, continuity = false, sameConversation = false, language?: string): string {
  const session = sameConversation
    ? serverLine(language, "server.routines.card.sessionContinues")
    : continuity
      ? serverLine(language, "server.routines.card.sessionFreshReport")
      : serverLine(language, "server.routines.card.sessionFresh");
  if (schedule.type === "cron") return serverLine(language, "server.routines.card.willRunCron", { zone: plainTimeZone(schedule.timeZone), session });
  if (schedule.type === "once") return sameConversation ? serverLine(language, "server.routines.card.onceContinues") : serverLine(language, "server.routines.card.willRunOnce");
  if (schedule.type === "limit_reset") {
    return schedule.repeat === "every_reset"
      ? serverLine(language, "server.routines.card.willRunAfterEveryReset")
      : serverLine(language, "server.routines.card.willRunAfterReset");
  }
  if (schedule.type === "interval") {
    if (intervalHasRestrictions(schedule)) {
      return serverLine(language, "server.routines.card.willRunRestricted", { minutes: schedule.everyMinutes, session });
    }
    const runsPerDay = Math.round(1440 / schedule.everyMinutes);
    const cadence = runsPerDay <= 1
      ? serverLine(language, "server.routines.card.aboutOnceADay")
      : serverLine(language, "server.routines.card.aboutTimesADay", { count: runsPerDay });
    return serverLine(language, "server.routines.card.willRunCadence", { cadence, session });
  }
  const days = schedule.weekdays.length;
  const cadence = days === 7
    ? serverLine(language, "server.routines.card.everyDay")
    : days === 1
      ? serverLine(language, "server.routines.card.oneDayAWeek")
      : serverLine(language, "server.routines.card.daysAWeek", { count: days });
  return serverLine(language, "server.routines.card.willRunCadence", { cadence, session });
}
