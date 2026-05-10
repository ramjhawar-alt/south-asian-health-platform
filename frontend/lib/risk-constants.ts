export const RISK_THRESHOLDS = {
  bmi: {
    normalUpper: 22.9,
    overweightLower: 23,
    overweightUpper: 27.4,
    obesityLower: 27.5,
  },
  waistToHeightRatio: {
    increasedRisk: 0.5,
  },
  glucose: {
    fastingPrediabetesMgdl: 100,
    hba1cPrediabetes: 5.7,
  },
  lipids: {
    triglyceridesHighMgdl: 150,
    hdlLowMaleMgdl: 40,
    hdlLowFemaleMgdl: 50,
    lpaHighMgdl: 50,
  },
  idrs: {
    lowUpper: 29,
    moderateUpper: 59,
  },
} as const;

export const EXPLORATORY_ASCVD_MULTIPLIERS = {
  moderate: 1.3,
  high: 1.6,
} as const;
