import { useMemo, useState } from "react";
import { localDayKey } from "../utils/dateKey";

function todayKey() {
  return localDayKey();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const MAX_SUPPLEMENTS = 10;

export default function Supplements({ store, setStore }) {
  const today = todayKey();
  const [isEditing, setIsEditing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDose, setNewDose] = useState("");

  const supplements = store.supplements ?? [];

  const todaysEvents = useMemo(() => {
    return (store.events || []).filter(
      (e) => e?.day === today && e?.type === "supp_taken",
    );
  }, [store.events, today]);

  const countsById = useMemo(() => {
    return todaysEvents.reduce((acc, e) => {
      const id = e?.value?.supplementId;
      if (!id) return acc;
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});
  }, [todaysEvents]);

  function logSupp(supp) {
    const now = Date.now();

    setStore((prev) => ({
      ...prev,
      events: [
        ...(prev.events || []),
        {
          type: "supp_taken",
          ts: now,
          day: today,
          value: {
            supplementId: supp.id,
            name: supp.name,
            dose: supp.dose,
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
        if (ev[i]?.type === "supp_taken" && ev[i]?.day === today) {
          return { ...prev, events: [...ev.slice(0, i), ...ev.slice(i + 1)] };
        }
      }
      return prev;
    });
  }

  function addSupplement() {
    const name = newName.trim();
    const dose = newDose.trim();

    if (!name || !dose) return;
    if (supplements.length >= MAX_SUPPLEMENTS) return;

    const nameLower = name.toLowerCase();
    const doseLower = dose.toLowerCase();

    const alreadyExists = supplements.some(
      (s) =>
        s.name.trim().toLowerCase() === nameLower &&
        s.dose.trim().toLowerCase() === doseLower,
    );

    if (alreadyExists) {
      alert("That supplement is already in your list.");
      return;
    }

    const nextSupp = {
      id: uid(),
      name,
      dose,
    };

    setStore((prev) => ({
      ...prev,
      supplements: [...(prev.supplements ?? []), nextSupp],
    }));

    setNewName("");
    setNewDose("");
    setIsAdding(false);
  }

  function removeSupplement(id) {
    setStore((prev) => ({
      ...prev,
      supplements: (prev.supplements ?? []).filter((s) => s.id !== id),
    }));
  }

  return (
    <section className="card">
      <div className="mc-head">
        <h2>Supplements 💊</h2>

        <div className="supp-header-actions">
          {isOpen && (
            <button
              type="button"
              className="chip supp-header-btn"
              onClick={() => {
                setIsEditing((v) => !v);
                setIsAdding(false);
                setNewName("");
                setNewDose("");
              }}
              aria-label={isEditing ? "Finish editing supplements" : "Edit supplements"}
            >
              {isEditing ? "Done" : "Edit"}
            </button>
          )}

          <button
            type="button"
            className="chip supp-header-btn supp-toggle-btn"
            onClick={() => {
              if (isOpen) {
                setIsEditing(false);
                setIsAdding(false);
                setNewName("");
                setNewDose("");
              }
              setIsOpen((v) => !v);
            }}
            aria-label={isOpen ? "Collapse supplements" : "Expand supplements"}
            title={isOpen ? "Hide supplements" : "Show supplements"}
          >
            <span className="supp-toggle-icon" aria-hidden="true">
              {isOpen ? "^" : "˅"}
            </span>
          </button>
        </div>
      </div>

      {!isOpen ? (
        <div className="muted">Tap ˅ to show your supplements.</div>
      ) : !isEditing ? (
        <div className="muted">
          {todaysEvents.length
            ? `Today: ${todaysEvents.length}`
            : "No supplements logged today."}
        </div>
      ) : null}

      {isOpen && isEditing && (
        <>
          <div className="supp-footer">
            <div className="muted">
              Tracked: <b>{supplements.length}</b> / {MAX_SUPPLEMENTS}
            </div>

            <button
              type="button"
              className="chip"
              onClick={() => setIsAdding((v) => !v)}
              disabled={supplements.length >= MAX_SUPPLEMENTS}
              style={{ width: "auto" }}
            >
              {isAdding ? "Close" : "Add"}
            </button>
          </div>

          {isAdding && (
            <div className="journal-bubble" style={{ marginTop: 12 }}>
              <div className="subhead">Add supplement</div>

              <input
                type="text"
                value={newName}
                placeholder="Supplement name"
                onChange={(e) => setNewName(e.target.value)}
                style={{ marginTop: 10 }}
              />

              <input
                type="text"
                value={newDose}
                placeholder="Dose (e.g. 5g, 300mg, 1 capsule)"
                onChange={(e) => setNewDose(e.target.value)}
                style={{ marginTop: 10 }}
              />

              <button type="button" className="primary" onClick={addSupplement}>
                Save Supplement
              </button>
            </div>
          )}

          {!supplements.length ? (
            <div className="muted" style={{ marginTop: 12 }}>
              No supplements added yet.
            </div>
          ) : (
            <div className="supp-grid">
              {supplements.map((s) => {
                const count = countsById[s.id] || 0;

                return (
                  <div key={s.id} className="supp-tile">
                    <button
                      type="button"
                      className={`supp-tile ${count ? "supp-on" : ""}`}
                      onClick={() => logSupp(s)}
                    >
                      <div className="supp-label">{s.name}</div>
                      <div
                        className="muted"
                        style={{ fontSize: 12, lineHeight: 1.2 }}
                      >
                        {s.dose}
                      </div>
                      <div
                        className={`supp-value ${count ? "supp-value-on" : ""}`}
                      >
                        {count}
                      </div>
                    </button>

                    <button
                      type="button"
                      className="chip"
                      onClick={() => removeSupplement(s.id)}
                      style={{ width: "100%", marginTop: 8 }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="supp-footer">
            <div className="muted">
              Today: <b>{todaysEvents.length}</b>
            </div>

            <button
              type="button"
              className="chip"
              onClick={undoLast}
              disabled={!todaysEvents.length}
              style={{ width: "auto" }}
            >
              Undo last
            </button>
          </div>
        </>
      )}

      {isOpen && !isEditing && !!supplements.length && (
        <div className="supp-grid" style={{ marginTop: 12 }}>
          {supplements.map((s) => {
            const count = countsById[s.id] || 0;

            return (
              <button
                key={s.id}
                type="button"
                className={`supp-tile ${count ? "supp-on" : ""}`}
                onClick={() => logSupp(s)}
              >
                <div className="supp-label">{s.name}</div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.2 }}>
                  {s.dose}
                </div>
                <div className={`supp-value ${count ? "supp-value-on" : ""}`}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}