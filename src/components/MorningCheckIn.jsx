import { localDayKey } from "../utils/dateKey";
import { useState } from "react";

export default function MorningCheckIn({ store, setStore }) {
  const today = localDayKey();
  const [niceFlash, setNiceFlash] = useState(false);

  // ---- Daily metrics ----
  const entry = store.days[today] || {
    restore: 0,
    quality: 0,
    morningWood: null,
    libido: 0,
    stress: 0,
  };

  function update(key, value) {
    setStore((prev) => ({
      ...prev,
      days: {
        ...prev.days,
        [today]: { ...(prev.days[today] ?? entry), [key]: value },
      },
    }));
  }

  // ---- Morning journal ----
  const morningJournal = store.journals?.morningByDay?.[today] ?? "";

  function updateMorningJournal(text) {
    setStore((prev) => ({
      ...prev,
      journals: {
        ...(prev.journals ?? {}),
        morningByDay: {
          ...((prev.journals ?? {}).morningByDay ?? {}),
          [today]: text,
        },
      },
    }));
  }

  // ---- Done / collapsed state (PERSISTED) ----
  const isDone = store.journals?.morningDoneByDay?.[today] ?? false;

  function setDone(next) {
    setStore((prev) => ({
      ...prev,
      journals: {
        ...(prev.journals ?? {}),
        morningDoneByDay: {
          ...((prev.journals ?? {}).morningDoneByDay ?? {}),
          [today]: next,
        },
      },
    }));
  }

  return (
    <section className="card card-morning">
      {/* Header (tap to toggle) */}
      <button
        type="button"
        className="mc-header mc-tile"
        onClick={() => setDone(!isDone)}
        aria-expanded={!isDone}
      >
        <div className="mc-header-row">
          <div className="mc-header-text">
            <h2 className="mc-title">Morning Check-In</h2>
            <div className="mc-sub">{isDone ? "" : ""}</div>
          </div>

          {isDone && (
            <button
              type="button"
              className="chip"
              style={{ width: "auto" }}
              tabIndex={-1}
              aria-hidden="true"
            >
              Edit
            </button>
          )}
        </div>
      </button>

      {/* Collapsible body */}
      {!isDone && (
        <>
          <label className="label">
            Rested & Restored: <span className="val">{entry.restore}</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={entry.restore}
            onChange={(e) => update("restore", Number(e.target.value))}
          />

          <label className="label">
            Sleep Quality: <span className="val">{entry.quality}</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={entry.quality}
            onChange={(e) => update("quality", Number(e.target.value))}
          />

          <div className="mw-block">
            <div className="mw-title-row">
              <div className="mw-title">Morning Wood 🪵⬆️</div>
              {niceFlash && <span className="nice nice-on">NICE!</span>}
            </div>

            <div className="chips">
              <button
                type="button"
                className={`chip ${entry.morningWood === true ? "chip-on" : ""}`}
                onClick={() => {
                  update("morningWood", true);
                  setNiceFlash(true);
                  setTimeout(() => setNiceFlash(false), 900);
                }}
              >
                Yes
              </button>
              <button
                type="button"
                className={`chip ${entry.morningWood === false ? "chip-on" : ""}`}
                onClick={() => update("morningWood", false)}
              >
                No
              </button>
            </div>
          </div>

          <label className="label">
            Libido: <span className="val">{entry.libido}</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={entry.libido}
            onChange={(e) => update("libido", Number(e.target.value))}
          />

          <label className="label">
            Stress: <span className="val">{entry.stress}</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={entry.stress}
            onChange={(e) => update("stress", Number(e.target.value))}
          />

          <div className="journal-bubble">
            <textarea
              className="journal-input"
              rows={3}
              value={morningJournal}
              placeholder="Optional reflection…"
              onChange={(e) => updateMorningJournal(e.target.value)}
            />
            <div className="journal-hint">
              {morningJournal.trim().length
                ? `${morningJournal.trim().length} chars`
                : "Tap to type. Saves automatically."}
            </div>
          </div>

          {/* Done button at the bottom */}
          <div className="mc-innerbar">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDone(true);
                setTimeout(() => {
                  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                }, 0);
              }}
            >
              Done ✅
            </button>
          </div>
        </>
      )}
    </section>
  );
}
