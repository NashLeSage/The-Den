// src/App.jsx
import "./styles.css";
import { useEffect, useRef, useState } from "react";

import { useStore } from "./hooks/useStore";
import { APP_VERSION } from "./version";

import Badges from "./components/Badges";
import MorningCheckIn from "./components/MorningCheckIn";
import EdgeSession from "./components/EdgeSession";
import GymSession from "./components/GymSession";
import Supplements from "./components/Supplements";
import TodaysLog from "./components/TodaysLog";
import AlcoholTracker from "./components/AlcoholTracker";
import Insights from "./components/Insights";

import { exportEdgeSessionsCsv } from "./utils/exportEdgeCsv";

export default function App() {
  const [store, setStore] = useStore();
  const [page, setPage] = useState("home");

  // ✅ Version label (prevents black screen: APP_NAME / APP_VERSION_LABEL were undefined)
  const APP_NAME = "The Den";
  const APP_VERSION_LABEL = `${APP_NAME} v${APP_VERSION}`;

  useEffect(() => {
    console.log(`[${APP_NAME}] ${APP_VERSION}`);
  }, []);

  // Backup warning
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const lastExportTs = store?.meta?.lastExportTs ?? null;
  const isBackupStale =
    !lastExportTs || Date.now() - lastExportTs > SEVEN_DAYS_MS;

  // Import
  const importInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState("");

  function exportData() {
    const payload = {
      days: store.days,
      events: store.events,
      supplements: store.supplements ?? [],
      prefs: store.prefs ?? { wolfSound: false, wolfVibe: true },
      activeSession: store.activeSession ?? null,
      activeGymSession: store.activeGymSession ?? null,
      journals: store.journals ?? {
        morningByDay: {},
        morningDoneByDay: {},
        edgeBySessionId: {},
        gymBySessionId: {},
      },
    };

    const exportObj = {
      exportedAt: new Date().toISOString(),
      app: APP_NAME,
      version: APP_VERSION,
      payload,
    };

    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: "application/json" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `masculinity-unlocked-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    // ✅ mark last export time (7-day warning)
    setStore((prev) => ({
      ...prev,
      meta: {
        ...(prev.meta ?? {}),
        lastExportTs: Date.now(),
      },
    }));
  }

  function stableStringify(obj) {
    try {
      return JSON.stringify(obj, Object.keys(obj || {}).sort());
    } catch {
      return "";
    }
  }

  function eventKey(e) {
    const valueStr =
      e && typeof e.value === "object"
        ? stableStringify(e.value)
        : String(e?.value ?? "");
    return [
      e?.type ?? "",
      e?.ts ?? "",
      e?.day ?? "",
      e?.sessionId ?? "",
      valueStr,
    ].join("|");
  }

  function mergeImportedData(current, importedPayload) {
    const cur = current ?? {};
    const imp = importedPayload ?? {};

    const next = { ...cur };

    // ✅ Merge days (by dayKey)
    next.days = { ...(cur.days ?? {}) };
    const importedDays = imp.days ?? {};
    for (const [dayKey, dayObj] of Object.entries(importedDays)) {
      next.days[dayKey] = {
        ...(next.days[dayKey] ?? {}),
        ...(dayObj ?? {}),
      };
    }

    // ✅ Merge supplements library (dedupe by id first, then name+dose)
    const curSupps = Array.isArray(cur.supplements) ? cur.supplements : [];
    const impSupps = Array.isArray(imp.supplements) ? imp.supplements : [];

    const mergedSupps = [...curSupps];
    const seenSuppIds = new Set(curSupps.map((s) => s?.id).filter(Boolean));
    const seenSuppKeys = new Set(
      curSupps.map((s) => `${String(s?.name ?? "").trim().toLowerCase()}|${String(s?.dose ?? "").trim().toLowerCase()}`),
    );

    for (const s of impSupps) {
      const id = s?.id ?? null;
      const key = `${String(s?.name ?? "").trim().toLowerCase()}|${String(s?.dose ?? "").trim().toLowerCase()}`;

      if ((id && seenSuppIds.has(id)) || seenSuppKeys.has(key)) continue;

      if (id) seenSuppIds.add(id);
      seenSuppKeys.add(key);
      mergedSupps.push(s);
    }

    next.supplements = mergedSupps;

    // ✅ Merge events with dedupe
    const curEvents = Array.isArray(cur.events) ? cur.events : [];
    const impEvents = Array.isArray(imp.events) ? imp.events : [];

    const seen = new Set(curEvents.map(eventKey));
    const merged = [...curEvents];

    for (const e of impEvents) {
      const k = eventKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(e);
    }

    merged.sort((a, b) => (a?.ts ?? 0) - (b?.ts ?? 0));
    next.events = merged;

    // ✅ Merge journals
    const curJ = cur.journals ?? {};
    const impJ = imp.journals ?? {};

    next.journals = {
      ...(curJ ?? {}),
      ...(impJ ?? {}),
      morningByDay: {
        ...(curJ.morningByDay ?? {}),
        ...(impJ.morningByDay ?? {}),
      },
      morningDoneByDay: {
        ...(curJ.morningDoneByDay ?? {}),
        ...(impJ.morningDoneByDay ?? {}),
      },
      edgeBySessionId: { ...(curJ.edgeBySessionId ?? {}) },
      gymBySessionId: { ...(curJ.gymBySessionId ?? {}) },
    };

    // Prefer existing session notes if already present
    for (const [sid, text] of Object.entries(impJ.edgeBySessionId ?? {})) {
      const curText = (curJ.edgeBySessionId ?? {})[sid];
      next.journals.edgeBySessionId[sid] =
        curText && String(curText).trim() ? curText : text;
    }

    for (const [sid, text] of Object.entries(impJ.gymBySessionId ?? {})) {
      const curText = (curJ.gymBySessionId ?? {})[sid];
      next.journals.gymBySessionId[sid] =
        curText && String(curText).trim() ? curText : text;
    }

    // ✅ Do NOT import prefs or active sessions
    next.prefs = { ...(cur.prefs ?? {}) };
    next.activeSession = cur.activeSession ?? null;
    next.activeGymSession = cur.activeGymSession ?? null;
    if (!next.supplements) next.supplements = [...(cur.supplements ?? [])];

    // ✅ Meta bookkeeping
    next.meta = {
      ...(cur.meta ?? {}),
      lastImportTs: Date.now(),
    };

    return next;
  }

  async function handleImportFile(file) {
    if (!file) return;

    setImportStatus("Importing…");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Supports:
      // 1) { exportedAt, version, payload }
      // 2) raw payload object
      const payload =
        parsed && typeof parsed === "object"
          ? parsed.payload && typeof parsed.payload === "object"
            ? parsed.payload
            : parsed
          : null;

      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid JSON file. Use an export from The Den.");
      }

      setStore((prev) => mergeImportedData(prev, payload));

      setImportStatus("Import complete ✅");
      setTimeout(() => setImportStatus(""), 4000);
    } catch (err) {
      console.error(err);
      setImportStatus("Import failed ❌");
      alert(`Import failed: ${err?.message ?? "Unknown error"}`);
      setTimeout(() => setImportStatus(""), 5000);
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  if (page === "insights") {
    return <Insights store={store} onBack={() => setPage("home")} />;
  }

  return (
    <div className="den">
      <header className="den-header">
        <img
          src={`${import.meta.env.BASE_URL}TheDen.webp`}
          alt="The Den – Masculinity Unlocked"
          className="den-header-logo"
        />
      </header>

      <MorningCheckIn store={store} setStore={setStore} />
      <Badges store={store} />

      <div className="sessions">
        <EdgeSession store={store} setStore={setStore} />
        <GymSession store={store} setStore={setStore} />
      </div>

      <Supplements store={store} setStore={setStore} />
      <AlcoholTracker store={store} setStore={setStore} />

      <footer style={{ marginTop: "24px", opacity: 0.7 }}>
        <div style={{ display: "grid", gap: "10px" }}>
          <button onClick={() => setPage("insights")}>View Insights 👀</button>

          <button
            onClick={exportData}
            className={isBackupStale ? "danger-outline" : ""}
          >
            Export Full Data (JSON) 💾
          </button>

          {isBackupStale && (
            <div className="muted" style={{ fontSize: 12, opacity: 0.75 }}>
              Backup recommended — last export over 7 days ago
            </div>
          )}

          <button onClick={() => importInputRef.current?.click()}>
            Import Data (JSON) 📥
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />

          {importStatus ? (
            <div className="muted" style={{ fontSize: 12, opacity: 0.75 }}>
              {importStatus}
            </div>
          ) : null}

          <button onClick={() => exportEdgeSessionsCsv(store)}>
            Export Edge Sessions (CSV) 📊
          </button>
        </div>
      </footer>

      <TodaysLog store={store} />

      <div className="disclaimer">
        <div className="disclaimer-title">
          <strong>⚠️ Privacy Note ⚠️</strong>
        </div>
        <div className="disclaimer-text">
          Everything you log in <strong>The Den</strong> stays{" "}
          <strong>on this phone only</strong>. No cloud. No accounts. No sneaky
          servers.
          <br />
          Your data is yours. If you ever delete the app, your logs are gone
          with it.
          <br />
          Before you wipe it, do yourself a solid: tap{" "}
          <strong>“Export Full Data (JSON)”</strong> above and stash it
          somewhere safe.
        </div>
      </div>

      <div
        className="muted"
        style={{ fontSize: 12, opacity: 0.65, marginTop: 12 }}
      >
        {APP_VERSION_LABEL}
      </div>
    </div>
  );
}
