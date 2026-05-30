// ============================================================================
// Slice C — Documents : export Excel (6 onglets groupés), Mémo d'investissement
// (DOCX), Promesse d'achat (DOCX, auto-remplie via questionnaire). Les libs
// lourdes (exceljs, docx) sont chargées en import dynamique → code-split.
//
// `state` (fourni par main.js) = { input, obj, decision, va, rents, region, meta,
//                                  sensCap, sensRate, stabilizedVerdict }
//   decision = { result, recommendation, maxPrice, redFlags }   (cf. @elevate/domain)
// ============================================================================

// ---- Formatage (fr-CA) ----
const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('fr-CA');
const pctt = (v, dp = 2) =>
  v == null ? 'n/d' : !isFinite(v) ? '> 999 %'
  : (v * 100).toLocaleString('fr-CA', { minimumFractionDigits: dp, maximumFractionDigits: dp }) + ' %';
const mult = v => (isFinite(v) ? v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '∞') + '×';
const dateStr = d => (d instanceof Date ? d : new Date()).toLocaleDateString('fr-CA');
const frLong = iso => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
};
const VERDICT_FR = { BUY: 'ACHETER', RENEGOTIATE: 'RENÉGOCIER', PASS: 'PASSER' };
const TYPE_FR = { studio: 'Studio', br1: '1 chambre', br2: '2 chambres', br3: '3 chambres +' };
const irrText = v => (v == null ? 'n/d' : !isFinite(v) ? '> 999 %' : pctt(v));

// ---- Téléchargement ----
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function slug(state) {
  const base = (state.meta.address || state.region?.label || 'transaction')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase() || 'transaction';
  return `${base}-${dateStr(state.meta.generatedAt).replace(/[\/\s]/g, '-')}`;
}

// ============================================================================
// 1) EXCEL — 6 onglets groupés (ExcelJS)
// ============================================================================
const MONEY = '#,##0" $"';
const MONEY2 = '#,##0.00" $"';
const PCT = '0.00%';
const MULTF = '0.00"×"';
const INK = 'FF6E2B26';        // bordeaux (en-têtes)
const SOFT = 'FFEDE7DB';        // crème (sous-titres)
const ZEBRA = 'FFF7F4EE';       // ligne paire
const GREEN = 'FF2E7D32';
const RED = 'FFB23A36';
const LINE = 'FFD9D2C5';
const THIN = { style: 'thin', color: { argb: LINE } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

export async function exportExcel(state) {
  const mod = await import('exceljs');
  const ExcelJS = mod.Workbook ? mod : (mod.default && mod.default.Workbook ? mod.default : mod.default || mod);
  const { input, obj, decision, va, rents, meta } = state;
  const r = decision.result, rec = decision.recommendation, mp = decision.maxPrice;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elevate Deal Analyzer';
  wb.created = meta.generatedAt instanceof Date ? meta.generatedAt : new Date();

  // ---------- helpers de mise en forme ----------
  const banner = (ws, text, span) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, span);
    const c = row.getCell(1);
    c.font = { bold: true, size: 15, color: { argb: 'FFF4F0E6' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    c.alignment = { vertical: 'middle' };
    row.height = 26;
    return row;
  };
  const spacer = ws => ws.addRow([]);
  const subtitle = (ws, text, span) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, span);
    const c = row.getCell(1);
    c.font = { bold: true, size: 11, color: { argb: INK } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    c.border = { bottom: { style: 'medium', color: { argb: INK } } };
    row.height = 19;
    return row;
  };
  const thead = (ws, cells) => {
    const row = ws.addRow(cells);
    row.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFF4F0E6' }, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
      c.border = BORDER;
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    row.height = 22;
    return row;
  };
  // ligne de données ; opts: { fmt:[...], bold, fill, zebra:i, align:{col:'right'}, color:{col:argb} }
  const trow = (ws, cells, opts = {}) => {
    const row = ws.addRow(cells);
    row.eachCell(c => { c.border = BORDER; c.alignment = { vertical: 'middle' }; });
    if (opts.fmt) opts.fmt.forEach((f, i) => { if (f) row.getCell(i + 1).numFmt = f; });
    if (opts.zebra != null && opts.zebra % 2 === 1)
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }; });
    if (opts.fill) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }; });
    if (opts.bold) row.font = { bold: true };
    if (opts.color) for (const [col, argb] of Object.entries(opts.color)) row.getCell(+col).font = { ...(opts.bold ? { bold: true } : {}), color: { argb } };
    return row;
  };

  // ================= ONGLET 1 — SOMMAIRE =================
  const s1 = wb.addWorksheet('Sommaire', { views: [{ showGridLines: false }] });
  s1.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 14 }];
  banner(s1, 'SOMMAIRE DE LA TRANSACTION', 4);
  spacer(s1);
  // Identité (paires sur 2 colonnes)
  const idPairs = [
    ['Adresse', meta.address || '—', 'Programme', meta.programLabel || '—'],
    ['Région / marché', meta.regionLabel || '—', 'Type d’actif', meta.assetLabel || '—'],
    ['Unités', String(input.units), 'Année', meta.year ? String(meta.year) : '—'],
    ['Construction', meta.constructionLabel || '—', 'Généré le', dateStr(meta.generatedAt)],
  ];
  for (const [k1, v1, k2, v2] of idPairs) {
    const row = s1.addRow([k1, v1, k2, v2]);
    row.getCell(1).font = { color: { argb: 'FF777777' } }; row.getCell(2).font = { bold: true };
    row.getCell(3).font = { color: { argb: 'FF777777' } }; row.getCell(4).font = { bold: true };
  }
  spacer(s1);
  // Verdict
  const vrow = s1.addRow(['Recommandation', VERDICT_FR[rec.verdict] || '—', `${rec.metCount} / 4 critères`, '']);
  s1.mergeCells(vrow.number, 2, vrow.number, 2);
  vrow.getCell(1).font = { bold: true, color: { argb: 'FF777777' } };
  vrow.getCell(2).font = { bold: true, size: 16, color: { argb: rec.verdict === 'BUY' ? GREEN : rec.verdict === 'PASS' ? RED : 'FFB7791F' } };
  vrow.getCell(3).font = { italic: true, color: { argb: 'FF777777' } };
  vrow.height = 24;
  spacer(s1);
  // Indicateurs clés
  subtitle(s1, 'Indicateurs clés', 4);
  thead(s1, ['Indicateur', 'Valeur', 'Repère', 'Statut']);
  const kbool = (label, value, fmt, ref, ok) => {
    const row = trow(s1, [label, value, ref, ok == null ? '' : ok ? '✓' : '✗'], { fmt: [null, fmt, null, null] });
    if (ok != null) row.getCell(4).font = { bold: true, color: { argb: ok ? GREEN : RED } };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    return row;
  };
  kbool('Prix demandé', input.price, MONEY, '', null);
  kbool('Prix recommandé (TRI cible)', mp.feasible ? mp.recommendedPrice : 0, MONEY, mp.feasible ? `marge ${pctt(mp.marginOfSafety, 0)}` : 'n/a', mp.feasible ? mp.marginOfSafety >= 0 : null);
  kbool('Plafond finançable (RCD)', mp.feasible ? mp.maxPrice : 0, MONEY, '', null);
  kbool('Cap rate réel', r.capRate, PCT, `marché ${pctt(r.capMkt)}`, r.capRate >= r.capMkt);
  kbool('Valeur implicite (cap marché)', r.impliedValue, MONEY, `écart ${money(r.impliedValue - input.price)}`, r.impliedValue >= input.price);
  kbool('RBE (NOI)', r.noi, MONEY, '', r.noi > 0);
  kbool('RCD (DSCR)', isFinite(r.dscr) ? r.dscr : 99, MULTF, `min ${mult(obj.minDSCR)}`, r.dscr >= obj.minDSCR);
  kbool('Rendement comptant', r.cashOnCash, PCT, `min ${pctt(obj.minCashOnCashPct / 100, 1)}`, r.cashOnCash * 100 >= obj.minCashOnCashPct);
  kbool('Multiple d’équité', r.equityMultiple, MULTF, `min ${mult(obj.minEquityMultiple)}`, r.equityMultiple >= obj.minEquityMultiple);
  kbool('TRI', r.irr == null || !isFinite(r.irr) ? irrText(r.irr) : r.irr, (r.irr != null && isFinite(r.irr)) ? PCT : null, `cible ${pctt(obj.targetIRRPct / 100, 1)}`, r.irr != null && (!isFinite(r.irr) || r.irr * 100 >= obj.targetIRRPct));
  kbool('Flux de trésorerie an 1', r.cashFlowYr1, MONEY, '≥ 0 $', r.cashFlowYr1 >= 0);
  spacer(s1);
  // Critères de la recommandation
  subtitle(s1, 'Critères de la recommandation', 4);
  thead(s1, ['Critère', 'Détail', '', 'Atteint']);
  rec.reasons.forEach((reason, i) => {
    const row = trow(s1, [reason.label, reason.detail, '', reason.ok ? '✓' : '✗'], { zebra: i });
    s1.mergeCells(row.number, 2, row.number, 3);
    row.getCell(4).font = { bold: true, color: { argb: reason.ok ? GREEN : RED } };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  spacer(s1);
  // Drapeaux rouges
  subtitle(s1, `Drapeaux rouges (${decision.redFlags.length})`, 4);
  if (!decision.redFlags.length) {
    trow(s1, ['Aucun drapeau rouge automatique détecté.', '', '', ''], { color: { 1: GREEN } });
  } else {
    thead(s1, ['Sévérité', 'Drapeau', '', 'Mitigation']);
    decision.redFlags.forEach((f, i) => {
      const row = trow(s1, [f.severity === 'danger' ? 'Critique' : 'Attention', f.title, '', f.mitigation], { zebra: i });
      s1.mergeCells(row.number, 2, row.number, 2);
      row.getCell(1).font = { bold: true, color: { argb: f.severity === 'danger' ? RED : 'FFB7791F' } };
      row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      row.getCell(4).alignment = { vertical: 'middle', wrapText: true };
    });
  }

  // ================= ONGLET 2 — REVENUS & DÉPENSES =================
  const s2 = wb.addWorksheet('Revenus & dépenses', { views: [{ showGridLines: false }] });
  s2.columns = [{ width: 40 }, { width: 18 }, { width: 16 }];
  banner(s2, 'REVENUS & DÉPENSES', 3);
  spacer(s2);
  subtitle(s2, 'Revenus', 3);
  thead(s2, ['Poste', 'Montant', '% du brut']);
  const gr = input.grossRevenue;
  trow(s2, ['Revenu brut potentiel', gr, gr > 0 ? 1 : 0], { fmt: [null, MONEY, PCT], zebra: 0 });
  trow(s2, [`Moins inoccupation (${input.vacancyPct.toLocaleString('fr-CA')} %)`, -(gr - r.egi), gr > 0 ? -(gr - r.egi) / gr : 0], { fmt: [null, MONEY, PCT], zebra: 1 });
  trow(s2, ['= Revenu brut effectif (RBE)', r.egi, gr > 0 ? r.egi / gr : 0], { fmt: [null, MONEY, PCT], bold: true, fill: SOFT });
  spacer(s2);
  // Mix locatif
  subtitle(s2, 'Mix locatif', 3);
  thead(s2, ['Type', 'Unités', 'Loyer / mois']);
  let mixUnits = 0, mixMonthly = 0, zi = 0;
  for (const k of ['studio', 'br1', 'br2', 'br3']) {
    const m = input.unitMix && input.unitMix[k];
    if (m && m.count > 0) {
      trow(s2, [TYPE_FR[k], m.count, m.rent], { fmt: [null, null, MONEY], zebra: zi++ });
      mixUnits += m.count; mixMonthly += m.rent * m.count;
    }
  }
  if (mixUnits > 0) {
    trow(s2, ['Total mix (mensuel)', mixUnits, mixMonthly], { fmt: [null, null, MONEY], bold: true, fill: SOFT });
    const other = Math.max(0, gr - mixMonthly * 12);
    trow(s2, ['Autres revenus annuels (stationnement, etc.)', '', other], { fmt: [null, null, MONEY] });
  } else {
    trow(s2, ['Mix locatif non renseigné', '', '']);
  }
  spacer(s2);
  // Dépenses
  subtitle(s2, 'Dépenses d’exploitation (normalisées SCHL)', 3);
  thead(s2, ['Poste', 'Montant', '% du brut']);
  const x = input.expenses;
  const mgmt = r.egi * (x.mgmtPct / 100);
  const reserve = input.units * x.reservePerDoor;
  const opexLines = [
    ['Taxes municipales et scolaires', x.taxes],
    ['Assurances', x.insurance],
    ['Énergie', x.energy],
    ['Eau / égouts', x.water],
    ['Entretien et réparations', x.repairs],
    ['Conciergerie', x.caretaking],
    [`Gestion (${x.mgmtPct.toLocaleString('fr-CA')} % du RBE)`, mgmt],
    [`Réserve de remplacement (${x.reservePerDoor} $/porte × ${input.units})`, reserve],
    ['Divers', x.misc],
  ];
  opexLines.forEach(([label, val], i) => trow(s2, [label, val, gr > 0 ? val / gr : 0], { fmt: [null, MONEY, PCT], zebra: i }));
  trow(s2, ['= Total des dépenses', r.opex, r.expenseRatio], { fmt: [null, MONEY, PCT], bold: true, fill: SOFT });
  spacer(s2);
  // Pont vers le NOI
  subtitle(s2, 'Du brut au revenu net', 3);
  trow(s2, ['Revenu brut effectif (RBE)', r.egi, ''], { fmt: [null, MONEY] });
  trow(s2, ['Moins dépenses d’exploitation', -r.opex, ''], { fmt: [null, MONEY] });
  trow(s2, ['= Revenu net d’exploitation (NOI)', r.noi, ''], { fmt: [null, MONEY], bold: true, fill: SOFT, color: { 2: INK } });

  // ================= ONGLET 3 — ÉVALUATION & FINANCEMENT =================
  const s3 = wb.addWorksheet('Évaluation & financement', { views: [{ showGridLines: false }] });
  s3.columns = [{ width: 40 }, { width: 20 }];
  banner(s3, 'ÉVALUATION & FINANCEMENT', 2);
  spacer(s3);
  subtitle(s3, 'Évaluation', 2);
  thead(s3, ['Indicateur', 'Valeur']);
  [
    ['Prix d’achat', input.price, MONEY],
    ['Prix / porte', r.pricePerDoor, MONEY],
    ['Prix / pi²', r.pricePerSqft, MONEY2],
    ['Cap rate réel (NOI ÷ prix)', r.capRate, PCT],
    ['Cap marché (région + actif)', r.capMkt, PCT],
    ['Valeur implicite (NOI ÷ cap marché)', r.impliedValue, MONEY],
    ['Écart valeur − prix', r.impliedValue - input.price, MONEY],
  ].forEach(([l, v, f], i) => trow(s3, [l, v], { fmt: [null, f], zebra: i }));
  spacer(s3);
  subtitle(s3, 'Financement', 2);
  thead(s3, ['Poste', 'Valeur']);
  [
    ['Programme', meta.programLabel || '—', null],
    ['Prêt selon la valeur (RPV)', r.loanByLTV, MONEY],
    ['Prêt selon la couverture (RCD)', r.loanByDCR, MONEY],
    ['Prêt retenu', r.loanTaken, MONEY],
    ['Contrainte', r.bindingConstraint === 'coverage' ? 'Couverture (RCD)' : 'Valeur (RPV)', null],
    ['Prime SCHL', r.premium, MONEY],
    ['Taux de prime', r.premiumRate, PCT],
    ['Prêt assuré (prime capitalisée)', r.financedLoan, MONEY],
    ['Taux hypothécaire', input.rate / 100, PCT],
    ['Amortissement', `${input.amort} ans`, null],
    ['Service de la dette annuel', r.annualDebtService, MONEY],
    ['Mise de fonds + frais', r.equityInvested, MONEY],
    ['Mise de fonds (% du prix)', r.downPaymentPct, PCT],
  ].forEach(([l, v, f], i) => trow(s3, [l, v], { fmt: [null, f], zebra: i }));

  // ================= ONGLET 4 — PRO FORMA =================
  const s4 = wb.addWorksheet('Pro forma', { views: [{ showGridLines: false, state: 'frozen', ySplit: 3 }] });
  s4.columns = [{ width: 9 }, { width: 15 }, { width: 15 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 12 }];
  banner(s4, 'PRO FORMA — DÉTENTION & REVENTE', 9);
  thead(s4, ['Année', 'NOI', 'Service dette', 'Flux', 'Flux cumulé', 'Solde prêt', 'Valeur', 'Équité', 'TRI période']);
  r.proforma.forEach((p, i) => {
    const row = trow(s4, [
      `An ${p.year}`, p.noi, p.debtService, p.cashFlow, p.cumulativeCashFlow, p.loanBalance, p.propertyValue, p.equity,
      p.periodIRR == null || !isFinite(p.periodIRR) ? irrText(p.periodIRR) : p.periodIRR,
    ], { fmt: [null, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY, (p.periodIRR != null && isFinite(p.periodIRR)) ? PCT : null], zebra: i });
    row.getCell(4).font = { color: { argb: p.cashFlow >= 0 ? GREEN : RED } };
  });
  spacer(s4);
  const saleRow = trow(s4, ['Vente', '', '', '', '', '', '', 'Produit net', r.netSaleProceeds], { fmt: [null, null, null, null, null, null, null, null, MONEY], bold: true, fill: SOFT });
  saleRow.getCell(9).numFmt = MONEY;
  trow(s4, ['', '', '', '', '', '', '', 'Distributions totales', r.totalDistributions], { fmt: [null, null, null, null, null, null, null, null, MONEY], bold: true });

  // ================= ONGLET 5 — RENDEMENT & SENSIBILITÉS =================
  const s5 = wb.addWorksheet('Rendement & sensibilités', { views: [{ showGridLines: false }] });
  s5.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];
  banner(s5, 'RENDEMENT & SENSIBILITÉS', 5);
  spacer(s5);
  subtitle(s5, 'Rendement vs objectifs', 5);
  thead(s5, ['Critère', 'Réel', 'Objectif', '', 'Atteint']);
  const rendRows = [
    ['TRI', irrText(r.irr), pctt(obj.targetIRRPct / 100, 1), r.irr != null && (!isFinite(r.irr) || r.irr * 100 >= obj.targetIRRPct)],
    ['RCD', mult(r.dscr), mult(obj.minDSCR), r.dscr >= obj.minDSCR],
    ['Rendement comptant', pctt(r.cashOnCash), pctt(obj.minCashOnCashPct / 100, 1), r.cashOnCash * 100 >= obj.minCashOnCashPct],
    ['Multiple d’équité', mult(r.equityMultiple), mult(obj.minEquityMultiple), r.equityMultiple >= obj.minEquityMultiple],
    ['Flux année 1', money(r.cashFlowYr1), '≥ 0 $', r.cashFlowYr1 >= 0],
  ];
  rendRows.forEach(([c, real, target, ok], i) => {
    const row = trow(s5, [c, real, target, '', ok ? '✓' : '✗'], { zebra: i });
    s5.mergeCells(row.number, 3, row.number, 4);
    row.getCell(5).font = { bold: true, color: { argb: ok ? GREEN : RED } };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  spacer(s5);
  subtitle(s5, 'Sensibilité — cap de sortie', 5);
  thead(s5, ['Cap sortie', 'Valeur revente', 'Net à l’équité', 'TRI', 'Multiple']);
  (state.sensCap || []).forEach((row, i) => {
    trow(s5, [row.exitCapPct / 100, row.propertyValue, row.netToEquity, row.irr == null || !isFinite(row.irr) ? irrText(row.irr) : row.irr, row.equityMultiple],
      { fmt: [PCT, MONEY, MONEY, (row.irr != null && isFinite(row.irr)) ? PCT : null, MULTF], zebra: i });
  });
  spacer(s5);
  subtitle(s5, 'Sensibilité — taux d’intérêt', 5);
  thead(s5, ['Taux', 'Service dette', 'RCD', 'Flux an 1', 'TRI']);
  (state.sensRate || []).forEach((row, i) => {
    const rr = trow(s5, [row.ratePct / 100, row.annualDebtService, isFinite(row.dscr) ? row.dscr : 99, row.cashFlowYr1, row.irr == null || !isFinite(row.irr) ? irrText(row.irr) : row.irr],
      { fmt: [PCT, MONEY, MULTF, MONEY, (row.irr != null && isFinite(row.irr)) ? PCT : null], zebra: i });
    rr.getCell(4).font = { color: { argb: row.cashFlowYr1 >= 0 ? GREEN : RED } };
  });

  // ================= ONGLET 6 — VALORISATION =================
  const s6 = wb.addWorksheet('Valorisation', { views: [{ showGridLines: false }] });
  s6.columns = [{ width: 34 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];
  banner(s6, 'VALORISATION — LOYERS ACTUELS VS MARCHÉ', 5);
  spacer(s6);
  if (va && va.hasMix) {
    subtitle(s6, 'Loyers par type', 5);
    thead(s6, ['Type', 'Unités', 'Actuel', 'Marché SCHL', 'Écart']);
    let zj = 0;
    for (const k of ['studio', 'br1', 'br2', 'br3']) {
      const m = input.unitMix && input.unitMix[k];
      if (m && m.count > 0) {
        const mk = rents[k];
        const row = trow(s6, [TYPE_FR[k], m.count, m.rent, mk == null ? 'n/d' : mk, mk == null ? '' : mk - m.rent],
          { fmt: [null, null, MONEY, mk == null ? null : MONEY, mk == null ? null : MONEY], zebra: zj++ });
        if (mk != null) row.getCell(5).font = { color: { argb: mk - m.rent > 0 ? 'FFB7791F' : GREEN } };
      }
    }
    spacer(s6);
    subtitle(s6, 'Synthèse de valorisation', 5);
    thead(s6, ['Indicateur', 'Valeur', '', '', '']);
    const vlines = [
      ['Loyer actuel (mensuel, total)', va.currentRentMonthly, MONEY],
      ['Loyer marché (mensuel, total)', va.marketRentMonthly, MONEY],
      ['Écart mensuel', va.rentGapMonthly, MONEY],
      ['Écart (%)', va.rentGapPct, PCT],
      ['NOI stabilisé (au marché)', va.stabilized.noi, MONEY],
      ['Hausse de NOI', va.noiLift, MONEY],
      ['Upside de valeur (cap marché)', va.upsideValue, MONEY],
    ];
    vlines.forEach(([l, v, f], i) => {
      const row = trow(s6, [l, v, '', '', ''], { fmt: [null, f], zebra: i });
      s6.mergeCells(row.number, 2, row.number, 5);
    });
    const opp = trow(s6, ['Occasion de valorisation', va.isOpportunity ? `Oui — verdict stabilisé : ${VERDICT_FR[state.stabilizedVerdict] || '—'}` : 'Non (écart < 8 %)', '', '', ''], { bold: true, fill: SOFT });
    s6.mergeCells(opp.number, 2, opp.number, 5);
  } else {
    trow(s6, ['Mix locatif non renseigné — valorisation indisponible.', '', '', '', '']);
  }

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `analyse-${slug(state)}.xlsx`,
  );
}

// ============================================================================
// 2) MÉMO D'INVESTISSEMENT (DOCX)
// ============================================================================
export async function exportMemo(state) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = docx;
  const { input, decision, va, meta } = state;
  const r = decision.result, rec = decision.recommendation, mp = decision.maxPrice;

  const T = (text, o = {}) => new TextRun({ text, ...o });
  const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [T(children)], ...o });
  const H = (text, level = HeadingLevel.HEADING_2) => new Paragraph({ text, heading: level, spacing: { before: 260, after: 120 } });
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'DDD7CC' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDD7CC' },
    left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EDE7DB' }, insideVertical: { style: BorderStyle.NONE },
  };
  const kvTable = pairs => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders,
    rows: pairs.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [P([T(k, { color: '555555' })])] }),
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [P([T(v, { bold: true })])] }),
      ],
    })),
  });
  const gridTable = (header, dataRows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders,
    rows: [
      new TableRow({ tableHeader: true, children: header.map(h => new TableCell({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: '6E2B26' }, children: [P([T(h, { bold: true, size: 16, color: 'F4F0E6' })])] })) }),
      ...dataRows.map((cells, i) => new TableRow({
        children: cells.map(c => new TableCell({ shading: i % 2 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F7F4EE' } : undefined, children: [P([T(String(c), { size: 18 })])] })),
      })),
    ],
  });

  const children = [];
  children.push(new Paragraph({ children: [T('MÉMO D’INVESTISSEMENT', { bold: true, size: 36, color: '6E2B26' })] }));
  children.push(P([T(meta.address || meta.regionLabel || 'Transaction multilogement', { size: 24 })], { spacing: { after: 60 } }));
  children.push(P([T(`${input.units} unités · ${meta.assetLabel || ''} · ${meta.regionLabel || ''}`, { color: '777777', size: 18 })]));
  children.push(P([T(`Généré le ${dateStr(meta.generatedAt)} · Elevate Deal Analyzer`, { color: '999999', size: 16 })], { spacing: { after: 200 } }));

  children.push(H('Recommandation'));
  children.push(P([T(VERDICT_FR[rec.verdict] || '—', { bold: true, size: 32, color: rec.verdict === 'BUY' ? '2E7D32' : rec.verdict === 'PASS' ? 'B23A36' : 'B7791F' })]));
  children.push(P([T(`${rec.metCount} / 4 critères de rendement atteints`, { color: '777777', size: 18 })], { spacing: { after: 100 } }));
  for (const reason of rec.reasons) {
    children.push(P([
      T(reason.ok ? '✓ ' : '✗ ', { bold: true, color: reason.ok ? '2E7D32' : 'B23A36' }),
      T(`${reason.label} : `, { bold: true }), T(reason.detail),
    ], { spacing: { after: 40 } }));
  }

  children.push(H('Sommaire financier'));
  children.push(kvTable([
    ['Prix demandé', money(input.price)],
    ['Prix recommandé (TRI cible)', mp.feasible ? money(mp.recommendedPrice) : '—'],
    ['Plafond finançable (RCD min)', mp.feasible ? money(mp.maxPrice) : '—'],
    ['Cap rate réel', pctt(r.capRate)], ['Cap marché', pctt(r.capMkt)],
    ['Valeur implicite (cap marché)', money(r.impliedValue)],
    ['RBE (NOI)', money(r.noi)], ['RCD (DSCR)', mult(r.dscr)],
    ['Rendement comptant (an 1)', pctt(r.cashOnCash)], ['Multiple d’équité', mult(r.equityMultiple)],
    ['TRI', irrText(r.irr)], ['Flux de trésorerie an 1', money(r.cashFlowYr1)],
  ]));

  children.push(H('Financement'));
  children.push(kvTable([
    ['Programme', meta.programLabel || '—'],
    ['Prêt retenu', `${money(r.loanTaken)} (plafonné par ${r.bindingConstraint === 'coverage' ? 'la couverture' : 'la valeur'})`],
    ['Prime SCHL', `${money(r.premium)} · ${pctt(r.premiumRate)}`],
    ['Taux hypothécaire', `${pctt(input.rate / 100)} · ${input.amort} ans`],
    ['Service de la dette annuel', money(r.annualDebtService)],
    ['Mise de fonds + frais', `${money(r.equityInvested)} (${pctt(r.downPaymentPct, 0)} du prix)`],
  ]));

  if (va && va.hasMix) {
    children.push(H('Valorisation (potentiel d’optimisation)'));
    children.push(kvTable([
      ['Loyer actuel (mensuel)', money(va.currentRentMonthly)],
      ['Loyer marché SCHL (mensuel)', money(va.marketRentMonthly)],
      ['Écart au marché', `${money(va.rentGapMonthly)}/mois (${pctt(va.rentGapPct, 0)})`],
      ['NOI stabilisé', money(va.stabilized.noi)], ['Upside de valeur', money(va.upsideValue)],
    ]));
    if (state.stabilizedVerdict) children.push(P([T('Au loyer de marché, ce deal devient « ', {}), T(VERDICT_FR[state.stabilizedVerdict], { bold: true }), T(' » (verdict stabilisé).')], { spacing: { before: 80 } }));
  }

  children.push(H('Drapeaux rouges'));
  if (!decision.redFlags.length) {
    children.push(P([T('Aucun drapeau rouge automatique détecté.', { color: '2E7D32' })]));
  } else {
    for (const f of decision.redFlags) {
      children.push(P([T(f.severity === 'danger' ? '● ' : '○ ', { bold: true, color: f.severity === 'danger' ? 'B23A36' : 'B7791F' }), T(f.title, { bold: true })], { spacing: { before: 100, after: 20 } }));
      children.push(P([T('Pourquoi : ', { italics: true, color: '777777' }), T(f.why, { size: 18 })]));
      children.push(P([T('Impact : ', { italics: true, color: '777777' }), T(f.impact, { size: 18 })]));
      children.push(P([T('Mitigation : ', { italics: true, color: '777777' }), T(f.mitigation, { size: 18 })]));
    }
  }

  children.push(H('Pro forma'));
  children.push(gridTable(
    ['Année', 'NOI', 'Service dette', 'Flux', 'Solde prêt', 'Valeur'],
    r.proforma.map(p => [`An ${p.year}`, money(p.noi), money(p.debtService), money(p.cashFlow), money(p.loanBalance), money(p.propertyValue)]),
  ));
  children.push(P([T('Produit net de revente : ', { color: '555555' }), T(money(r.netSaleProceeds), { bold: true })], { spacing: { before: 100 } }));

  children.push(H('Avertissement', HeadingLevel.HEADING_3));
  children.push(P([T('Estimations de pré-sélection — ne constitue pas un conseil financier. Les taux de capitalisation et paramètres SCHL sont des repères de marché à valider avec un courtier hypothécaire / prêteur avant toute offre.', { italics: true, color: '777777', size: 16 })]));

  const doc = new Document({
    creator: 'Elevate Deal Analyzer',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });
  download(await Packer.toBlob(doc), `memo-${slug(state)}.docx`);
}

// Montant entier → mots français (pour « montant en lettres »). 0 .. 999 999 999.
const FR_U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
function frBelow100(n) {
  if (n < 20) return FR_U[n];
  const t = Math.floor(n / 10), u = n % 10;
  if (t === 7) return u === 0 ? 'soixante-dix' : u === 1 ? 'soixante-et-onze' : 'soixante-' + FR_U[10 + u];
  if (t === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + FR_U[u];
  if (t === 9) return u === 0 ? 'quatre-vingt-dix' : 'quatre-vingt-' + FR_U[10 + u];
  const base = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][t];
  return u === 0 ? base : u === 1 ? base + '-et-un' : base + '-' + FR_U[u];
}
function frBelow1000(n) {
  if (n < 100) return frBelow100(n);
  const h = Math.floor(n / 100), r = n % 100;
  let s = (h > 1 ? FR_U[h] + ' ' : '') + 'cent' + (h > 1 && r === 0 ? 's' : '');
  return r > 0 ? s + ' ' + frBelow100(r) : s;
}
function frMontantLettres(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'zéro';
  const parts = [];
  const mds = Math.floor(n / 1e9); n %= 1e9;
  const mil = Math.floor(n / 1e6); n %= 1e6;
  const mille = Math.floor(n / 1000); n %= 1000;
  if (mds > 0) parts.push(frBelow1000(mds) + ' milliard' + (mds > 1 ? 's' : ''));
  if (mil > 0) parts.push(frBelow1000(mil) + ' million' + (mil > 1 ? 's' : ''));
  if (mille > 0) parts.push(mille === 1 ? 'mille' : frBelow1000(mille) + ' mille');
  if (n > 0) parts.push(frBelow1000(n));
  return parts.join(' ');
}

// ============================================================================
// 3) PROMESSE D'ACHAT (DOCX) — modèle Québec complet (16 articles + annexes),
//    auto-rempli depuis le questionnaire (offer).
// ============================================================================
const NAVY = '1F3864';
export async function exportOffer(state, offer = {}) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, Footer, PageNumber } = docx;
  const { input, decision, meta } = state;
  const r = decision.result;

  // ---- valeurs (avec défauts raisonnables) ----
  const v = (val, fb = '____________________') => (val == null || String(val).trim() === '' ? fb : String(val).trim());
  const offerPrice = offer.offerPrice > 0 ? offer.offerPrice : (decision.maxPrice.feasible ? Math.round(decision.maxPrice.recommendedPrice) : input.price);
  const deposit = offer.deposit > 0 ? offer.deposit : Math.round(offerPrice * 0.05);
  const ddDays = offer.ddDays || 15, finDays = offer.finDays || 75, finExt = offer.finExtDays || 30;
  const closeDays = offer.closingDays || 90, irrev = offer.irrevocableDays || 7;
  const depDays = offer.depositDays || 5, docDays = offer.vendorDocsDays || 5;
  const land = offer.allocLand || 0, building = offer.allocBuilding || 0, chattels = offer.allocChattels || 0;
  const allocTotal = land + building + chattels;
  const ville = v(offer.city, '____________');
  const longDate = (meta.generatedAt instanceof Date ? meta.generatedAt : new Date()).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });

  // ---- helpers de mise en forme (style modèle : bleu marine) ----
  const T = (text, o = {}) => new TextRun({ text: String(text), ...o });
  const PJ = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [T(runs, { size: 20 })], spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED, ...o });
  const LI = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 50 }, children: [T(text, { size: 20 })] });
  const H = (txt) => new Paragraph({ spacing: { before: 280, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY } }, children: [T(txt, { bold: true, size: 24, color: NAVY })] });
  const tb = { style: BorderStyle.SINGLE, size: 2, color: 'B8C2D9' };
  const tbIn = { style: BorderStyle.SINGLE, size: 2, color: 'D6DCE9' };
  const BORDERS = { top: tb, bottom: tb, left: tb, right: tb, insideHorizontal: tbIn, insideVertical: tbIn };
  const Cell = (runs, { w, fill, bold } = {}) => new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({ children: Array.isArray(runs) ? runs : [T(runs, { bold, size: 20 })] })],
  });
  // Cellule multi-paragraphes (signatures) — ne pas ré-emballer dans un paragraphe
  const CellP = (paras, { w } = {}) => new TableCell({ width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined, margins: { top: 50, bottom: 50, left: 90, right: 90 }, children: paras });
  const HRow = (...labels) => new TableRow({ tableHeader: true, children: labels.map(l => Cell([T(l, { bold: true, color: 'FFFFFF', size: 20 })], { fill: NAVY })) });
  const KV = (k, val, kw = 34) => new TableRow({ children: [Cell([T(k, { bold: true, size: 20 })], { w: kw, fill: 'EDF0F7' }), Cell([T(val, { size: 20 })], { w: 100 - kw })] });
  const Tbl = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows });

  const c = [];
  // ---- En-tête ----
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [T('PROMESSE D’ACHAT', { bold: true, size: 36, color: NAVY })] }));
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [T(v(offer.propertyAddress || meta.address, 'Immeuble résidentiel à logements multiples'), { bold: true, size: 22, color: NAVY })] }));
  c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [T(`Fait à ${ville}, le ${longDate}.`, { italics: true, size: 20 })] }));

  // ---- 1. Parties ----
  c.push(H('1. Parties'));
  c.push(Tbl([
    HRow('ACHETEUR', ''),
    KV('Dénomination', v(offer.buyerName) + (offer.buyerAffiliate ? ' ou toute autre entité associée ou liée qu’il désigne' : '')),
    KV('Représentant autorisé', v(offer.buyerRep, '____________, dûment autorisé')),
    KV('Adresse', v(offer.buyerAddress)), KV('Téléphone', v(offer.buyerPhone)), KV('Courriel', v(offer.buyerEmail)),
  ]));
  c.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  c.push(Tbl([
    HRow('VENDEUR', ''),
    KV('Dénomination', v(offer.sellerName)), KV('Représentant autorisé', v(offer.sellerRep, '____________, dûment autorisé')),
    KV('Adresse', v(offer.sellerAddress)), KV('Téléphone', v(offer.sellerPhone)), KV('Courriel', v(offer.sellerEmail)),
  ]));
  c.push(PJ('Aux fins des présentes, le promettant-acheteur est désigné « l’Acheteur » et le promettant-vendeur « le Vendeur ». L’immeuble visé est désigné « l’Immeuble ».'));

  // ---- 2. Immeuble ----
  c.push(H('2. Immeuble'));
  c.push(Tbl([
    HRow('Caractéristique', 'Immeuble'),
    KV('Adresse', v(offer.propertyAddress || meta.address)),
    KV('Cadastre (lot)', v(offer.lot)),
    KV('Matricule', v(offer.matricule)),
    KV('Unités / logements', String(input.units)),
    KV('Zonage', v(offer.zonage)),
  ]));
  c.push(PJ('L’Immeuble est vendu avec tous ses accessoires, améliorations et équipements permanents, incluant les biens meubles énumérés à l’Annexe B (Inclusions / exclusions), notamment les électroménagers fournis par le Vendeur dans les logements.'));

  // ---- 3. Prix et répartition ----
  c.push(H('3. Prix d’achat et répartition'));
  c.push(Tbl([
    KV('Prix global', `${money(offerPrice)} CAD (${frMontantLettres(offerPrice)} dollars)`),
    KV('Modalité', `Comptant à la signature de l’acte de vente notarié${offer.depositEnabled !== false ? ', sous réserve de l’acompte (art. 5)' : ''}.`),
    KV('Ajustements', 'Selon l’article 9 et les pratiques notariales usuelles, à la date de clôture.'),
  ]));
  if (allocTotal > 0) {
    c.push(new Paragraph({ spacing: { before: 100, after: 60 }, children: [T('Répartition du prix (fins fiscales et droits de mutation) :', { size: 20 })] }));
    c.push(Tbl([
      HRow('RÉPARTITION DU PRIX', 'Montant'),
      KV('Terrain', money(land)), KV('Bâtiment', money(building)),
      KV('Biens meubles (électros, mobilier)', money(chattels)),
      KV('Total', money(allocTotal)),
    ]));
  }

  // ---- 4. Vente sans garantie légale ----
  c.push(H('4. Vente ' + (offer.warranty === 'avec' ? 'avec garantie légale' : 'sans garantie légale')));
  if (offer.warranty === 'avec') {
    c.push(PJ([T('L’Immeuble est vendu avec la garantie légale de qualité et de propriété prévue au Code civil du Québec.', { size: 20 })]));
  } else {
    c.push(PJ([T('L’Immeuble est vendu ', { size: 20 }), T('SANS GARANTIE LÉGALE de qualité, AUX RISQUES ET PÉRILS de l’Acheteur', { bold: true, size: 20 }), T(', conformément aux articles 1732 et 1733 du Code civil du Québec. L’Acheteur déclare avoir eu l’occasion d’inspecter l’Immeuble et d’effectuer toutes les vérifications qu’il a jugées nécessaires, sous réserve de la condition de vérification diligente prévue à l’article 5.', { size: 20 })]));
  }
  c.push(PJ('Le Vendeur garantit toutefois son titre de propriété et le droit de vendre l’Immeuble libre de toute charge non divulguée, à l’exception des hypothèques qui seront radiées à la clôture.'));

  // ---- 5. Conditions suspensives (blocs dynamiques, lettrés a/b/c…) ----
  c.push(H('5. Conditions suspensives'));
  c.push(PJ('La présente promesse est conditionnelle à la réalisation, à la satisfaction de l’Acheteur, des conditions suivantes :'));
  const condBlocks = [];
  condBlocks.push({
    title: `Vérification diligente — ${ddDays} jours suivant la réception des documents`,
    body: [
      PJ(`L’Acheteur disposera d’un délai de ${ddDays} jours civils, calculé à compter de la réception de l’ensemble des documents énumérés à l’Annexe A, pour réaliser ses vérifications usuelles, incluant :`),
      ...['Examen des titres au Registre foncier et vérification du zonage et des usages;',
        'Revue des baux, du rent-roll, des états financiers (3 derniers exercices), des factures d’énergie, de taxes et d’assurance;',
        'Inspection du bâtiment et de ses composantes principales (toiture, structure, plomberie, électricité, CVAC);',
        'Rapport environnemental Phase I (Phase II au besoin);',
        'Certificat de localisation à jour (à fournir par le Vendeur).'].map(LI),
    ],
  });
  if (offer.financingEnabled !== false) {
    condBlocks.push({
      title: `Financement — ${finDays} jours suivant l’acceptation`,
      body: [PJ(`Obtention par l’Acheteur d’un financement hypothécaire (${v(meta.programLabel, 'SCHL / MLI Select ou conventionnel')}) à des conditions jugées satisfaisantes (prêt visé ≈ ${money(r.loanTaken)}, RCD ≈ ${mult(r.dscr)}). Si une demande SCHL / MLI Select est pendante à l’expiration de ce délai, l’Acheteur pourra, sur avis écrit au Vendeur avant l’échéance, prolonger ce délai d’une période additionnelle de ${finExt} jours; la date de clôture sera reportée d’autant.`)],
    });
  }
  if (offer.internalApprovals) {
    condBlocks.push({ title: 'Approbations internes', body: [PJ(`Approbation de la transaction par le conseil et/ou les investisseurs de l’Acheteur dans les ${offer.internalDays || ddDays} jours suivant l’acceptation.`)] });
  }
  if (offer.depositEnabled !== false) {
    condBlocks.push({
      title: `Acompte — dans les ${depDays} jours suivant la levée de la vérification diligente`,
      body: [
        PJ(`Un acompte de ${money(deposit)} (${frMontantLettres(deposit)} dollars) sera versé en fidéicommis chez le notaire instrumentant, Me ${v(offer.notary, '____________')}, dans les ${depDays} jours suivant la levée de la condition de vérification diligente. Cet acompte sera imputé sur le prix à la clôture.`),
        PJ('L’acompte est entièrement remboursable à l’Acheteur si l’une des conditions suspensives n’est pas réalisée ou levée dans les délais prescrits, ou si la vente n’est pas conclue pour une cause non imputable à la faute de l’Acheteur. L’acompte devient acquis de plein droit au Vendeur, à titre de dommages-intérêts liquidés et sans préjudice à tout autre recours, uniquement si, toutes les conditions suspensives ayant été levées, l’Acheteur fait défaut de conclure la vente.'),
      ],
    });
  }
  const LET = 'abcdefghij';
  condBlocks.forEach((blk, i) => {
    c.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [T(`${LET[i]}) ${blk.title}.`, { bold: true, size: 20 })] }));
    blk.body.forEach(p => c.push(p));
  });
  c.push(PJ(`Le Vendeur s’engage à fournir les documents prévus à l’Annexe A dans les ${docDays} jours ouvrables suivant l’acceptation et à donner accès raisonnable à l’Immeuble sur préavis de 24 h. Le délai de vérification diligente ne commence à courir qu’à compter de la réception, par l’Acheteur, de l’ensemble de ces documents.`));

  // ---- 6. Clôture ----
  c.push(H('6. Clôture'));
  c.push(Tbl([
    KV('Délai', `${closeDays} jours civils suivant l’acceptation (sujet à prolongation — art. 5 b).`),
    KV('Lieu', 'Devant notaire, au bureau convenu entre les parties.'),
    KV('Frais', 'Frais de notaire et droits de mutation à la charge de l’Acheteur; honoraires juridiques respectifs à chaque partie.'),
    KV('Remise des clés', 'Le jour de la clôture, contre paiement du solde du prix.'),
  ]));

  // ---- 7. Déclarations du Vendeur ----
  c.push(H('7. Déclarations et garanties du Vendeur'));
  c.push(PJ('Le Vendeur déclare et garantit à l’Acheteur, à la date des présentes et à la date de clôture :'));
  ['Qu’il est propriétaire de l’Immeuble et a le plein pouvoir de le vendre;',
    'Que les titres sont clairs de toute charge non divulguée, à l’exception des hypothèques qui seront radiées à la clôture, et qu’aucune hypothèque légale ne grève l’Immeuble;',
    'Qu’aucun avis d’expropriation, ordonnance, avis de non-conformité, avis de travaux ou litige n’affecte l’Immeuble, et qu’aucune procédure n’est pendante devant le Tribunal administratif du logement;',
    'Que les usages actuels sont légaux — conformes ou bénéficiant de droits acquis;',
    'À sa connaissance, qu’aucune contamination ni matière dangereuse n’affecte l’Immeuble;',
    'Que le rent-roll, les baux et les états financiers remis sont exacts et complets;',
    'Qu’il n’existe aucun employé ni convention collective liés à l’Immeuble, sauf ce qui est divulgué à l’Annexe A.'].forEach(t => c.push(LI(t)));

  // ---- 8. Engagements du Vendeur ----
  c.push(H('8. Engagements du Vendeur entre la présente et la clôture'));
  ['Maintenir l’Immeuble en bon état et les assurances en vigueur;',
    'Ne pas conclure de nouveaux baux ni modifier les baux existants sans l’accord écrit de l’Acheteur;',
    'Ne pas grever l’Immeuble de nouvelles charges;',
    'Aviser l’Acheteur de tout événement matériel (sinistre, avis d’autorité, litige, départ de locataire).'].forEach(t => c.push(LI(t)));

  // ---- 9. Baux ----
  c.push(H('9. Baux, dépôts et ajustements'));
  c.push(PJ('À la clôture, le Vendeur cède à l’Acheteur l’ensemble des baux, remet les dossiers des locataires et transfère tout dépôt, loyer payé d’avance ou avantage détenu en lien avec les baux. Le Vendeur fournira, sur demande, des certificats d’estoppel des locataires confirmant le loyer, les arrérages et l’absence de litige.'));
  c.push(PJ('Les ajustements seront effectués à la date de clôture et porteront notamment sur : taxes municipales et scolaires, loyers, dépôts de locataires, énergie, contrats de service et assurances.'));

  // ---- 10. TPS/TVQ ----
  c.push(H('10. TPS / TVQ'));
  c.push(PJ('Les parties reconnaissent que la vente d’un complexe résidentiel usagé est généralement exonérée de la TPS et de la TVQ. Dans la mesure où la transaction serait taxable, l’Acheteur fournira ses numéros d’inscription et procédera à l’autocotisation applicable, et le prix sera réputé exclure ces taxes.'));

  // ---- 11. Cession ----
  c.push(H('11. Cession de la promesse'));
  c.push(PJ('L’Acheteur pourra, avant la clôture et sur simple avis écrit au Vendeur, céder la présente promesse à une société ou entité liée qu’il contrôle, qui prendra le titre à la clôture, sans que l’Acheteur initial ne soit libéré de ses obligations.'));

  // ---- 12. Défaut ----
  c.push(H('12. Défaut et recours'));
  c.push(PJ('En cas de défaut de l’Acheteur de conclure la vente après la levée de toutes les conditions, le Vendeur conservera l’acompte à titre de dommages-intérêts liquidés, sans préjudice à tout autre recours. En cas de défaut du Vendeur, l’Acheteur pourra, à son choix, exiger l’exécution en nature de la vente (action en passation de titre) ou réclamer des dommages-intérêts, en plus du remboursement de l’acompte.'));

  // ---- 13. Courtage ----
  c.push(H('13. Courtage'));
  if (offer.brokerage === 'yes') {
    c.push(PJ(`Le courtier ${v(offer.brokerName)} est intervenu dans la présente transaction et sa rétribution est à la charge de ${v(offer.brokerCharge, 'du Vendeur')}. Chaque partie indemnise l’autre de toute réclamation de commission découlant de ses propres ententes.`));
  } else {
    c.push(PJ('Les parties déclarent qu’aucun courtier immobilier n’est intervenu dans la présente transaction. Chaque partie indemnise l’autre de toute réclamation de commission découlant de ses propres ententes.'));
  }

  // ---- 14. Avis ----
  c.push(H('14. Avis'));
  c.push(PJ('Tout avis sera valablement donné par courriel aux adresses indiquées à l’article 1 (avec accusé de réception ou confirmation de transmission) ou par courrier recommandé; l’avis par courriel est réputé reçu le jour ouvrable de sa transmission.'));

  // ---- 15. Dispositions générales ----
  c.push(H('15. Dispositions générales'));
  c.push(Tbl([
    KV('Confidentialité', 'Les parties gardent confidentiels les termes des présentes et les informations échangées en vérification diligente.'),
    KV('Loi applicable', `Lois du Québec — Code civil du Québec. District judiciaire de ${v(offer.district, '____________')}.`),
    KV('Irrévocabilité', `La présente offre est irrévocable pendant ${irrev} jours civils suivant sa transmission au Vendeur.`),
    KV('Délais', 'Les délais sont de rigueur. Le seul écoulement du temps constitue la partie en demeure, sans avis.'),
    KV('Intégralité', 'La présente promesse et ses annexes constituent l’entente complète entre les parties.'),
    KV('Signature', 'Peut être signée par voie électronique, chaque exemplaire étant réputé original.'),
  ]));

  // ---- 16. Signatures ----
  c.push(H('16. Signatures'));
  const sigCell = (name) => CellP([
    new Paragraph({ spacing: { before: 360 }, children: [T('______________________________', { size: 20 })] }),
    new Paragraph({ children: [T(name, { bold: true, size: 20 })] }),
    new Paragraph({ children: [T('Date : _______________', { size: 20 })] }),
  ], { w: 50 });
  c.push(Tbl([
    HRow('ACHETEUR', 'VENDEUR'),
    new TableRow({ children: [sigCell(v(offer.buyerName, '[ nom ]')), sigCell(v(offer.sellerName, '[ nom ]'))] }),
  ]));

  // ---- Annexe A ----
  c.push(H('Annexe A — Documents à fournir par le Vendeur'));
  ['Tous les baux en vigueur et le rent-roll à jour;',
    'États financiers des trois (3) derniers exercices et le budget courant;',
    'Comptes de taxes municipales et scolaires;',
    'Factures d’énergie (12 derniers mois) et polices d’assurance;',
    'Contrats de service en vigueur (ascenseur, déneigement, entretien, etc.);',
    'Certificats de localisation à jour;',
    'Titres de propriété et documents relatifs aux droits acquis / au zonage;',
    'Rapports environnementaux, d’inspection ou d’ingénierie existants, le cas échéant;',
    'Liste des dépôts de locataires et de tout litige en cours.'].forEach(t => c.push(LI(t)));

  // ---- Annexe B ----
  c.push(H('Annexe B — Inclusions / exclusions'));
  c.push(PJ([T('Inclusions : ', { bold: true, size: 20 }), T(v(offer.inclusions, 'électroménagers fournis dans les logements et équipements permanents.'), { size: 20 })]));
  c.push(PJ([T('Exclusions : ', { bold: true, size: 20 }), T(v(offer.exclusions, 'aucune.'), { size: 20 })]));

  c.push(new Paragraph({ spacing: { before: 280 }, children: [T('Document généré par Elevate Deal Analyzer à partir du modèle de promesse d’achat. Il ne constitue pas un avis juridique — faire réviser par un notaire ou conseiller juridique avant transmission.', { italics: true, color: '999999', size: 16 })] }));

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [T('Initiales : _______  _______          Page ', { size: 16, color: '999999' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' })] })] });
  const doc = new Document({
    creator: 'Elevate Deal Analyzer',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, footers: { default: footer }, children: c }],
  });
  download(await Packer.toBlob(doc), `promesse-achat-${slug(state)}.docx`);
}
