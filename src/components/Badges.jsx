// components/Badges.jsx
import { useMemo, useState, useEffect } from "react";
import { computeBadges } from "../utils/badges";
import { localDayKey } from "../utils/dateKey";

const BADGE_DEFS = [
  {
    key: "anchor",
    title: "Check-In Anchor",
    img: "/badges/01_Anchor.webp",
    rules: [
      "Unlocked if 5 of the last 7 days have Morning Check-In marked Done.",
    ],
  },
  {
    key: "body",
    title: "Body Mover",
    img: "/badges/02_Body.webp",
    rules: ["Unlocked if gym sessions were logged on 3 of the last 7 days."],
  },
  {
    key: "explorer",
    title: "Edge Explorer",
    img: "/badges/03_Explorer.webp",
    rules: ["Unlocked if edge sessions were logged on 5 of the last 7 days."],
  },
  {
    key: "integratedWolf",
    title: "Integrated Wolf",
    img: "/badges/04_Wolf.webp",
    rules: [
      "Unlocked when ALL of the following are true, within the last 7 days:",
      "7/7 days Morning Check-In marked Done",
      "Gym sessions logged on 5+ of the last 7 days",
      "Edge sessions logged on 5+ of the last 7 days",
      "7/7 days have at least one journal entry (morning OR gym OR edge)",
    ],
  },
];

const IRON = {
  key: "ironWolf",
  title: "The Iron Wolf: Alpha Week",
  img: "/badges/05_IronWolf.webp",
  rules: [
    "All Integrated Wolf rules, PLUS:",
    "Morning Wood = Yes on 5+ of the last 7 days",
    '3 edge sessions in the last 7 days with outcome = "No Release" AND total ≥ 30 minutes (can be on the same day)',
  ],
};

function fmtProgressLine(label, have, need, extra = "") {
  return `${label}: ${have}/${need}${extra}`;
}

async function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line, x, y);
  return y + lineHeight;
}

async function renderSharePng({ title, imgSrc, rules }) {
  const W = 1080;
  const H = 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f1113";
  ctx.fillRect(0, 0, W, H);

  const pad = 70;
  const cardX = pad;
  const cardY = pad;
  const cardW = W - pad * 2;
  const cardH = H - pad * 2;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  ctx.fillStyle = "#1a1d20";
  roundRect(cardX, cardY, cardW, cardH, 36);
  ctx.fill();

  const badgeImg = await loadImg(imgSrc);
  const imgMax = 520;
  const imgW = Math.min(imgMax, badgeImg.width);
  const imgH = (badgeImg.height / badgeImg.width) * imgW;
  const imgX = W / 2 - imgW / 2;
  const imgY = cardY + 90;

  ctx.drawImage(badgeImg, imgX, imgY, imgW, imgH);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "bold 54px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, imgY + imgH + 95);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "36px system-ui, -apple-system, Segoe UI, Roboto, Arial";

  const textX = cardX + 70;
  let y = imgY + imgH + 150;

  const maxTextWidth = cardW - 140;
  const lineHeight = 44;

  for (const line of rules) {
    y = wrapText(ctx, "• " + line, textX, y, maxTextWidth, lineHeight);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("The Den app", W / 2, cardY + cardH - 60);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

export default function Badges({ store }) {
  // ✅ Correct ordering (fixes "uninitialized variable")
  const [dayKey, setDayKey] = useState(localDayKey());
  const today = dayKey;

  // Update dayKey after midnight
  useEffect(() => {
    const id = setInterval(() => {
      const k = localDayKey();
      setDayKey((prev) => (prev === k ? prev : k));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const badgeState = useMemo(() => {
    try {
      return computeBadges(store ?? {}, today);
    } catch (e) {
      console.error("computeBadges failed", e);
      return null;
    }
  }, [store, today]);

  const unlocked = badgeState?.unlocked ?? {};
  const progress = badgeState?.progress ?? null;

  const [openKey, setOpenKey] = useState(null);

  // ✅ Only show the Iron Wolf badge when it is ACTUALLY unlocked AND Integrated Wolf is true
  const showIron =
    unlocked.integratedWolf === true && unlocked.ironWolf === true;
  const gridBadges = showIron ? [IRON] : [...BADGE_DEFS];

  // If openKey is not in the current grid, close it (prevents weird stale modal state)
  useEffect(() => {
    if (!openKey) return;
    const exists = gridBadges.some((b) => b.key === openKey);
    if (!exists) setOpenKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, showIron, today]);

  const activeDef = gridBadges.find((b) => b.key === openKey) ?? null;

  function getUnlockedFor(key) {
    return unlocked?.[key] === true;
  }

  function buildRulesWithProgress(def) {
    // If we can't compute progress yet, just show static rules
    if (!progress) return def.rules;

    const p = progress;

    if (def.key === "anchor") {
      return [
        fmtProgressLine("Check-ins (Done)", p.anchor.have, p.anchor.need),
        ...def.rules,
      ];
    }
    if (def.key === "body") {
      return [
        fmtProgressLine("Gym days", p.body.have, p.body.need),
        ...def.rules,
      ];
    }
    if (def.key === "explorer") {
      return [
        fmtProgressLine("Edge days", p.explorer.have, p.explorer.need),
        ...def.rules,
      ];
    }
    if (def.key === "integratedWolf") {
      return [
        fmtProgressLine(
          "Check-ins (Done)",
          p.integratedWolf.checkins.have,
          p.integratedWolf.checkins.need,
        ),
        fmtProgressLine(
          "Gym days",
          p.integratedWolf.gymDays.have,
          p.integratedWolf.gymDays.need,
          " (need 5+)",
        ),
        fmtProgressLine(
          "Edge days",
          p.integratedWolf.edgeDays.have,
          p.integratedWolf.edgeDays.need,
          " (need 5+)",
        ),
        fmtProgressLine(
          "Journal days",
          p.integratedWolf.journalDays.have,
          p.integratedWolf.journalDays.need,
        ),
        ...def.rules,
      ];
    }
    if (def.key === "ironWolf") {
      return [
        p.ironWolf.baseIntegratedWolf.ok
          ? "Integrated Wolf: OK ✅"
          : "Integrated Wolf: not yet",
        fmtProgressLine(
          "Morning Wood (Yes) days",
          p.ironWolf.morningWoodYesDays.have,
          p.ironWolf.morningWoodYesDays.need,
          " (need 5+)",
        ),
        fmtProgressLine(
          "No Release 30+ min sessions",
          p.ironWolf.noReleaseLongEdgeSessions.have,
          p.ironWolf.noReleaseLongEdgeSessions.need,
        ),
        ...def.rules,
      ];
    }

    return def.rules;
  }

  async function shareBadge(def) {
    const rules = buildRulesWithProgress(def);

    const blob = await renderSharePng({
      title: def.title,
      imgSrc: def.img,
      rules,
    });

    if (!blob) return;

    const file = new File([blob], `${def.key}.png`, { type: "image/png" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: def.title,
        text: "Badge unlocked in The Den app",
        files: [file],
      });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${def.key}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="badges-wrap">
      <div className={`badge-grid ${showIron ? "badge-grid-iron" : ""}`}>
        {gridBadges.map((b) => {
          const isUnlocked = getUnlockedFor(b.key);
          return (
            <button
              key={b.key}
              type="button"
              className={`badge-item ${isUnlocked ? "on" : "off"} ${b.key === "ironWolf" ? "badge-iron" : ""}`}
              onClick={() => setOpenKey(b.key)}
              aria-label={b.title}
            >
              <img className="badge-img" src={b.img} alt={b.title} />
            </button>
          );
        })}
      </div>

      {activeDef && (
        <div className="badge-modal">
          <div className="badge-modal-card">
            <div className="badge-modal-head">
              <div className="badge-modal-title">{activeDef.title}</div>
              <button
                type="button"
                className="chip"
                onClick={() => setOpenKey(null)}
              >
                Back
              </button>
            </div>

            <div className="badge-modal-body">
              <img
                className="badge-modal-img"
                src={activeDef.img}
                alt={activeDef.title}
              />

              <div className="badge-rules">
                {buildRulesWithProgress(activeDef).map((r, idx) => (
                  <div key={idx} className="badge-rule">
                    {r}
                  </div>
                ))}
              </div>

              {getUnlockedFor(activeDef.key) && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => shareBadge(activeDef)}
                >
                  Share
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
