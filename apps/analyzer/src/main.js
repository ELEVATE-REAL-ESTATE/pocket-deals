import "./styles.css";
import {
  underwrite,
  recommend,
  evaluate,
  exitCapTable,
  rateTable,
  ratesFromDeltas,
  valueAdd,
  DEFAULT_EXIT_CAPS,
} from "@elevate/domain";
import { MARKET_DATA } from "@elevate/config";
import { renderEquityChart } from "./chart.js";
import { exportExcel, exportMemo, exportOffer } from "./export.js";

const $ = id => document.getElementById(id);
const num = id => { const v = parseFloat($(id).value); return isNaN(v) ? 0 : v; };

const fmt = (v, dp=0) => (v<0?'-':'') + '$' + Math.abs(v).toLocaleString('fr-CA', {minimumFractionDigits:dp, maximumFractionDigits:dp});
const pct = (v, dp=2) => (v*100).toLocaleString('fr-CA',{minimumFractionDigits:dp,maximumFractionDigits:dp}) + ' %';
const compact = v => { const a=Math.abs(v), s=v<0?'-':''; if(a>=1e6) return s+'$'+(a/1e6).toFixed(2)+' M'; if(a>=1e3) return s+'$'+(a/1e3).toFixed(0)+' k'; return fmt(v); };
// Affichage TRI : null = n/d, +∞ (trop rentable) = > 999 %
const irrTxt = (v, dp=1) => v===null ? 'n/d' : !isFinite(v) ? '> 999 %' : pct(v, dp);

// ---- Données de marché — chargées depuis market-data.js (source unique) ----
const MD = MARKET_DATA;
const CAP_BUCKETS = MD.capRates.regions;        // taux de cap par bucket (8)
const RENT_REGIONS = MD.marketRents.regions;    // régions détaillées SCHL (135)
const ASSETS  = MD.capRates.assetSpreads;
const PROGRAMS = MD.programs.items;
const CONSTRUCTION = MD.construction;
const SX = MD.schlExpenses;

const SCHL_REPAIRS_PER_DOOR = SX.repairsPerDoor;
const schlConciergePerDoor = units => units >= 12 ? SX.conciergePerDoor.ge12 : SX.conciergePerDoor.lt12;
const SCHL_MGMT_PCT = SX.mgmtPct;
// Réserve de remplacement = structure (selon construction) + composantes présentes
function schlReservePerDoor() {
  const units = Math.max(1, num('units'));
  let r = SX.reserveStructPerDoor[$('construction').value] || 0;
  if ($('eq-appliances').checked) r += SX.reserveComponents.appliances;
  if ($('eq-heatpump').checked)   r += SX.reserveComponents.heatpump;
  if ($('eq-elevator').checked)   r += Math.round(SX.reserveComponents.elevatorBuilding/units);
  return r;
}

// ---- Taux du jour en direct : Banque du Canada (API Valet) ----
let RATES = {
  policy: MD.rates.fallback.policy, prime: MD.rates.fallback.prime,
  goc5yr: MD.rates.fallback.goc5yr, asOf: MD.rates.fallbackAsOf, live: false
};
let CMB = { rate: null, asOf: '', live: false };   // CMB 5 ans EXACT (feed GreenBirch)
// CMB exact si le feed a répondu, sinon repli dérivé (oblig. 5 ans + écart)
const cmb5yr = () => (CMB.live && CMB.rate != null) ? CMB.rate : RATES.goc5yr + MD.rates.cmbSpread;
// Lit la ligne « CMB 5-Year » du widget GreenBirch / theFinancials (CORS ouvert)
async function refreshCMB() {
  try {
    const res = await fetch(MD.rates.cmbWidgetUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    let t = await res.text();
    t = t.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    const i = t.indexOf('>' + MD.rates.cmbLabel + '</a>');
    if (i < 0) throw new Error('ligne CMB introuvable');
    const seg = t.slice(i, i + 1600);
    const val = seg.match(/col3'[^>]*>[\s\S]*?<a[^>]*>(-?\d+\.\d+)%/); // valeur du jour
    const ts  = seg.match(/col2'[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);  // horodatage
    if (val) CMB = { rate: parseFloat(val[1]) / 100, asOf: ts ? ts[1].trim() : '', live: true };
  } catch (e) { /* feed indisponible → on garde la dérivation */ }
}
function rateBaseValue(prog) {
  const s = MD.rates.spreads[prog];
  return (s && s.base === 'cmb5yr') ? cmb5yr() : RATES.goc5yr;
}
function suggestedRate() {
  const p = $('program').value, s = MD.rates.spreads[p];
  return rateBaseValue(p) + (s ? s.spread : 0);
}
async function refreshRates() {
  try {
    const res = await fetch(MD.rates.valetUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json(), S = MD.rates.valetSeries;
    // Observation à DATE MAXIMALE non vide par série. L'API Valet ne trie pas
    // chronologiquement quand on mélange des séries de fréquences différentes
    // (préférentiel hebdo vs oblig./directeur quotidiens) — on ne peut donc pas
    // se fier à l'ordre du tableau ; on compare les dates (ISO → ordre lexical).
    const latest = code => {
      let best = null;
      for (const o of data.observations) {
        const cell = o[code];
        if (cell && cell.v !== '' && cell.v != null && (!best || o.d > best.d)) {
          best = { v: parseFloat(cell.v), d: o.d };
        }
      }
      return best;
    };
    const pol = latest(S.policy), pr = latest(S.prime), goc = latest(S.goc5yr);
    if (goc) RATES = {
      policy: pol ? pol.v/100 : RATES.policy,
      prime:  pr  ? pr.v/100  : RATES.prime,
      goc5yr: goc.v/100, asOf: goc.d, live: true
    };
  } catch (e) { /* hors ligne → valeurs de repli */ }
}
function applySuggestedRate() { $('rate').value = (suggestedRate()*100).toFixed(2); }

// ---- Finance : le moteur vit désormais dans @elevate/domain (window.ElevateDomain) ----
const setDot = (id,s) => $(id).className = 'dot '+s;

// ---- Populate selects ----
function fillSelect(id, obj) {
  $(id).innerHTML = Object.entries(obj).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
}
// Sélecteur de région détaillé, groupé par métro (135 zones SCHL)
function fillRegionSelect() {
  const byGroup = {};
  for (const [id, r] of Object.entries(RENT_REGIONS)) (byGroup[r.group] ||= []).push(`<option value="${id}">${r.label}</option>`);
  $('region').innerHTML = MD.marketRents.groups.map(grp => `<optgroup label="${grp}">${(byGroup[grp] || []).join('')}</optgroup>`).join('');
}
fillRegionSelect();
fillSelect('asset', ASSETS);
fillSelect('program', PROGRAMS);
fillSelect('construction', CONSTRUCTION);
$('region').value = 'mtl-rmr';
$('asset').value = 'multi';
$('program').value = 'mli-std';
$('construction').value = 'bois';

// Quand le programme change, appliquer ses paramètres par défaut
$('program').addEventListener('change', () => {
  const p = PROGRAMS[$('program').value];
  $('amort').value = p.maxAmort;
  applySuggestedRate();   // taux = oblig. 5 ans + écart du programme
  calc();
});
$('mli-points').addEventListener('change', calc);

// Bouton « Normaliser SCHL » — applique les barèmes selon le nombre d'unités,
// la construction et les équipements présents.
$('normalize').addEventListener('click', () => {
  const units = Math.max(1, num('units'));
  $('repairs').value    = units * SCHL_REPAIRS_PER_DOOR;
  $('caretaking').value = units * schlConciergePerDoor(units);
  $('mgmt').value       = SCHL_MGMT_PCT;
  $('reserve').value    = schlReservePerDoor();
  if (num('vacancy') < SX.vacancyFloor*100) $('vacancy').value = SX.vacancyFloor*100; // plancher SCHL
  calc();
});
['construction','eq-appliances','eq-heatpump','eq-elevator'].forEach(id =>
  $(id).addEventListener('change', calc));

// Cap marché dérivé de la région + actif (préremplit le champ, ajustable ensuite)
function derivedCapMktPct() {
  const region = RENT_REGIONS[$('region').value];
  const bucket = CAP_BUCKETS[region.capBucket] || CAP_BUCKETS['mtl'];
  const asset  = ASSETS[$('asset').value];
  return (bucket.baseCap + asset.spread) * 100;
}
function syncCapMkt() { $('cap-mkt').value = derivedCapMktPct().toFixed(2); }

// Adaptateur DOM → DealInputs (résout région+actif → cap marché, programme → params)
function readDealInputs() {
  const region = RENT_REGIONS[$('region').value];
  const bucket = CAP_BUCKETS[region.capBucket] || CAP_BUCKETS['mtl'];
  const asset  = ASSETS[$('asset').value];
  const prog   = PROGRAMS[$('program').value];
  return {
    price: num('price'), units: Math.max(1, num('units')), sqft: num('sqft'),
    closingPct: num('closing'), capex: num('capex'),
    grossRevenue: num('revenue') + num('other'), vacancyPct: num('vacancy'),
    expenses: {
      taxes: num('taxes'), insurance: num('insurance'), energy: num('energy'),
      water: num('water'), repairs: num('repairs'), caretaking: num('caretaking'),
      mgmtPct: num('mgmt'), reservePerDoor: num('reserve'), misc: num('misc'),
    },
    unitMix: readUnitMix(),
    program: { maxLTV: prog.maxLTV, minDCR: prog.minDCR, maxAmort: prog.maxAmort,
               insured: prog.insured, pointsEligible: prog.pointsEligible },
    rate: num('rate'), amort: num('amort'),
    premiumSchedule: MD.programs.premiumSchedule,
    mliPoints: num('mli-points'),
    premiumOverridePct: num('premium'), // 0/vide → prime calculée
    capMktPct: num('cap-mkt') > 0 ? num('cap-mkt') : (bucket.baseCap + asset.spread) * 100,
    hold: num('hold'), rentGrowthPct: num('rentg'), expenseGrowthPct: num('expg'),
    exitCapPct: num('exitcap'), sellingPct: num('selling'),
  };
}

function calc() {
  const prog  = PROGRAMS[$('program').value];
  const input = readDealInputs();

  // ★ Moteur partagé — underwriting + décision d'acquisition vivent dans @elevate/domain
  const obj = readObjectives();
  const decision = recommend(input, obj);
  const r = decision.result;

  // Adaptateur résultat → variables locales utilisées par le bloc de rendu ci-dessous
  const price = input.price, units = input.units, sqft = input.sqft, gross = input.grossRevenue;
  const egi = r.egi, opex = r.opex, noi = r.noi, expRatio = r.expenseRatio;
  const capRate = r.capRate, capMkt = r.capMkt, impliedValue = r.impliedValue;
  const loanLTV = r.loanByLTV, loanDCR = r.loanByDCR, baseLoan = r.loanTaken;
  const binding = r.bindingConstraint === 'coverage' ? 'couverture' : 'valeur';
  const premium = r.premium, premiumRate = r.premiumRate, annualDebt = r.annualDebtService;
  const equityIn = r.equityInvested, downPctEff = r.downPaymentPct;
  const dscr = r.dscr, cf1 = r.cashFlowYr1, coc = r.cashOnCash;
  const hold = r.proforma.length, em = r.equityMultiple, irrVal = r.irr;
  const saleProceeds = r.netSaleProceeds;
  const rows = r.proforma.map(p => ({ y: p.year, noi: p.noi, debt: p.debtService, cf: p.cashFlow, bal: p.loanBalance }));

  // ================= RENDU =================
  // Headline
  $('cashflow').textContent = fmt(cf1);
  $('cashflow-sub').textContent = `${fmt(cf1/12)} / mois · ${pct(coc)} rendement comptant`;
  let v='pass', vt='À passer';
  if (noi>0 && dscr>=prog.minDCR && capRate>=capMkt && coc>=0.05) { v='go'; vt='Solide'; }
  else if (noi>0 && dscr>=prog.minDCR*0.97 && coc>0) { v='watch'; vt='Marginal'; }
  $('verdict').textContent = vt; $('verdict').className = 'verdict '+v;

  // Évaluation
  $('m-door').textContent = compact(price/units);
  $('n-door').textContent = `${units} unités`;
  $('m-sqft').textContent = sqft>0 ? fmt(price/sqft,0) : '—';
  $('m-cap').textContent = pct(capRate);
  $('n-cap').textContent = `RBE ${compact(noi)}`;
  setDot('d-cap', capRate>=capMkt ? 'good' : capRate>=capMkt-0.005 ? 'ok' : 'bad');
  $('m-capmkt').textContent = pct(capMkt);
  $('n-capmkt').textContent = `${pct(capMkt-0.005,2)}–${pct(capMkt+0.005,2)}`;
  $('m-implied').textContent = compact(impliedValue);
  const gap = impliedValue - price;
  $('n-implied').textContent = (gap>=0?'+':'') + compact(gap) + ` vs prix (${gap>=0?'sous':'sur'}-évalué)`;

  // Rendement
  $('m-noi').textContent = compact(noi);
  $('n-noi').textContent = `RBE eff. ${compact(egi)} − dép. ${compact(opex)}`;
  setDot('d-noi', noi>0?'good':'bad');
  $('m-dscr').textContent = isFinite(dscr)? dscr.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})+'×' : '∞';
  $('n-dscr').textContent = `min programme ${prog.minDCR.toFixed(2)}`;
  setDot('d-dscr', dscr>=prog.minDCR?'good':dscr>=prog.minDCR*0.97?'ok':'bad');
  $('m-coc').textContent = pct(coc);
  setDot('d-coc', coc>=0.06?'good':coc>=0.03?'ok':'bad');
  $('em-hold').textContent = hold;
  $('m-em').textContent = em.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})+'×';
  $('m-irr').textContent = irrTxt(irrVal);
  setDot('d-em', em>=1.8?'good':em>=1.3?'ok':'bad');

  // Financement
  $('prog-name').textContent = prog.label;
  $('ltv-lbl').textContent = `(${(prog.maxLTV*100).toFixed(0)} % RPV)`;
  $('dcr-lbl').textContent = `(RCD ${prog.minDCR.toFixed(2)})`;
  $('l-ltv').textContent = compact(loanLTV);
  $('l-dcr').textContent = compact(loanDCR);
  $('l-bind').textContent = compact(baseLoan);
  $('bind-lbl').textContent = `(plafonné par ${binding})`;
  $('l-prem').textContent = premium>0 ? `${compact(premium)} · ${pct(premiumRate)}` : '—';
  $('l-debt').textContent = fmt(annualDebt);
  $('l-dp').textContent = compact(equityIn);
  $('dp-lbl').textContent = `(${pct(downPctEff,0)} + frais)`;

  // Barres
  const dscrPctFill = Math.max(0, Math.min(1, (isFinite(dscr)?dscr:2)/2));
  $('bar-dscr').style.width = (dscrPctFill*100)+'%';
  $('bar-dscr').style.background = dscr>=prog.minDCR ? 'var(--success)' : 'var(--danger)';
  $('bar-dscr-cap').style.left = (Math.min(1, prog.minDCR/2)*100)+'%';
  $('bar-dscr-v').textContent = isFinite(dscr)? dscr.toFixed(2)+'×' : '∞';
  const expFill = Math.max(0, Math.min(1, expRatio/0.6));
  $('bar-exp').style.width = (expFill*100)+'%';
  $('bar-exp').style.background = expRatio>0.30 ? 'var(--accent)' : 'var(--gold)';
  $('bar-exp-v').textContent = pct(expRatio,1);

  const flag = $('flag-exp');
  if (expRatio < 0.28 && gross>0) {
    flag.classList.add('show');
    flag.textContent = `⚠ Ratio de dépenses ${pct(expRatio,1)} sous la norme SCHL (≈30–45 % pour un parc existant). Le RBE est probablement surévalué.`;
  } else { flag.classList.remove('show'); }

  // Pro forma
  $('pf-body').innerHTML = rows.map(r=>`
    <tr><td>An ${r.y}</td><td>${fmt(r.noi)}</td><td>${fmt(r.debt)}</td>
    <td class="${r.cf>=0?'pos':'neg'}">${fmt(r.cf)}</td><td>${fmt(r.bal)}</td></tr>`).join('') + `
    <tr style="font-weight:600;"><td>Vente</td>
    <td colspan="3" style="text-align:right;color:var(--accent);">Produit net de revente</td>
    <td class="${saleProceeds>=0?'pos':'neg'}">${fmt(saleProceeds)}</td></tr>`;

  // Repères de normalisation SCHL affichés en direct sous les champs
  $('h-repairs').textContent = `SCHL · ${fmt(units*SCHL_REPAIRS_PER_DOOR)} (${SCHL_REPAIRS_PER_DOOR} $/porte)`;
  const cpd = schlConciergePerDoor(units);
  $('h-caretaking').textContent = `SCHL · ${fmt(units*cpd)} (${cpd} $/porte${units<12?', <12 log.':''})`;
  const rpd = schlReservePerDoor();
  $('h-reserve').textContent = `SCHL · ${rpd} $/porte`;
  const sp = MD.rates.spreads[$('program').value];
  const baseLbl = sp && sp.base === 'cmb5yr' ? `CMB 5 ans ${pct(cmb5yr())}` : `oblig. 5 ans ${pct(RATES.goc5yr)}`;
  $('h-rate').textContent = `Suggéré ${pct(suggestedRate())} — ${baseLbl} + écart ${pct(sp ? sp.spread : 0)}`;
  $('h-premium').textContent = !prog.insured ? 'Non assuré — aucune prime'
    : num('premium') > 0 ? `Manuelle ${pct(premiumRate)}`
    : `Calculée ${pct(premiumRate)} (RPV+amort${prog.pointsEligible ? '−points' : ''})`;

  $('program-hint').textContent = prog.hint;

  // ===== Décision d'investissement (Slice B) =====
  renderDecision(decision, input, obj);
}

// ---- Objectifs d'investissement ----
function readObjectives() {
  return {
    targetIRRPct: num('obj-irr'),
    minDSCR: num('obj-dscr'),
    minCashOnCashPct: num('obj-coc'),
    minEquityMultiple: num('obj-em'),
    targetHoldYears: num('hold'),
  };
}

function renderDecision(decision, input, obj) {
  renderReco(decision.recommendation);
  renderMaxPrice(decision.maxPrice);
  renderSensCap(input, obj);
  renderSensRate(input, obj);
  renderFlags(decision.redFlags);
  renderEquityChart($('chart'), decision.result.proforma);
  $('chart-legend').innerHTML =
    '<span><i style="background:var(--success)"></i>Cash-on-cash</span>' +
    '<span><i style="background:var(--gold)"></i>Capitalisation</span>' +
    '<span><i style="background:var(--accent)"></i>Prise de valeur</span>' +
    '<span><i style="background:var(--ink)"></i>TRI cumulé</span>' +
    '<span style="color:var(--muted)">— survol pour les chiffres</span>';

  // Valorisation (value-add) — loyers vs marché SCHL de la région
  const region = RENT_REGIONS[$('region').value];
  const va = valueAdd(input, region.rents);
  renderValueAdd(va, region.rents, obj, decision.recommendation.verdict);

  // État courant pour l'export de documents (Slice C)
  LAST = buildExportState(decision, input, obj, region, va);
}

// Snapshot complet de l'analyse courante, consommé par les exports (Excel / DOCX)
let LAST = null;
function buildExportState(decision, input, obj, region, va) {
  return {
    input, obj, decision, va,
    rents: region.rents, region,
    sensCap: exitCapTable(input, DEFAULT_EXIT_CAPS),
    sensRate: rateTable(input, ratesFromDeltas(num('rate'))),
    stabilizedVerdict: evaluate(va.stabilized, obj).verdict,
    meta: {
      address: $('address').value.trim(),
      regionLabel: region.label,
      assetLabel: (ASSETS[$('asset').value] || {}).label || '',
      programLabel: (PROGRAMS[$('program').value] || {}).label || '',
      constructionLabel: (CONSTRUCTION[$('construction').value] || {}).label || '',
      year: num('year'),
      generatedAt: new Date(),
    },
  };
}

// Mix locatif → DealInputs.unitMix
function readUnitMix() {
  const t = (n, r) => { const c = num(n); return c > 0 ? { count: c, rent: num(r) } : undefined; };
  return {
    studio: t('mix-studio-n', 'mix-studio-r'),
    br1: t('mix-br1-n', 'mix-br1-r'),
    br2: t('mix-br2-n', 'mix-br2-r'),
    br3: t('mix-br3-n', 'mix-br3-r'),
  };
}

// Valorisation : loyers marché par type + écart + stabilisé + upside
function renderValueAdd(va, rents, obj, currentVerdict) {
  const dash = v => (v == null ? '—' : fmt(v));
  $('mkt-studio').textContent = dash(rents.studio);
  $('mkt-br1').textContent = dash(rents.br1);
  $('mkt-br2').textContent = dash(rents.br2);
  $('mkt-br3').textContent = dash(rents.br3);

  const grp = $('va-group');
  if (!va.hasMix) { grp.style.display = 'none'; $('reco-va').hidden = true; return; }
  grp.style.display = '';

  const badge = $('va-badge');
  if (va.isOpportunity) {
    badge.textContent = `· Occasion de valorisation (+${pct(va.rentGapPct, 0)})`;
    badge.style.color = 'var(--gold)';
  } else if (va.rentGapPct > 0.01) {
    badge.textContent = `· loyers ${pct(va.rentGapPct, 0)} sous le marché`;
    badge.style.color = 'var(--ink-soft)';
  } else {
    badge.textContent = '· au marché';
    badge.style.color = 'var(--muted)';
  }

  $('va-cur').textContent = compact(va.currentRentMonthly);
  $('va-mkt').textContent = compact(va.marketRentMonthly);
  $('va-gap').textContent = `écart ${(va.rentGapMonthly >= 0 ? '+' : '')}${compact(va.rentGapMonthly)}/mois`;
  $('va-noi').textContent = compact(va.stabilized.noi);
  $('va-noilift').textContent = `${va.noiLift >= 0 ? '+' : ''}${compact(va.noiLift)} vs actuel`;
  $('va-upside').textContent = (va.upsideValue >= 0 ? '+' : '') + compact(va.upsideValue);

  // Verdict AU LOYER DE MARCHÉ (stabilisé) — intègre l'upside à la décision
  const fr = { BUY: 'ACHETER', RENEGOTIATE: 'RENÉGOCIER', PASS: 'PASSER' };
  const stabV = evaluate(va.stabilized, obj).verdict;
  $('va-verdict').textContent = `Au loyer de marché, ce deal devient « ${fr[stabV]} » — c'est son potentiel après optimisation des loyers (verdict stabilisé).`;

  // Conseil « acheter si optimisé » sous la recommandation — quand l'upside change le verdict
  const rank = { PASS: 0, RENEGOTIATE: 1, BUY: 2 };
  const rcReco = $('reco-va');
  if (va.isOpportunity && rank[stabV] > rank[currentVerdict]) {
    rcReco.hidden = false;
    rcReco.innerHTML =
      `<div class="reco-va-head">💡 Conseil — acheter si optimisé</div>` +
      `<div class="reco-va-cmp"><span class="rv-now">En l'état · ${fr[currentVerdict]}</span>` +
      `<span class="rv-arrow">→</span>` +
      `<span class="rv-opt">Au loyer de marché · ${fr[stabV]}</span></div>` +
      `<div class="reco-va-cond">Condition : porter les loyers de ${compact(va.currentRentMonthly)} à ${compact(va.marketRentMonthly)}/mois ` +
      `(+${pct(va.rentGapPct, 0)}) → +${compact(va.noiLift)} de RBE, +${compact(va.upsideValue)} de valeur.</div>`;
  } else {
    rcReco.hidden = true;
  }
}

// F1 — recommandation
function renderReco(rec) {
  const map = { BUY: ['buy', 'ACHETER'], RENEGOTIATE: ['reno', 'RENÉGOCIER'], PASS: ['pass', 'PASSER'] };
  const [cls, label] = map[rec.verdict] || ['pass', '—'];
  const badge = $('reco-badge');
  badge.className = 'reco-badge ' + cls;
  badge.textContent = label;
  $('reco-reasons').innerHTML = rec.reasons.map(x =>
    `<li class="${x.ok ? 'ok' : 'no'}"><span class="ic">${x.ok ? '✓' : '✗'}</span>` +
    `<span class="rl">${x.label}</span><span class="rd">${x.detail}</span></li>`).join('');
}

// F2 — prix maximal
function renderMaxPrice(mp) {
  $('mp-asking').textContent = compact(mp.askingPrice);
  $('mp-reco').textContent = mp.feasible ? compact(mp.recommendedPrice) : '—';
  $('mp-max').textContent = mp.feasible ? compact(mp.maxPrice) : '—';
  const diff = mp.recommendedPrice - mp.askingPrice; // écart au prix recommandé (TRI)
  $('mp-diff').textContent = mp.feasible ? (diff >= 0 ? '+' : '') + compact(diff) : '—';
  let note;
  if (!mp.feasible) {
    note = "Aucun prix n'atteint les objectifs — revoir les hypothèses ou les cibles.";
  } else if (mp.meetsAtAsking) {
    note = `Au prix demandé, ton TRI cible est atteint avec ${pct(mp.marginOfSafety, 0)} de marge. Prix recommandé (TRI atteint) ${compact(mp.recommendedPrice)} · plafond finançable au RCD ${compact(mp.maxPrice)}.`;
  } else {
    note = `Pour atteindre ton TRI cible, viser ≤ ${compact(mp.recommendedPrice)} (rabais ${pct(mp.discountPct, 0)}). Plafond finançable au RCD : ${compact(mp.maxPrice)}.`;
  }
  $('mp-note').textContent = note;
}

// F3 — sensibilité au cap de sortie
function renderSensCap(input, obj) {
  const rows = exitCapTable(input, DEFAULT_EXIT_CAPS);
  const curExit = num('exitcap') > 0 ? num('exitcap') : input.capMktPct;
  $('sens-cap').innerHTML = rows.map(row => {
    const irrPct = row.irr === null ? null : row.irr * 100;
    const cls = irrPct === null ? 'cell-bad'
      : irrPct >= obj.targetIRRPct ? 'cell-good'
      : irrPct >= obj.targetIRRPct - 3 ? 'cell-ok' : 'cell-bad';
    const cur = Math.abs(row.exitCapPct - curExit) < 0.001 ? ' class="cur"' : '';
    return `<tr${cur}><td>${pct(row.exitCapPct / 100, 2)}</td><td>${compact(row.propertyValue)}</td>` +
      `<td>${compact(row.netToEquity)}</td><td class="${cls}">${irrTxt(row.irr)}</td>` +
      `<td>${row.equityMultiple.toFixed(2)}×</td></tr>`;
  }).join('');
}

// F4 — sensibilité au taux d'intérêt
function renderSensRate(input, obj) {
  const rows = rateTable(input, ratesFromDeltas(num('rate')));
  $('sens-rate').innerHTML = rows.map((row, i) => {
    const cls = !isFinite(row.dscr) || row.dscr >= obj.minDSCR ? 'cell-good'
      : row.dscr >= obj.minDSCR - 0.1 ? 'cell-ok' : 'cell-bad';
    const cur = i === 0 ? ' class="cur"' : '';
    return `<tr${cur}><td>${pct(row.ratePct / 100, 2)}</td><td>${fmt(row.annualDebtService)}</td>` +
      `<td class="${cls}">${isFinite(row.dscr) ? row.dscr.toFixed(2) : '∞'}</td>` +
      `<td class="${row.cashFlowYr1 >= 0 ? '' : 'cell-bad'}">${fmt(row.cashFlowYr1)}</td>` +
      `<td>${irrTxt(row.irr)}</td></tr>`;
  }).join('');
}

// F9 — drapeaux rouges
function renderFlags(flags) {
  $('flags-count').textContent = flags.length === 0 ? 'aucun' : `${flags.length} alerte${flags.length > 1 ? 's' : ''}`;
  $('flags-list').innerHTML = flags.length === 0
    ? '<div class="flags-none">✓ Aucun drapeau rouge détecté.</div>'
    : flags.map(f =>
        `<div class="flag-card ${f.severity}"><div class="ft">${f.title}</div>` +
        `<div class="fl"><b>Pourquoi</b> · ${f.why}</div>` +
        `<div class="fl"><b>Impact</b> · ${f.impact}</div>` +
        `<div class="fl"><b>Mitigation</b> · ${f.mitigation}</div></div>`).join('');
}

function renderFreshness() {
  $('r-policy').textContent = pct(RATES.policy, 2);
  $('r-prime').textContent  = pct(RATES.prime, 2);
  $('r-goc').textContent    = pct(RATES.goc5yr, 2);
  $('r-cmb').textContent    = pct(cmb5yr(), 2);
  $('cmb-est').style.display = CMB.live ? 'none' : 'inline';   // « est. » seulement si dérivé
  const anyLive = RATES.live || CMB.live;
  $('live-dot').className = 'live-dot' + (anyLive ? ' on' : '');
  $('r-asof').textContent = anyLive ? 'En direct' : 'Hors ligne';
  // Provenance explicite : « en direct » = dernière cotation publiée par chaque source
  $('src-boc').textContent = `Banque du Canada · ${RATES.live ? 'dernière maj ' + RATES.asOf : 'repli ' + RATES.asOf}`;
  $('src-cmb').textContent = CMB.live ? `CMB · ${MD.rates.cmbSource} · ${CMB.asOf}` : 'CMB · estimé (oblig. 5 ans + écart)';
  $('fresh-cap').textContent  = `Cap rates ${MD.capRates.asOf}`;
  $('fresh-schl').textContent = `SCHL ${MD.schlExpenses.asOf}`;
  $('foot-updated').textContent = `Données curées à jour au ${MD.meta.lastUpdated}`;
}

$('refresh-btn').addEventListener('click', async () => {
  const btn = $('refresh-btn'); btn.disabled = true; btn.textContent = '…';
  await Promise.all([refreshRates(), refreshCMB()]);
  applySuggestedRate(); renderFreshness(); calc();
  btn.disabled = false; btn.textContent = '↻';
});

$('form').addEventListener('input', calc);
$('region').addEventListener('change', () => { syncCapMkt(); calc(); });
$('asset').addEventListener('change', () => { syncCapMkt(); calc(); });

// ---- Export de documents (Slice C) ----
function withExport(label, fn) {
  return async () => {
    if (!LAST) return;
    const st = $('export-status');
    st.textContent = `${label} — génération…`;
    try { await fn(LAST); st.textContent = `${label} — téléchargé ✓`; }
    catch (e) { console.error(e); st.textContent = `${label} — erreur, réessaie`; }
    setTimeout(() => { if (st.textContent.includes('✓')) st.textContent = ''; }, 4000);
  };
}
$('exp-xlsx').addEventListener('click', withExport('Excel', exportExcel));
$('exp-memo').addEventListener('click', withExport('Mémo', exportMemo));
$('exp-offer').addEventListener('click', withExport('Promesse', exportOffer));

(async function init() {
  renderFreshness();
  syncCapMkt();
  calc();
  await Promise.all([refreshRates(), refreshCMB()]); // BdC (directeur/prime/oblig) + CMB exact
  applySuggestedRate();    // ajuste le taux hypothécaire suggéré
  renderFreshness();
  calc();
})();
