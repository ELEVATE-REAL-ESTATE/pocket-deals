// ============================================================================
// Slice C — Documents : export Excel (9 onglets), Mémo d'investissement (DOCX),
// Promesse d'achat (DOCX). Les libs lourdes (exceljs, docx) sont chargées en
// import dynamique → code-split, téléchargées seulement au clic.
//
// `state` (fourni par main.js) = { input, obj, decision, va, rents, region, meta }
//   decision = { result, recommendation, maxPrice, redFlags }   (cf. @elevate/domain)
// ============================================================================

// ---- Formatage (fr-CA) ----
const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('fr-CA');
const moneyC = n => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + ' M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(0) + ' k';
  return money(n);
};
const pctt = (v, dp = 2) =>
  v == null ? 'n/d' : !isFinite(v) ? '> 999 %'
  : (v * 100).toLocaleString('fr-CA', { minimumFractionDigits: dp, maximumFractionDigits: dp }) + ' %';
const mult = v => (isFinite(v) ? v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '∞') + '×';
const dateStr = d => (d instanceof Date ? d : new Date()).toLocaleDateString('fr-CA');
const VERDICT_FR = { BUY: 'ACHETER', RENEGOTIATE: 'RENÉGOCIER', PASS: 'PASSER' };
const TYPE_FR = { studio: 'Studio', br1: '1 chambre', br2: '2 chambres', br3: '3 chambres +' };

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
// 1) EXCEL — 9 onglets (ExcelJS)
// ============================================================================
const MONEY = '#,##0" $"';
const MONEY2 = '#,##0.00" $"';
const PCT = '0.00%';
const MULTF = '0.00"×"';

export async function exportExcel(state) {
  const mod = await import('exceljs');
  const ExcelJS = mod.Workbook ? mod : (mod.default && mod.default.Workbook ? mod.default : mod.default || mod);
  const { input, obj, decision, va, rents, meta } = state;
  const r = decision.result, rec = decision.recommendation, mp = decision.maxPrice;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elevate Deal Analyzer';
  wb.created = meta.generatedAt instanceof Date ? meta.generatedAt : new Date();

  // -- helpers de style --
  const title = (ws, text, span = 3) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, span);
    const c = row.getCell(1);
    c.font = { bold: true, size: 14, color: { argb: 'FFF4F0E6' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6E2B26' } };
    c.alignment = { vertical: 'middle' };
    row.height = 24;
    ws.addRow([]);
    return row;
  };
  const section = (ws, text, span = 3) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, span);
    const c = row.getCell(1);
    c.font = { bold: true, size: 11, color: { argb: 'FF6E2B26' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE7DB' } };
    return row;
  };
  const kv = (ws, label, value, fmt) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { color: { argb: 'FF555555' } };
    row.getCell(2).font = { bold: true };
    if (fmt) row.getCell(2).numFmt = fmt;
    return row;
  };
  const thead = (ws, cells) => {
    const row = ws.addRow(cells);
    row.font = { bold: true };
    row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE7DB' } }; });
    return row;
  };

  // --- Onglet 1 : Sommaire ---
  const s1 = wb.addWorksheet('Sommaire');
  s1.columns = [{ width: 40 }, { width: 22 }, { width: 22 }];
  title(s1, 'Sommaire de la transaction');
  kv(s1, 'Adresse', meta.address || '—');
  kv(s1, 'Région / marché', meta.regionLabel || '—');
  kv(s1, 'Type d’actif', meta.assetLabel || '—');
  kv(s1, 'Programme de financement', meta.programLabel || '—');
  kv(s1, 'Unités', input.units);
  kv(s1, 'Année de construction', meta.year || '—');
  kv(s1, 'Document généré le', dateStr(meta.generatedAt));
  s1.addRow([]);
  section(s1, 'Recommandation');
  kv(s1, 'Verdict', VERDICT_FR[rec.verdict] || '—');
  kv(s1, 'Critères de rendement atteints', `${rec.metCount} / 4`);
  s1.addRow([]);
  section(s1, 'Prix');
  kv(s1, 'Prix demandé', input.price, MONEY);
  kv(s1, 'Prix recommandé (TRI cible)', mp.feasible ? mp.recommendedPrice : 0, MONEY);
  kv(s1, 'Plafond finançable (RCD min)', mp.feasible ? mp.maxPrice : 0, MONEY);
  if (mp.feasible) kv(s1, 'Marge de sécurité', mp.marginOfSafety, PCT);
  s1.addRow([]);
  section(s1, 'Évaluation & rendement');
  kv(s1, 'Cap rate réel', r.capRate, PCT);
  kv(s1, 'Cap marché', r.capMkt, PCT);
  kv(s1, 'Valeur implicite (cap marché)', r.impliedValue, MONEY);
  kv(s1, 'RBE (NOI)', r.noi, MONEY);
  kv(s1, 'RCD (DSCR)', isFinite(r.dscr) ? r.dscr : 99, MULTF);
  kv(s1, 'Rendement comptant', r.cashOnCash, PCT);
  kv(s1, 'Multiple d’équité', r.equityMultiple, MULTF);
  kv(s1, 'TRI', r.irr == null ? 'n/d' : !isFinite(r.irr) ? '> 999 %' : r.irr, (r.irr != null && isFinite(r.irr)) ? PCT : undefined);
  kv(s1, 'Flux de trésorerie an 1', r.cashFlowYr1, MONEY);

  // --- Onglet 2 : Revenus ---
  const s2 = wb.addWorksheet('Revenus');
  s2.columns = [{ width: 30 }, { width: 14 }, { width: 16 }, { width: 16 }];
  title(s2, 'Revenus', 4);
  kv(s2, 'Revenu brut potentiel', input.grossRevenue, MONEY);
  kv(s2, 'Taux d’inoccupation', input.vacancyPct / 100, PCT);
  kv(s2, 'Revenu brut effectif (RBE)', r.egi, MONEY);
  s2.addRow([]);
  section(s2, 'Mix locatif', 4);
  thead(s2, ['Type', 'Unités', 'Loyer / mois', 'Loyer / an']);
  let mixUnits = 0, mixMonthly = 0;
  for (const k of ['studio', 'br1', 'br2', 'br3']) {
    const m = input.unitMix && input.unitMix[k];
    if (m && m.count > 0) {
      const row = s2.addRow([TYPE_FR[k], m.count, m.rent, m.rent * m.count * 12]);
      row.getCell(3).numFmt = MONEY; row.getCell(4).numFmt = MONEY;
      mixUnits += m.count; mixMonthly += m.rent * m.count;
    }
  }
  if (mixUnits > 0) {
    const tot = s2.addRow(['Total mix', mixUnits, mixMonthly, mixMonthly * 12]);
    tot.font = { bold: true };
    tot.getCell(3).numFmt = MONEY; tot.getCell(4).numFmt = MONEY;
    const other = Math.max(0, input.grossRevenue - mixMonthly * 12);
    kv(s2, 'Autres revenus (stationnement, etc.)', other, MONEY);
  } else {
    s2.addRow(['(mix locatif non renseigné)']);
  }

  // --- Onglet 3 : Dépenses (normalisées SCHL) ---
  const s3 = wb.addWorksheet('Dépenses');
  s3.columns = [{ width: 34 }, { width: 18 }];
  title(s3, 'Dépenses d’exploitation (normalisées SCHL)');
  const x = input.expenses;
  const mgmt = r.egi * (x.mgmtPct / 100);
  const reserve = input.units * x.reservePerDoor;
  kv(s3, 'Taxes municipales et scolaires', x.taxes, MONEY);
  kv(s3, 'Assurances', x.insurance, MONEY);
  kv(s3, 'Énergie', x.energy, MONEY);
  kv(s3, 'Eau / égouts', x.water, MONEY);
  kv(s3, 'Entretien et réparations', x.repairs, MONEY);
  kv(s3, 'Conciergerie', x.caretaking, MONEY);
  kv(s3, `Gestion (${x.mgmtPct.toLocaleString('fr-CA')} % du RBE)`, mgmt, MONEY);
  kv(s3, `Réserve de remplacement (${x.reservePerDoor} $/porte × ${input.units})`, reserve, MONEY);
  kv(s3, 'Divers', x.misc, MONEY);
  s3.addRow([]);
  const tot3 = kv(s3, 'Total des dépenses', r.opex, MONEY);
  tot3.getCell(1).font = { bold: true };
  kv(s3, 'Ratio de dépenses (sur brut)', r.expenseRatio, PCT);

  // --- Onglet 4 : RBE & Évaluation ---
  const s4 = wb.addWorksheet('Évaluation');
  s4.columns = [{ width: 36 }, { width: 20 }];
  title(s4, 'RBE & évaluation');
  kv(s4, 'Revenu brut effectif (RBE)', r.egi, MONEY);
  kv(s4, 'Dépenses d’exploitation', r.opex, MONEY);
  kv(s4, 'Revenu net d’exploitation (NOI)', r.noi, MONEY);
  s4.addRow([]);
  kv(s4, 'Prix / porte', r.pricePerDoor, MONEY);
  kv(s4, 'Prix / pi²', r.pricePerSqft, MONEY2);
  kv(s4, 'Cap rate réel (NOI ÷ prix)', r.capRate, PCT);
  kv(s4, 'Cap marché (par région + actif)', r.capMkt, PCT);
  kv(s4, 'Valeur implicite (NOI ÷ cap marché)', r.impliedValue, MONEY);
  kv(s4, 'Écart valeur − prix', r.impliedValue - input.price, MONEY);

  // --- Onglet 5 : Financement ---
  const s5 = wb.addWorksheet('Financement');
  s5.columns = [{ width: 38 }, { width: 20 }];
  title(s5, 'Financement');
  kv(s5, 'Programme', meta.programLabel || '—');
  kv(s5, 'Prêt selon la valeur (RPV)', r.loanByLTV, MONEY);
  kv(s5, 'Prêt selon la couverture (RCD)', r.loanByDCR, MONEY);
  kv(s5, 'Prêt retenu', r.loanTaken, MONEY);
  kv(s5, 'Contrainte', r.bindingConstraint === 'coverage' ? 'Couverture (RCD)' : 'Valeur (RPV)');
  kv(s5, 'Prime SCHL', r.premium, MONEY);
  kv(s5, 'Taux de prime', r.premiumRate, PCT);
  kv(s5, 'Prêt assuré (prime capitalisée)', r.financedLoan, MONEY);
  kv(s5, 'Taux hypothécaire', input.rate / 100, PCT);
  kv(s5, 'Amortissement (ans)', input.amort);
  kv(s5, 'Service de la dette annuel', r.annualDebtService, MONEY);
  s5.addRow([]);
  kv(s5, 'Mise de fonds + frais', r.equityInvested, MONEY);
  kv(s5, 'Mise de fonds (% du prix)', r.downPaymentPct, PCT);

  // --- Onglet 6 : Pro forma ---
  const s6 = wb.addWorksheet('Pro forma');
  s6.columns = [
    { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 },
  ];
  title(s6, 'Pro forma — détention & revente', 8);
  thead(s6, ['Année', 'NOI', 'Service dette', 'Flux', 'Solde prêt', 'Valeur', 'Équité', 'TRI période']);
  for (const p of r.proforma) {
    const row = s6.addRow([
      p.year, p.noi, p.debtService, p.cashFlow, p.loanBalance, p.propertyValue, p.equity,
      p.periodIRR == null ? 'n/d' : !isFinite(p.periodIRR) ? '> 999 %' : p.periodIRR,
    ]);
    [2, 3, 4, 5, 6, 7].forEach(i => { row.getCell(i).numFmt = MONEY; });
    if (p.periodIRR != null && isFinite(p.periodIRR)) row.getCell(8).numFmt = PCT;
  }
  s6.addRow([]);
  kv(s6, 'Produit net de revente', r.netSaleProceeds, MONEY);
  kv(s6, 'Distributions totales', r.totalDistributions, MONEY);

  // --- Onglet 7 : Rendement vs objectifs ---
  const s7 = wb.addWorksheet('Rendement');
  s7.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 12 }];
  title(s7, 'Rendement vs objectifs', 4);
  thead(s7, ['Critère', 'Réel', 'Objectif', 'Atteint']);
  const irrReal = r.irr == null ? 'n/d' : !isFinite(r.irr) ? '> 999 %' : pctt(r.irr);
  const rows7 = [
    ['TRI', irrReal, pctt(obj.targetIRRPct / 100, 1), (r.irr != null && (!isFinite(r.irr) || r.irr * 100 >= obj.targetIRRPct))],
    ['RCD', mult(r.dscr), mult(obj.minDSCR), r.dscr >= obj.minDSCR],
    ['Rendement comptant', pctt(r.cashOnCash), pctt(obj.minCashOnCashPct / 100, 1), r.cashOnCash * 100 >= obj.minCashOnCashPct],
    ['Multiple d’équité', mult(r.equityMultiple), mult(obj.minEquityMultiple), r.equityMultiple >= obj.minEquityMultiple],
    ['Flux année 1', money(r.cashFlowYr1), '≥ 0 $', r.cashFlowYr1 >= 0],
  ];
  for (const [c, real, target, ok] of rows7) {
    const row = s7.addRow([c, real, target, ok ? '✓' : '✗']);
    row.getCell(4).font = { bold: true, color: { argb: ok ? 'FF2E7D32' : 'FFB23A36' } };
  }

  // --- Onglet 8 : Sensibilités ---
  const s8 = wb.addWorksheet('Sensibilités');
  s8.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 12 }];
  title(s8, 'Sensibilité — cap de sortie', 5);
  thead(s8, ['Cap sortie', 'Valeur revente', 'Net à l’équité', 'TRI', 'Multiple']);
  for (const row of (state.sensCap || [])) {
    const rr = s8.addRow([
      row.exitCapPct / 100, row.propertyValue, row.netToEquity,
      row.irr == null ? 'n/d' : !isFinite(row.irr) ? '> 999 %' : row.irr, row.equityMultiple,
    ]);
    rr.getCell(1).numFmt = PCT; rr.getCell(2).numFmt = MONEY; rr.getCell(3).numFmt = MONEY;
    if (row.irr != null && isFinite(row.irr)) rr.getCell(4).numFmt = PCT;
    rr.getCell(5).numFmt = MULTF;
  }
  s8.addRow([]);
  title(s8, 'Sensibilité — taux d’intérêt', 5);
  thead(s8, ['Taux', 'Service dette', 'RCD', 'Flux an 1', 'TRI']);
  for (const row of (state.sensRate || [])) {
    const rr = s8.addRow([
      row.ratePct / 100, row.annualDebtService, isFinite(row.dscr) ? row.dscr : 99, row.cashFlowYr1,
      row.irr == null ? 'n/d' : !isFinite(row.irr) ? '> 999 %' : row.irr,
    ]);
    rr.getCell(1).numFmt = PCT; rr.getCell(2).numFmt = MONEY; rr.getCell(3).numFmt = MULTF; rr.getCell(4).numFmt = MONEY;
    if (row.irr != null && isFinite(row.irr)) rr.getCell(5).numFmt = PCT;
  }

  // --- Onglet 9 : Valorisation (value-add) ---
  const s9 = wb.addWorksheet('Valorisation');
  s9.columns = [{ width: 34 }, { width: 18 }, { width: 18 }];
  title(s9, 'Valorisation — loyers actuels vs marché');
  if (va && va.hasMix) {
    thead(s9, ['Type', 'Loyer actuel', 'Loyer marché SCHL']);
    for (const k of ['studio', 'br1', 'br2', 'br3']) {
      const m = input.unitMix && input.unitMix[k];
      if (m && m.count > 0) {
        const rr = s9.addRow([`${TYPE_FR[k]} (×${m.count})`, m.rent, rents[k] == null ? 'n/d' : rents[k]]);
        rr.getCell(2).numFmt = MONEY; if (rents[k] != null) rr.getCell(3).numFmt = MONEY;
      }
    }
    s9.addRow([]);
    kv(s9, 'Loyer actuel (mensuel, total)', va.currentRentMonthly, MONEY);
    kv(s9, 'Loyer marché (mensuel, total)', va.marketRentMonthly, MONEY);
    kv(s9, 'Écart mensuel', va.rentGapMonthly, MONEY);
    kv(s9, 'Écart (%)', va.rentGapPct, PCT);
    s9.addRow([]);
    kv(s9, 'NOI stabilisé (au marché)', va.stabilized.noi, MONEY);
    kv(s9, 'Hausse de NOI', va.noiLift, MONEY);
    kv(s9, 'Upside de valeur (au cap marché)', va.upsideValue, MONEY);
    kv(s9, 'Occasion de valorisation', va.isOpportunity ? 'Oui (écart ≥ 8 %)' : 'Non');
  } else {
    s9.addRow(['Mix locatif non renseigné — valorisation indisponible.']);
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
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = docx;
  const { input, obj, decision, va, meta } = state;
  const r = decision.result, rec = decision.recommendation, mp = decision.maxPrice;

  const T = (text, o = {}) => new TextRun({ text, ...o });
  const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [T(children)], ...o });
  const H = (text, level = HeadingLevel.HEADING_2) => new Paragraph({ text, heading: level, spacing: { before: 260, after: 120 } });
  const noBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'DDD7CC' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDD7CC' },
    left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EDE7DB' }, insideVertical: { style: BorderStyle.NONE },
  };
  const kvTable = pairs => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders,
    rows: pairs.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [P([T(k, { color: '555555' })])] }),
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [P([T(v, { bold: true })])] }),
      ],
    })),
  });
  const gridTable = (header, dataRows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map(h => new TableCell({ shading: { fill: 'EDE7DB' }, children: [P([T(h, { bold: true, size: 18 })])] })),
      }),
      ...dataRows.map(cells => new TableRow({
        children: cells.map(c => new TableCell({ children: [P([T(String(c), { size: 18 })])] })),
      })),
    ],
  });

  const irrReal = r.irr == null ? 'n/d' : !isFinite(r.irr) ? '> 999 %' : pctt(r.irr);
  const children = [];

  // En-tête
  children.push(new Paragraph({ children: [T('MÉMO D’INVESTISSEMENT', { bold: true, size: 36, color: '6E2B26' })] }));
  children.push(P([T(meta.address || meta.regionLabel || 'Transaction multilogement', { size: 24 })], { spacing: { after: 60 } }));
  children.push(P([T(`${input.units} unités · ${meta.assetLabel || ''} · ${meta.regionLabel || ''}`, { color: '777777', size: 18 })]));
  children.push(P([T(`Généré le ${dateStr(meta.generatedAt)} · Elevate Deal Analyzer`, { color: '999999', size: 16 })], { spacing: { after: 200 } }));

  // Recommandation
  children.push(H('Recommandation'));
  children.push(P([T(VERDICT_FR[rec.verdict] || '—', { bold: true, size: 32, color: rec.verdict === 'BUY' ? '2E7D32' : rec.verdict === 'PASS' ? 'B23A36' : 'B7791F' })]));
  children.push(P([T(`${rec.metCount} / 4 critères de rendement atteints`, { color: '777777', size: 18 })], { spacing: { after: 100 } }));
  for (const reason of rec.reasons) {
    children.push(P([
      T(reason.ok ? '✓ ' : '✗ ', { bold: true, color: reason.ok ? '2E7D32' : 'B23A36' }),
      T(`${reason.label} : `, { bold: true }),
      T(reason.detail),
    ], { spacing: { after: 40 } }));
  }

  // Sommaire financier
  children.push(H('Sommaire financier'));
  children.push(kvTable([
    ['Prix demandé', money(input.price)],
    ['Prix recommandé (TRI cible)', mp.feasible ? money(mp.recommendedPrice) : '—'],
    ['Plafond finançable (RCD min)', mp.feasible ? money(mp.maxPrice) : '—'],
    ['Cap rate réel', pctt(r.capRate)],
    ['Cap marché', pctt(r.capMkt)],
    ['Valeur implicite (cap marché)', money(r.impliedValue)],
    ['RBE (NOI)', money(r.noi)],
    ['RCD (DSCR)', mult(r.dscr)],
    ['Rendement comptant (an 1)', pctt(r.cashOnCash)],
    ['Multiple d’équité', mult(r.equityMultiple)],
    ['TRI', irrReal],
    ['Flux de trésorerie an 1', money(r.cashFlowYr1)],
  ]));

  // Financement
  children.push(H('Financement'));
  children.push(kvTable([
    ['Programme', meta.programLabel || '—'],
    ['Prêt retenu', `${money(r.loanTaken)} (plafonné par ${r.bindingConstraint === 'coverage' ? 'la couverture' : 'la valeur'})`],
    ['Prime SCHL', `${money(r.premium)} · ${pctt(r.premiumRate)}`],
    ['Taux hypothécaire', `${pctt(input.rate / 100)} · ${input.amort} ans`],
    ['Service de la dette annuel', money(r.annualDebtService)],
    ['Mise de fonds + frais', `${money(r.equityInvested)} (${pctt(r.downPaymentPct, 0)} du prix)`],
  ]));

  // Valorisation
  if (va && va.hasMix) {
    children.push(H('Valorisation (potentiel d’optimisation)'));
    children.push(kvTable([
      ['Loyer actuel (mensuel)', money(va.currentRentMonthly)],
      ['Loyer marché SCHL (mensuel)', money(va.marketRentMonthly)],
      ['Écart au marché', `${money(va.rentGapMonthly)}/mois (${pctt(va.rentGapPct, 0)})`],
      ['NOI stabilisé', money(va.stabilized.noi)],
      ['Upside de valeur', money(va.upsideValue)],
    ]));
    const stabV = state.stabilizedVerdict;
    if (stabV) children.push(P([T('Au loyer de marché, ce deal devient « ', {}), T(VERDICT_FR[stabV], { bold: true }), T(' » (verdict stabilisé).')], { spacing: { before: 80 } }));
  }

  // Drapeaux rouges
  children.push(H('Drapeaux rouges'));
  if (!decision.redFlags.length) {
    children.push(P([T('Aucun drapeau rouge automatique détecté.', { color: '2E7D32' })]));
  } else {
    for (const f of decision.redFlags) {
      children.push(P([
        T(f.severity === 'danger' ? '● ' : '○ ', { bold: true, color: f.severity === 'danger' ? 'B23A36' : 'B7791F' }),
        T(f.title, { bold: true }),
      ], { spacing: { before: 100, after: 20 } }));
      children.push(P([T('Pourquoi : ', { italics: true, color: '777777' }), T(f.why, { size: 18 })]));
      children.push(P([T('Impact : ', { italics: true, color: '777777' }), T(f.impact, { size: 18 })]));
      children.push(P([T('Mitigation : ', { italics: true, color: '777777' }), T(f.mitigation, { size: 18 })]));
    }
  }

  // Pro forma
  children.push(H('Pro forma'));
  children.push(gridTable(
    ['Année', 'NOI', 'Service dette', 'Flux', 'Solde prêt', 'Valeur'],
    r.proforma.map(p => [`An ${p.year}`, money(p.noi), money(p.debtService), money(p.cashFlow), money(p.loanBalance), money(p.propertyValue)]),
  ));
  children.push(P([T('Produit net de revente : ', { color: '555555' }), T(money(r.netSaleProceeds), { bold: true })], { spacing: { before: 100 } }));

  // Avertissement
  children.push(H('Avertissement', HeadingLevel.HEADING_3));
  children.push(P([T('Estimations de pré-sélection — ne constitue pas un conseil financier. Les taux de capitalisation et paramètres SCHL sont des repères de marché à valider avec un courtier hypothécaire / prêteur avant toute offre.', { italics: true, color: '777777', size: 16 })]));

  const doc = new Document({
    creator: 'Elevate Deal Analyzer',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });
  const blob = await Packer.toBlob(doc);
  download(blob, `memo-${slug(state)}.docx`);
}

// ============================================================================
// 3) PROMESSE D'ACHAT (DOCX) — gabarit à compléter / faire réviser
// ============================================================================
export async function exportOffer(state) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const { input, decision, meta } = state;
  const r = decision.result, mp = decision.maxPrice;
  const offerPrice = mp.feasible ? Math.round(mp.recommendedPrice) : input.price;
  const deposit = Math.round(offerPrice * 0.05);

  const T = (text, o = {}) => new TextRun({ text, ...o });
  const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [T(children)], spacing: { after: 120 }, ...o });
  const H = (text, level = HeadingLevel.HEADING_2) => new Paragraph({ text, heading: level, spacing: { before: 240, after: 100 } });
  const blank = '________________________';

  const children = [];
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [T('PROMESSE D’ACHAT', { bold: true, size: 32, color: '6E2B26' })] }));
  children.push(P([T('Immeuble résidentiel à logements multiples (Québec)', { color: '777777' })], { alignment: AlignmentType.CENTER }));
  children.push(P([T(`Projet de document — généré le ${dateStr(meta.generatedAt)}. À compléter et faire réviser par un notaire / courtier immobilier avant signature.`, { italics: true, color: '999999', size: 16 })], { alignment: AlignmentType.CENTER, spacing: { after: 240 } }));

  children.push(H('1. Parties'));
  children.push(P([T('ACHETEUR : ', { bold: true }), T(blank + '  (nom, adresse)')]));
  children.push(P([T('VENDEUR : ', { bold: true }), T(blank + '  (nom, adresse)')]));

  children.push(H('2. Immeuble visé'));
  children.push(P([T('Adresse : ', { bold: true }), T(meta.address || blank)]));
  children.push(P([T('Désignation : ', { bold: true }), T(`immeuble de ${input.units} logements${meta.year ? `, construit en ${meta.year}` : ''}${meta.constructionLabel ? ` (${meta.constructionLabel})` : ''}.`)]));
  children.push(P([T('Numéro de lot : ', { bold: true }), T(blank)]));

  children.push(H('3. Prix et modalités'));
  children.push(P([T('Prix d’achat offert : ', { bold: true }), T(`${money(offerPrice)}`, { bold: true }), T(`  (le prix demandé est de ${money(input.price)}).`)]));
  children.push(P([T('Acompte à la signature : ', { bold: true }), T(`${money(deposit)} (≈ 5 %), en fidéicommis.`)]));
  children.push(P([T('Solde : ', { bold: true }), T('payable au comptant à la signature de l’acte de vente, sous réserve du financement ci-dessous.')]));

  children.push(H('4. Conditions'));
  children.push(P([T('4.1 Financement. ', { bold: true }), T(`La présente promesse est conditionnelle à l’obtention par l’acheteur d’un financement hypothécaire (programme ${meta.programLabel || 'SCHL / conventionnel'}) dans un délai de ${blank} jours, à des conditions jugées satisfaisantes (prêt visé ≈ ${money(r.loanTaken)}, RCD ≈ ${mult(r.dscr)}).`)]));
  children.push(P([T('4.2 Inspection. ', { bold: true }), T(`Conditionnelle à une inspection du bâtiment jugée satisfaisante, dans un délai de ${blank} jours.`)]));
  children.push(P([T('4.3 Documents financiers. ', { bold: true }), T('Conditionnelle à l’examen et à l’approbation, par l’acheteur, des baux, du registre des loyers, des états financiers des 24 derniers mois, des comptes de taxes et des factures d’énergie.')]));
  children.push(P([T('4.4 Assurabilité SCHL. ', { bold: true }), T('Conditionnelle à la confirmation de l’admissibilité de l’immeuble au programme d’assurance prêt visé, le cas échéant.')]));
  children.push(P([T('4.5 Titres. ', { bold: true }), T('Conditionnelle à la vérification des titres et à la production d’un certificat de localisation à jour.')]));

  children.push(H('5. Répartition et frais'));
  children.push(P('Les taxes municipales et scolaires, les revenus de loyers et les dépenses d’exploitation seront répartis entre les parties à la date de la signature de l’acte de vente. Les droits de mutation sont à la charge de l’acheteur.'));

  children.push(H('6. Délais'));
  children.push(P([T('Acceptation de la promesse : ', { bold: true }), T(`au plus tard le ${blank}.`)]));
  children.push(P([T('Signature de l’acte de vente : ', { bold: true }), T(`au plus tard le ${blank}, devant le notaire choisi par l’acheteur.`)]));

  children.push(H('7. Signatures'));
  children.push(P([T('Acheteur : ', { bold: true }), T(blank + '                Date : ' + blank)], { spacing: { before: 240 } }));
  children.push(P([T('Vendeur : ', { bold: true }), T(blank + '                Date : ' + blank)], { spacing: { before: 200 } }));

  children.push(P([T('Document généré à titre indicatif par Elevate Deal Analyzer. Il ne constitue pas un avis juridique. Faire réviser par un professionnel avant toute signature.', { italics: true, color: '999999', size: 16 })], { spacing: { before: 280 } }));

  const doc = new Document({
    creator: 'Elevate Deal Analyzer',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children }],
  });
  const blob = await Packer.toBlob(doc);
  download(blob, `promesse-achat-${slug(state)}.docx`);
}
