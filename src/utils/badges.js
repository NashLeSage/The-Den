// utils/badges.js
import { getRollingWindow } from "./rollingWindow";
import { localDayKey } from "./dateKey";

// ---------------------------
// Rule thresholds (canonical)
// ---------------------------
const WINDOW_DAYS = 7;

// Badge 1
const ANCHOR_NEED_DONE_CHECKINS = 5;

// Badge 2
const BODY_NEED_GYM_DAYS = 3;

// Badge 3
const EXPLORER_NEED_EDGE_DAYS = 5;

// Badge 4 (Integrated Wolf)
const IW_NEED_CHECKINS = 7; // 7/7
const IW_NEED_GYM_DAYS = 5; // 5+ days
const IW_NEED_EDGE_DAYS = 5; // 5+ days
const IW_NEED_JOURNAL_DAYS = 7; // 7/7

// Badge 5 (Iron Wolf - Alpha Week)
const IRON_NEED_MW_YES_DAYS = 5; // 5/7
const IRON_NEED_NO_RELEASE_SESSIONS = 3; // sessions, can be same day
const EDGE_MIN_TOTAL_SEC = 30 * 60; // 30 minutes per session

// ---------------------------
// Helpers
// ---------------------------
function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function eventsInWindow(events, windowDays) {
  const set = new Set(windowDays);
  return (events || []).filter((e) => e?.day && set.has(e.day));
}

function daysWithEventType(events, windowDays, type) {
  const set = new Set(windowDays);
  const days = (events || [])
    .filter((e) => e?.type === type && e?.day && set.has(e.day))
    .map((e) => e.day);
  return uniq(days);
}

function countDoneCheckins(store, windowDays) {
  const doneMap = store.journals?.morningDoneByDay ?? {};
  const doneDays = windowDays.filter((d) => doneMap[d] === true);
  return { count: doneDays.length, days: doneDays };
}

function countMorningWoodYes(store, windowDays) {
  const daysMap = store.days ?? {};
  const yesDays = windowDays.filter((d) => daysMap[d]?.morningWood === true);
  return { count: yesDays.length, days: yesDays };
}

function dayHasAnyJournal(store, dayKey) {
  const journals = store.journals ?? {};

  // Morning journal
  if (isNonEmptyString(journals.morningByDay?.[dayKey])) return true;

  const events = store.events ?? [];

  // Edge journal: any edge_end on that day whose sessionId has a journal
  const edgeEnds = events.filter(
    (e) => e?.type === "edge_end" && e?.day === dayKey,
  );
  for (const e of edgeEnds) {
    const sid = e?.sessionId;
    if (sid && isNonEmptyString(journals.edgeBySessionId?.[sid])) return true;
  }

  // Gym journal: any gym_end on that day whose sessionId has a journal
  const gymEnds = events.filter(
    (e) => e?.type === "gym_end" && e?.day === dayKey,
  );
  for (const e of gymEnds) {
    const sid = e?.sessionId;
    if (sid && isNonEmptyString(journals.gymBySessionId?.[sid])) return true;
  }

  return false;
}

function countJournalDays(store, windowDays) {
  const days = windowDays.filter((d) => dayHasAnyJournal(store, d));
  return { count: days.length, days };
}

function countNoReleaseLongEdgeSessions(store, windowDays) {
  const set = new Set(windowDays);
  const events = store.events ?? [];

  const matches = events.filter((e) => {
    if (e?.type !== "edge_end") return false;
    if (!e?.day || !set.has(e.day)) return false;

    const outcome = e.value?.outcome;
    const totalSec = Number(e.value?.totalSec ?? 0);

    return outcome === "No Release" && totalSec >= EDGE_MIN_TOTAL_SEC;
  });

  return { count: matches.length, sessions: matches };
}

// ---------------------------
// Main
// ---------------------------
export function computeBadges(store, endDayKey = null) {
  const today = endDayKey ?? localDayKey();
  const windowDays = getRollingWindow(today, WINDOW_DAYS);

  const events = eventsInWindow(store.events ?? [], windowDays);

  // Rolling window metrics
  const checkins = countDoneCheckins(store, windowDays);

  const gymDays = daysWithEventType(events, windowDays, "gym_end");
  const edgeDays = daysWithEventType(events, windowDays, "edge_end");

  const journals = countJournalDays(store, windowDays);
  const woodYes = countMorningWoodYes(store, windowDays);

  const noReleaseLongEdges = countNoReleaseLongEdgeSessions(store, windowDays);

  // Badge unlocks (canonical)
  const anchor = checkins.count >= ANCHOR_NEED_DONE_CHECKINS;

  const body = gymDays.length >= BODY_NEED_GYM_DAYS;

  const explorer = edgeDays.length >= EXPLORER_NEED_EDGE_DAYS;

  const integratedWolf =
    checkins.count >= IW_NEED_CHECKINS &&
    gymDays.length >= IW_NEED_GYM_DAYS &&
    edgeDays.length >= IW_NEED_EDGE_DAYS &&
    journals.count >= IW_NEED_JOURNAL_DAYS;

  const ironWolf =
    integratedWolf &&
    woodYes.count >= IRON_NEED_MW_YES_DAYS &&
    noReleaseLongEdges.count >= IRON_NEED_NO_RELEASE_SESSIONS;

  return {
    windowDays,

    unlocked: {
      anchor,
      body,
      explorer,
      integratedWolf,
      ironWolf,
    },

    // Progress info for modals / UI
    progress: {
      anchor: { have: checkins.count, need: ANCHOR_NEED_DONE_CHECKINS },

      body: { have: gymDays.length, need: BODY_NEED_GYM_DAYS },

      explorer: { have: edgeDays.length, need: EXPLORER_NEED_EDGE_DAYS },

      integratedWolf: {
        checkins: { have: checkins.count, need: IW_NEED_CHECKINS },
        gymDays: { have: gymDays.length, need: IW_NEED_GYM_DAYS },
        edgeDays: { have: edgeDays.length, need: IW_NEED_EDGE_DAYS },
        journalDays: { have: journals.count, need: IW_NEED_JOURNAL_DAYS },
      },

      ironWolf: {
        baseIntegratedWolf: { ok: integratedWolf },
        morningWoodYesDays: {
          have: woodYes.count,
          need: IRON_NEED_MW_YES_DAYS,
        },
        noReleaseLongEdgeSessions: {
          have: noReleaseLongEdges.count,
          need: IRON_NEED_NO_RELEASE_SESSIONS,
        },
      },
    },
  };
}
