/**
 * Graphique investisseur (F5) — SVG sans dépendance, interactif.
 * Barres empilées par année = SOURCES DE RENDEMENT :
 *   • Cash-on-cash (flux d'exploitation)
 *   • Capitalisation (capital remboursé)
 *   • Prise de valeur (hausse de la valeur)
 * Ligne superposée = TRI cumulé (axe secondaire). Survol → infobulle chiffrée.
 */

const money = (v) => {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + " M";
  if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(0) + " k";
  return s + "$" + Math.round(a);
};
const irrTxt = (v) => (v === null ? "n/d" : !isFinite(v) ? "> 999 %" : (v * 100).toFixed(1) + " %");
const finiteIRR = (v) => v !== null && isFinite(v);

const SOURCES = [
  { key: "cashFlow", label: "Cash-on-cash", color: "var(--success)" },
  { key: "principalPaid", label: "Capitalisation", color: "var(--gold)" },
  { key: "appreciation", label: "Prise de valeur", color: "var(--accent)" },
];

export function renderEquityChart(container, proforma) {
  if (!container) return;
  if (!proforma || proforma.length === 0) {
    container.innerHTML = "";
    return;
  }

  const W = 640, H = 320, mL = 12, mR = 12, mT = 26, mB = 30;
  const plotW = W - mL - mR;
  const plotTop = mT;
  const plotBottom = H - mB;
  const plotH = plotBottom - plotTop;
  const n = proforma.length;

  // Échelle des barres (empilées, avec zéro flottant si composantes négatives)
  const posOf = (r) => SOURCES.reduce((a, s) => a + Math.max(0, r[s.key]), 0);
  const negOf = (r) => SOURCES.reduce((a, s) => a + Math.min(0, r[s.key]), 0);
  const maxPos = Math.max(...proforma.map(posOf), 1);
  const maxNeg = Math.min(...proforma.map(negOf), 0);
  const range = maxPos - maxNeg || 1;
  const scale = plotH / range;
  const zeroY = plotTop + maxPos * scale;

  // Échelle TRI (axe secondaire)
  const irrs = proforma.map((r) => r.periodIRR).filter(finiteIRR);
  const irrMax = Math.max(...irrs, 0.01);
  const irrMin = Math.min(...irrs, 0);
  const irrSpan = irrMax - irrMin || 1;
  const yIRR = (v) => plotBottom - ((v - irrMin) / irrSpan) * plotH;

  const slot = plotW / n;
  const barW = Math.min(54, slot * 0.5);

  let bars = "", labels = "", hits = "", dots = "";
  const pts = [];

  proforma.forEach((r, i) => {
    const cx = mL + slot * i + slot / 2;
    const x = cx - barW / 2;

    // Empilage : positifs vers le haut depuis zéro, négatifs vers le bas
    let topY = zeroY, botY = zeroY;
    for (const s of SOURCES) {
      const v = r[s.key];
      if (v >= 0) {
        const h = v * scale;
        bars += `<rect x="${x.toFixed(1)}" y="${(topY - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}"/>`;
        topY -= h;
      } else {
        const h = -v * scale;
        bars += `<rect x="${x.toFixed(1)}" y="${botY.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" opacity="0.55"/>`;
        botY += h;
      }
    }
    // Total au-dessus de la barre
    const total = SOURCES.reduce((a, s) => a + r[s.key], 0);
    labels += `<text x="${cx.toFixed(1)}" y="${(topY - 6).toFixed(1)}" text-anchor="middle" font-family="var(--font-mono)" font-size="10" font-weight="600" fill="var(--ink)">${money(total)}</text>`;
    // Étiquette année
    labels += `<text x="${cx.toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle" font-family="var(--font-mono)" font-size="10" fill="var(--muted)">An ${r.year}</text>`;
    // Point TRI
    if (finiteIRR(r.periodIRR)) {
      const py = yIRR(r.periodIRR);
      pts.push(`${cx.toFixed(1)},${py.toFixed(1)}`);
      dots += `<circle cx="${cx.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="var(--ink)"/>`;
    }
    // Zone de survol (transparente, capte le pointeur)
    hits += `<rect class="hit" data-i="${i}" x="${(mL + slot * i).toFixed(1)}" y="${plotTop}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent" pointer-events="all"/>`;
  });

  const irrLine = pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"/>` : "";

  container.style.position = "relative";
  container.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sources de rendement annuelles et progression du TRI">` +
    `<line x1="${mL}" y1="${zeroY.toFixed(1)}" x2="${W - mR}" y2="${zeroY.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>` +
    bars + irrLine + dots + labels + hits +
    `</svg><div class="chart-tip" hidden></div>`;

  // Interactivité : infobulle chiffrée au survol
  const tip = container.querySelector(".chart-tip");
  const tipHtml = (r) => {
    const total = r.cashFlow + r.principalPaid + r.appreciation;
    const row = (c, l, v) => `<div class="ct-row"><span style="color:${c}">${l}</span><b>${money(v)}</b></div>`;
    return (
      `<div class="ct-y">Année ${r.year}</div>` +
      row("var(--success)", "Cash-on-cash", r.cashFlow) +
      row("var(--gold)", "Capitalisation", r.principalPaid) +
      row("var(--accent)", "Prise de valeur", r.appreciation) +
      `<div class="ct-row ct-tot"><span>Rendement total</span><b>${money(total)}</b></div>` +
      `<div class="ct-row"><span>Équité</span><b>${money(r.equity)}</b></div>` +
      `<div class="ct-row"><span>TRI cumulé</span><b>${irrTxt(r.periodIRR)}</b></div>`
    );
  };
  container.querySelectorAll(".hit").forEach((rect) => {
    const r = proforma[+rect.dataset.i];
    rect.addEventListener("mouseenter", () => { tip.hidden = false; tip.innerHTML = tipHtml(r); });
    rect.addEventListener("mousemove", (e) => {
      const cr = container.getBoundingClientRect();
      const x = e.clientX - cr.left + 14;
      const y = e.clientY - cr.top + 14;
      tip.style.left = Math.min(x, cr.width - 185) + "px";
      tip.style.top = y + "px";
    });
    rect.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
}
