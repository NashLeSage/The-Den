import { useEffect, useState } from "react";

const KEY = "mu-den-v01";

const EMPTY = {
  days: {},
  events: [],
  supplements: [],
  activeSession: null,
  activeGymSession: null,
  prefs: {
    wolfSound: false,
    wolfVibe: true,
  },
  journals: {
    morningByDay: {},
    morningDoneByDay: {}, // ✅ NEW
    edgeBySessionId: {},
    gymBySessionId: {},
  },
};

function hydrate(saved) {
  // Merge defaults so missing keys never break components
  const s = saved && typeof saved === "object" ? saved : {};
  return {
  ...EMPTY,
  ...s,
  supplements: Array.isArray(s.supplements) ? s.supplements : [],
  prefs: { ...EMPTY.prefs, ...(s.prefs ?? {}) },
    journals: {
      ...EMPTY.journals,
      ...(s.journals ?? {}),
      morningByDay: {
        ...EMPTY.journals.morningByDay,
        ...((s.journals ?? {}).morningByDay ?? {}),
      },
      morningDoneByDay: {
        ...EMPTY.journals.morningDoneByDay,
        ...((s.journals ?? {}).morningDoneByDay ?? {}),
      },
      edgeBySessionId: {
        ...EMPTY.journals.edgeBySessionId,
        ...((s.journals ?? {}).edgeBySessionId ?? {}),
      },
      gymBySessionId: {
        ...EMPTY.journals.gymBySessionId,
        ...((s.journals ?? {}).gymBySessionId ?? {}),
      },
    },
  };
}

export function useStore() {
  const [store, setStore] = useState(() => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;

    try {
      return hydrate(JSON.parse(raw));
    } catch {
      return EMPTY;
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(store));
  }, [store]);

  return [store, setStore];
}
