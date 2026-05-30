/**
 * Drapeaux rouges automatiques. Chaque alerte explique pourquoi elle compte,
 * son impact et une piste de mitigation. Pur, basé sur les entrées + le résultat.
 */
import type { DealInputs, UnderwritingResult } from "./types.js";
import type { InvestmentObjectives } from "./objectives.js";

export interface RedFlag {
  id: string;
  severity: "warning" | "danger";
  title: string;
  why: string;
  impact: string;
  mitigation: string;
}

export interface RedFlagContext {
  objectives?: InvestmentObjectives;
  /** Marge de sécurité (de maxPurchasePrice) — pour la marge mince. */
  marginOfSafety?: number;
}

const pct = (v: number, dp = 1): string => (v * 100).toFixed(dp).replace(".", ",") + " %";

export function detectRedFlags(
  inputs: DealInputs,
  result: UnderwritingResult,
  ctx: RedFlagContext = {},
): RedFlag[] {
  const flags: RedFlag[] = [];
  const minDSCR = ctx.objectives?.minDSCR ?? 1.2;
  const entryCap = result.capRate;
  const exitCap = inputs.exitCapPct > 0 ? inputs.exitCapPct / 100 : result.capMkt;

  // 1. RCD sous le minimum
  if (isFinite(result.dscr) && result.dscr < minDSCR) {
    flags.push({
      id: "dscr-low",
      severity: "danger",
      title: `RCD ${result.dscr.toFixed(2)} sous le minimum ${minDSCR.toFixed(2)}`,
      why: "Le revenu net ne couvre pas le service de dette avec la marge exigée par le prêteur.",
      impact: "Refus de financement probable, ou conditions plus chères / mise de fonds plus élevée.",
      mitigation: "Négocier le prix à la baisse, allonger l'amortissement, ou augmenter le RBE (loyers/dépenses).",
    });
  }

  // 2. Flux année 1 négatif
  if (result.cashFlowYr1 < 0) {
    flags.push({
      id: "negative-cf",
      severity: "danger",
      title: "Flux de trésorerie négatif à l'année 1",
      why: "L'immeuble exige des injections de capital dès la première année pour couvrir la dette.",
      impact: "Pression sur les liquidités ; le rendement dépend entièrement de la plus-value.",
      mitigation: "Réduire le prix/levier, revoir les dépenses, ou s'assurer d'une réserve de trésorerie suffisante.",
    });
  }

  // 3. Ratio de dépenses irréaliste
  if (result.expenseRatio > 0 && result.expenseRatio < 0.3) {
    flags.push({
      id: "opex-low",
      severity: "warning",
      title: `Ratio de dépenses ${pct(result.expenseRatio)} sous la norme`,
      why: "Un parc existant tourne généralement à 30–45 % de dépenses ; un ratio plus bas surévalue le RBE.",
      impact: "NOI, cap rate et valeur surévalués — le deal paraît meilleur qu'il ne l'est.",
      mitigation: "Normaliser les dépenses selon les barèmes SCHL (bouton « Normaliser SCHL »).",
    });
  } else if (result.expenseRatio > 0.55) {
    flags.push({
      id: "opex-high",
      severity: "warning",
      title: `Ratio de dépenses élevé ${pct(result.expenseRatio)}`,
      why: "Des dépenses au-dessus de ~55 % du brut rongent fortement le NOI.",
      impact: "Rendement comprimé ; sensibilité accrue aux hausses de coûts.",
      mitigation: "Vérifier les postes (énergie, gestion, conciergerie) et le potentiel d'optimisation.",
    });
  }

  // 4 + 10. Compression de cap à la sortie (TRI dépendant de la valorisation)
  if (exitCap > 0 && exitCap < entryCap) {
    const gap = entryCap - exitCap;
    flags.push({
      id: "cap-compression",
      severity: gap >= 0.005 ? "danger" : "warning",
      title: `Cap de sortie (${pct(exitCap, 2)}) inférieur au cap d'entrée (${pct(entryCap, 2)})`,
      why: "Tu revends à un taux de capitalisation plus bas qu'à l'achat : une partie du TRI vient d'une hausse de valorisation, pas de l'exploitation.",
      impact: "Si le cap de sortie reste au niveau d'entrée, le TRI et le multiple d'équité chutent fortement.",
      mitigation: "Tester la sortie au cap d'entrée dans la table de sensibilité ; ne pas dépendre de la compression.",
    });
  }

  // 5. Levier excessif
  if (result.downPaymentPct > 0 && result.downPaymentPct < 0.2) {
    flags.push({
      id: "high-leverage",
      severity: "warning",
      title: `Levier élevé — mise de fonds ${pct(result.downPaymentPct, 0)}`,
      why: "Un RPV au-dessus de 80 % amplifie les pertes autant que les gains et fragilise la couverture.",
      impact: "Vulnérabilité accrue aux hausses de taux et aux baisses de revenu à la sortie/refinancement.",
      mitigation: "Évaluer une mise de fonds plus élevée ; vérifier la table de sensibilité aux taux.",
    });
  }

  // 6. Risque de refinancement (amortissement très long)
  if (inputs.amort >= 45) {
    flags.push({
      id: "refi-risk",
      severity: "warning",
      title: `Amortissement très long (${inputs.amort} ans)`,
      why: "Un amortissement de 45–50 ans réduit le paiement mais ralentit fortement le remboursement du capital.",
      impact: "Peu d'équité bâtie par le paydown ; forte exposition au taux au refinancement.",
      mitigation: "Stresser le refinancement à un taux plus élevé ; ne pas compter sur le paydown pour l'équité.",
    });
  }

  // 7. Hypothèse d'inoccupation optimiste
  if (inputs.vacancyPct < 3) {
    flags.push({
      id: "low-vacancy",
      severity: "warning",
      title: `Inoccupation faible (${inputs.vacancyPct.toString().replace(".", ",")} %)`,
      why: "Une inoccupation sous 3 % est rarement soutenable et surévalue le revenu effectif.",
      impact: "RBE et NOI optimistes ; marge réelle plus mince qu'affichée.",
      mitigation: "Utiliser le plancher d'inoccupation SCHL (≥ 3 %) ou le taux du marché local.",
    });
  }

  // 8. Croissance des loyers agressive
  if (inputs.rentGrowthPct > 3.5) {
    flags.push({
      id: "aggressive-rent-growth",
      severity: "warning",
      title: `Croissance des loyers agressive (${inputs.rentGrowthPct.toString().replace(".", ",")} %/an)`,
      why: "Une croissance soutenue au-dessus de ~3,5 % par an dépasse souvent l'inflation et l'encadrement des loyers.",
      impact: "Le TRI et le multiple reposent sur des loyers futurs incertains.",
      mitigation: "Tester un scénario à 2–3 % ; valider avec les baux et le marché local.",
    });
  }

  // 9. Marge de sécurité mince (si fournie par maxPurchasePrice)
  if (ctx.marginOfSafety !== undefined && ctx.marginOfSafety < 0.03) {
    flags.push({
      id: "thin-margin",
      severity: ctx.marginOfSafety < 0 ? "danger" : "warning",
      title:
        ctx.marginOfSafety < 0
          ? "Aucune marge — le prix demandé dépasse le maximum justifiable"
          : `Marge de sécurité mince (${pct(ctx.marginOfSafety, 1)})`,
      why: "Le prix demandé est égal ou supérieur au prix maximal qui atteint tes objectifs.",
      impact: "Peu ou pas de coussin : une légère détérioration fait manquer la cible.",
      mitigation: "Négocier vers le prix recommandé ; voir le calculateur de prix maximal.",
    });
  }

  return flags;
}
