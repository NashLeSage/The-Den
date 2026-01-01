import { useState } from "react";
import { localDayKey } from "../utils/dateKey";

function todayKey() {
  return localDayKey();
}

const OPTIONS = [
  { key: "low", label: "Low ~3.5%", abv: 3.5, std: 1.0 },
  { key: "moderate", label: "Moderate ~5%", abv: 5, std: 1.4 },
  { key: "high", label: "High ~10%", abv: 10, std: 2.0 },
];

export default function AlcoholTracker({ store, setStore }) {
  const today = todayKey();
  const [isEditing, setIsEditing] = useState(false);

  const todays = (store.events || []).filter(
    (e) => e.day === today && e.type === "alc_drink",
  );

  const counts = todays.reduce((acc, e) => {
    const k = e.value?.levelKey;
    if (!k) return acc;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const totalStd = todays.reduce(
    (sum, e) => sum + (e.value?.stdDrinks || 0),
    0,
  );

  function addDrink(opt) {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      events: [
        ...(prev.events || []),
        {
          type: "alc_drink",
          ts: now,
          day: today,
          value: {
            levelKey: opt.key,
            label: opt.label,
            abv: opt.abv,
            stdDrinks: opt.std,
          },
          sessionId: null,
        },
      ],
    }));
  }

  function undoLast() {
    setStore((prev) => {
      const ev = prev.events || [];
      for (let i = ev.length - 1; i >= 0; i--) {
        if (ev[i].type === "alc_drink" && ev[i].day === today) {
          return { ...prev, events: [...ev.slice(0, i), ...ev.slice(i + 1)] };
        }
      }
      return prev;
    });
  }

  return (
    <section className="card">
      <div className="mc-head">
        <h2>Alcohol 🍺</h2>
        <button
          type="button"
          className="chip"
          onClick={() => setIsEditing((v) => !v)}
        >
          {isEditing ? "Done" : "Edit"}
        </button>
      </div>

      {/* Collapsed summary */}
      {!isEditing && (
        <div className="muted">
          {todays.length ? (
            <>
              Today: <b>{todays.length}</b> <span className="muted">•</span> Est
              Std Drinks: <b>{totalStd.toFixed(1)}</b>
            </>
          ) : (
            "No alcohol logged today."
          )}
        </div>
      )}

      {/* Expanded editor */}
      {isEditing && (
        <>
          <div className="chips">
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`chip ${counts[o.key] ? "chip-on" : ""}`}
                onClick={() => addDrink(o)}
              >
                {o.label}
                {counts[o.key] ? (
                  <span className="chip-count">{counts[o.key]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="supp-footer">
            <div className="muted">
              Today: <b>{todays.length}</b> <span className="muted">•</span> Est
              Std Drinks: <b>{totalStd.toFixed(1)}</b>
            </div>

            <button
              type="button"
              className="danger"
              onClick={undoLast}
              disabled={!todays.length}
            >
              Undo last
            </button>
          </div>
        </>
      )}
    </section>
  );
}
