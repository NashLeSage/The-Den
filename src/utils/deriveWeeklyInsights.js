// src/utils/deriveWeeklyInsights.js
// Deterministic, side-effect free, defensive.
// Computes weekly summary + signals/triggers + moments worth revisiting.

function clampNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function dayKeyToDate(dayKey) {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToDayKey(dt) {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dayKey, delta) {
  const dt = dayKeyToDate(dayKey);
  dt.setDate(dt.getDate() + delta);
  return dateToDayKey(dt);
}

// weekStartsOn: 1 = Monday (AU-friendly). 0 = Sunday.
function startOfWeek(dayKey, weekStartsOn = 1) {
  const dt = dayKeyToDate(dayKey);
  const dow = dt.getDay(); // 0 Sun .. 6 Sat
  const diff = (dow - weekStartsOn + 7) % 7;
  dt.setDate(dt.getDate() - diff);
  return dateToDayKey(dt);
}

function buildWeekKeys(weekStartKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
}

function avg(nums) {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(nums) {
  const xs = nums
    .filter((n) => Number.isFinite(n))
    .slice()
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function distCount(arr) {
  const out = {};
  for (const x of arr) {
    if (!x) continue;
    out[x] = (out[x] ?? 0) + 1;
  }
  return out;
}

function preview(text, n = 120) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n).trimEnd() + "…";
}

function confidenceFromN(n, diffAbs) {
  if (n >= 7 && diffAbs >= 0.8) return "High";
  if (n >= 4 && diffAbs >= 0.6) return "Medium";
  if (n >= 4) return "Medium";
  return "Low";
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "-";
  return String(Math.round(n * 10) / 10);
}

// ✅ Support both shapes:
// - days[dayKey] = { restore, quality, ... }
// - days[dayKey] = { entry: { restore, quality, ... }, ... }
function getDayEntry(days, dayKey) {
  const raw = days?.[dayKey];
  if (!raw) return null;
  if (
    raw &&
    typeof raw === "object" &&
    raw.entry &&
    typeof raw.entry === "object"
  ) {
    return raw.entry;
  }
  return raw;
}

function parseMW(x) {
  // supports boolean, 0/1, "yes"/"no"
  if (typeof x === "boolean") return x;
  if (x === 1) return true;
  if (x === 0) return false;
  if (typeof x === "string") {
    const t = x.trim().toLowerCase();
    if (t === "yes" || t === "y" || t === "true") return true;
    if (t === "no" || t === "n" || t === "false") return false;
  }
  return null;
}

function getGymTotalSec(val) {
  // Try a few likely shapes
  const v = val ?? {};
  const a = clampNum(v.totalSec);
  if (a != null) return a;

  const b = clampNum(v.durationSec);
  if (b != null) return b;

  const c = clampNum(v.activeSec);
  if (c != null) return c;

  const mins = clampNum(v.totalMinutes ?? v.minutes ?? v.durationMinutes);
  if (mins != null) return mins * 60;

  return null;
}

function compareGroups({
  aVals,
  bVals,
  metricLabel,
  title,
  basedOn,
  tryNextWeek,
}) {
  const aAvg = avg(aVals);
  const bAvg = avg(bVals);
  if (aAvg == null || bAvg == null) return null;

  const diff = aAvg - bAvg;
  const diffAbs = Math.abs(diff);

  const totalPoints = aVals.length + bVals.length;
  if (totalPoints < 4) return null;

  const conf = confidenceFromN(totalPoints, diffAbs);

  const direction =
    diff > 0.15 ? "higher" : diff < -0.15 ? "lower" : "about the same";

  const finding =
    direction === "about the same"
      ? `${metricLabel} looked about the same between the two conditions.`
      : `${metricLabel} tended to be ${direction} in the “${basedOn.aLabel}” days.`;

  return {
    title,
    finding: `${finding} (${basedOn.aLabel}: ${fmtNum(aAvg)} vs ${basedOn.bLabel}: ${fmtNum(bAvg)})`,
    confidence: conf,
    basedOn: `${basedOn.metric} across ${basedOn.aLabel} (n=${aVals.length}) vs ${basedOn.bLabel} (n=${bVals.length}).`,
    suggestion: tryNextWeek || null,
    _score:
      (conf === "High" ? 3 : conf === "Medium" ? 2 : 1) * (diffAbs + 0.25),
    _diff: diff,
  };
}

export function deriveWeeklyInsights(payload, weekStartDayKey) {
  const days = payload?.days ?? payload?.payload?.days ?? {};
  const events = payload?.events ?? payload?.payload?.events ?? [];
  const journals = payload?.journals ?? payload?.payload?.journals ?? {};

  const weekStartKey = startOfWeek(weekStartDayKey, 1);
  const weekKeys = buildWeekKeys(weekStartKey);
  const weekKeySet = new Set(weekKeys);

  // Day entries (defensive shape)
  const dayEntries = weekKeys.map((k) => ({
    day: k,
    entry: getDayEntry(days, k),
  }));

  const restoreVals = dayEntries
    .map((d) => clampNum(d.entry?.restore))
    .filter((x) => x != null);
  const qualityVals = dayEntries
    .map((d) => clampNum(d.entry?.quality))
    .filter((x) => x != null);
  const stressVals = dayEntries
    .map((d) => clampNum(d.entry?.stress))
    .filter((x) => x != null);
  const libidoVals = dayEntries
    .map((d) => clampNum(d.entry?.libido))
    .filter((x) => x != null);

  const mwParsed = dayEntries.map((d) => parseMW(d.entry?.morningWood));
  const mwCount = mwParsed.reduce((acc, v) => acc + (v === true ? 1 : 0), 0);
  const mwKnown = mwParsed.reduce(
    (acc, v) => acc + (v === true || v === false ? 1 : 0),
    0,
  );

  const edgeEnds = events
    .filter((e) => e?.type === "edge_end" && weekKeySet.has(e?.day))
    .slice()
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  const gymEnds = events
    .filter((e) => e?.type === "gym_end" && weekKeySet.has(e?.day))
    .slice()
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  const alcDrinks = events
    .filter((e) => e?.type === "alc_drink" && weekKeySet.has(e?.day))
    .slice()
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  // Edge totals
  const edgeTotalSec = edgeEnds
    .map((e) => clampNum(e.value?.totalSec))
    .filter((x) => x != null);
  const edgeTotalMinutes = edgeTotalSec.reduce((a, b) => a + b, 0) / 60;
  const edgeAvgSec = avg(edgeTotalSec);

  const edgeOutcomes = edgeEnds
    .map((e) => e.value?.outcome ?? "")
    .filter(Boolean);
  const edgeOutcomeDist = distCount(edgeOutcomes);

  const releaseCount = edgeOutcomes.filter(
    (o) => o && o !== "No Release",
  ).length;
  const noReleaseCount = edgeOutcomes.filter((o) => o === "No Release").length;

  // Gym totals (defensive)
  const gymTotalSec = gymEnds
    .map((e) => getGymTotalSec(e.value))
    .filter((x) => x != null);
  const gymTotalMin = gymTotalSec.reduce((a, b) => a + b, 0) / 60;

  const gymIntensityDist = distCount(
    gymEnds
      .map((e) => e.value?.intensity ?? e.value?.level ?? e.value?.type ?? "")
      .filter(Boolean),
  );

  // Alcohol totals (still tracked internally)
  const alcTotalStd = alcDrinks
    .map((e) => clampNum(e.value?.stdDrinks))
    .filter((x) => x != null)
    .reduce((a, b) => a + b, 0);

  const alcDays = new Set(alcDrinks.map((e) => e.day));
  const alcDayCount = alcDays.size;

  // -------- Signals & triggers candidates --------
  const signals = [];
  const nextDayKey = (k) => addDays(k, 1);

  // ✅ Alcohol is ONLY used if negative impact appears (restore/quality worse next day)
  let alcoholSleepNote = null;
  {
    const nextRestoreAfterAlcohol = [];
    const nextRestoreAfterNoAlcohol = [];
    const nextQualityAfterAlcohol = [];
    const nextQualityAfterNoAlcohol = [];

    for (const k of weekKeys) {
      const next = nextDayKey(k);
      if (!weekKeySet.has(next)) continue;

      const nextEntry = getDayEntry(days, next);
      const r = clampNum(nextEntry?.restore);
      const q = clampNum(nextEntry?.quality);

      const hadAlcohol = alcDays.has(k);

      if (r != null)
        (hadAlcohol ? nextRestoreAfterAlcohol : nextRestoreAfterNoAlcohol).push(
          r,
        );
      if (q != null)
        (hadAlcohol ? nextQualityAfterAlcohol : nextQualityAfterNoAlcohol).push(
          q,
        );
    }

    const restoreCard = compareGroups({
      aVals: nextRestoreAfterAlcohol,
      bVals: nextRestoreAfterNoAlcohol,
      metricLabel: "Next-day restore",
      title: "Alcohol and next-day restore",
      basedOn: {
        metric: "restore",
        aLabel: "after alcohol",
        bLabel: "after no alcohol",
      },
      tryNextWeek: null,
    });

    const qualityCard = compareGroups({
      aVals: nextQualityAfterAlcohol,
      bVals: nextQualityAfterNoAlcohol,
      metricLabel: "Next-day sleep quality",
      title: "Alcohol and next-day sleep quality",
      basedOn: {
        metric: "quality",
        aLabel: "after alcohol",
        bLabel: "after no alcohol",
      },
      tryNextWeek: null,
    });

    // Only keep if alcohol makes it WORSE (diff < 0)
    const negativeRestore = restoreCard && restoreCard._diff < -0.15;
    const negativeQuality = qualityCard && qualityCard._diff < -0.15;

    if (negativeRestore || negativeQuality) {
      const chosen = negativeQuality ? qualityCard : restoreCard;
      alcoholSleepNote =
        chosen?.finding ?? "Sleep metrics looked lower after alcohol days.";
      if (chosen) signals.push(chosen);
    }
  }

  // Restore (median) -> morningWood
  {
    const med = median(restoreVals);
    if (med != null) {
      const high = [];
      const low = [];

      for (const k of weekKeys) {
        const entry = getDayEntry(days, k);
        const r = clampNum(entry?.restore);
        const mw = parseMW(entry?.morningWood);
        if (r == null || mw == null) continue;
        if (r >= med) high.push(mw ? 1 : 0);
        else low.push(mw ? 1 : 0);
      }

      const card = compareGroups({
        aVals: high,
        bVals: low,
        metricLabel: "Morning wood frequency",
        title: "Restore and morning wood",
        basedOn: {
          metric: "morningWood (0/1)",
          aLabel: `restore ≥ weekly median (${fmtNum(med)})`,
          bLabel: `restore < weekly median`,
        },
        tryNextWeek:
          "Protect bedtime on 2–3 nights and see what morning wood does.",
      });

      if (card) signals.push(card);
    }
  }

  // Gym days -> same-day stress OR next-day restore
  {
    const gymDaySet = new Set(gymEnds.map((e) => e.day));

    const stressGym = [];
    const stressNon = [];
    for (const k of weekKeys) {
      const entry = getDayEntry(days, k);
      const s = clampNum(entry?.stress);
      if (s == null) continue;
      if (gymDaySet.has(k)) stressGym.push(s);
      else stressNon.push(s);
    }

    const restoreNextGym = [];
    const restoreNextNon = [];
    for (const k of weekKeys) {
      const next = nextDayKey(k);
      if (!weekKeySet.has(next)) continue;

      const nextEntry = getDayEntry(days, next);
      const r = clampNum(nextEntry?.restore);
      if (r == null) continue;

      if (gymDaySet.has(k)) restoreNextGym.push(r);
      else restoreNextNon.push(r);
    }

    const cardA = compareGroups({
      aVals: stressGym,
      bVals: stressNon,
      metricLabel: "Same-day stress",
      title: "Gym and stress",
      basedOn: { metric: "stress", aLabel: "gym days", bLabel: "non-gym days" },
      tryNextWeek: "Compare a gym day vs a walk day and see how stress shifts.",
    });

    const cardB = compareGroups({
      aVals: restoreNextGym,
      bVals: restoreNextNon,
      metricLabel: "Next-day restore",
      title: "Gym and next-day restore",
      basedOn: {
        metric: "restore",
        aLabel: "after gym",
        bLabel: "after no gym",
      },
      tryNextWeek:
        "Try two similar gym sessions on different sleep nights and watch restore.",
    });

    const pick = (cardA?._score ?? 0) >= (cardB?._score ?? 0) ? cardA : cardB;
    if (pick) signals.push(pick);
  }

  // Edge sessions -> next-day restore or libido
  {
    const edgeDaySet = new Set(edgeEnds.map((e) => e.day));

    const nextRestoreAfterEdge = [];
    const nextRestoreNoEdge = [];
    const nextLibidoAfterEdge = [];
    const nextLibidoNoEdge = [];

    for (const k of weekKeys) {
      const next = nextDayKey(k);
      if (!weekKeySet.has(next)) continue;

      const nextEntry = getDayEntry(days, next);

      const r = clampNum(nextEntry?.restore);
      if (r != null)
        (edgeDaySet.has(k) ? nextRestoreAfterEdge : nextRestoreNoEdge).push(r);

      const l = clampNum(nextEntry?.libido);
      if (l != null)
        (edgeDaySet.has(k) ? nextLibidoAfterEdge : nextLibidoNoEdge).push(l);
    }

    const cardA = compareGroups({
      aVals: nextRestoreAfterEdge,
      bVals: nextRestoreNoEdge,
      metricLabel: "Next-day restore",
      title: "Edge sessions and next-day restore",
      basedOn: {
        metric: "restore",
        aLabel: "after an edge session",
        bLabel: "after no edge session",
      },
      tryNextWeek:
        "Compare a shorter session vs a longer one and see what the morning looks like.",
    });

    const cardB = compareGroups({
      aVals: nextLibidoAfterEdge,
      bVals: nextLibidoNoEdge,
      metricLabel: "Next-day libido",
      title: "Edge sessions and next-day libido",
      basedOn: {
        metric: "libido",
        aLabel: "after an edge session",
        bLabel: "after no edge session",
      },
      tryNextWeek:
        "Note whether ‘late night’ vs ‘earlier’ sessions change next-day libido.",
    });

    const pick = (cardA?._score ?? 0) >= (cardB?._score ?? 0) ? cardA : cardB;
    if (pick) signals.push(pick);
  }

  // Keep only Medium/High, pick top 2–4
  const pickedSignals = signals
    .filter((s) => s.confidence === "Medium" || s.confidence === "High")
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
    .slice(0, 4)
    .map(({ _score, _diff, ...rest }) => rest);

  // -------- Moments worth revisiting --------
  const moments = [];

  for (const k of weekKeys) {
    const text = (journals?.morningByDay?.[k] ?? "").trim();
    if (text) {
      moments.push({
        day: k,
        type: "Morning",
        sessionId: null,
        preview: preview(text),
        _rank: 1.0,
        _ts: dayKeyToDate(k).getTime(),
      });
    }
  }

  for (const e of edgeEnds) {
    const sid = e.sessionId;
    const text = (journals?.edgeBySessionId?.[sid] ?? "").trim();
    if (!text) continue;

    const sec = clampNum(e.value?.totalSec) ?? 0;
    moments.push({
      day: e.day,
      type: "Edge",
      sessionId: sid,
      preview: preview(text),
      _rank: 1.2 + Math.min(1.5, sec / 1800),
      _ts: e.ts ?? dayKeyToDate(e.day).getTime(),
    });
  }

  for (const e of gymEnds) {
    const sid = e.sessionId;
    const text = (journals?.gymBySessionId?.[sid] ?? "").trim();
    if (!text) continue;

    const sec = getGymTotalSec(e.value) ?? 0;
    moments.push({
      day: e.day,
      type: "Gym",
      sessionId: sid,
      preview: preview(text),
      _rank: 1.15 + Math.min(1.2, sec / 2700),
      _ts: e.ts ?? dayKeyToDate(e.day).getTime(),
    });
  }

  const pickedMoments = moments
    .sort(
      (a, b) => (b._rank ?? 0) - (a._rank ?? 0) || (b._ts ?? 0) - (a._ts ?? 0),
    )
    .slice(0, 3)
    .map(({ _rank, _ts, ...rest }) => rest);

  // -------- Summary --------
  const summary = {
    weekStartKey,
    weekKeys,

    avgRestore: avg(restoreVals),
    avgQuality: avg(qualityVals),
    avgStress: avg(stressVals),
    avgLibido: avg(libidoVals),
    morningWood: { count: mwCount, known: mwKnown, outOf: 7 },

    edge: {
      sessions: edgeEnds.length,
      totalMinutes: Number.isFinite(edgeTotalMinutes) ? edgeTotalMinutes : 0,
      avgMinutes: edgeAvgSec == null ? null : edgeAvgSec / 60,
      outcomeDist: edgeOutcomeDist,
      releaseCount,
      noReleaseCount,
    },

    gym: {
      sessions: gymEnds.length,
      totalMinutes: Number.isFinite(gymTotalMin) ? gymTotalMin : 0,
      intensityDist: gymIntensityDist,
    },

    alcohol: {
      totalStdDrinks: alcTotalStd,
      drinkingDays: alcDayCount,
    },
  };

  return {
    summary,
    signals: pickedSignals,
    moments: pickedMoments,
    alcoholSleepNote, // ✅ only set when negative pattern detected
  };
}
