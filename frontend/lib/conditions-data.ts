export interface Condition {
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  color: string;        // Tailwind bg class for card
  borderColor: string;  // Tailwind border class for card
  iconBg: string;       // icon background class
  prevalence: string;
  whyHigherRisk: string[];
  keyFindings: string[];
  southAsianStats: { value: string; label: string }[];
  chatQuestions: string[];
}

export const CONDITIONS: Condition[] = [
  {
    slug: "type-2-diabetes",
    name: "Type 2 Diabetes",
    icon: "🩸",
    tagline: "South Asians develop T2DM at lower BMI and a decade earlier than Western populations.",
    color: "bg-red-50",
    borderColor: "border-red-200",
    iconBg: "bg-red-100",
    prevalence: "25–40% of South Asians develop T2DM in their lifetime — 3–5× the rate of white Europeans.",
    whyHigherRisk: [
      "Higher insulin resistance at lower BMI due to greater visceral fat relative to body weight.",
      "South Asian beta cells secrete less insulin per unit of body weight, reducing glucose tolerance.",
      "Higher prevalence of central obesity at BMI thresholds that are considered 'normal' in Western populations.",
      "Genetic variants (TCF7L2, PPARG, HNF1B) more prevalent in South Asian populations increase susceptibility.",
      "Traditional high-carbohydrate diets (white rice, refined flour) accelerate glucose dysregulation.",
    ],
    keyFindings: [
      "South Asians meet diabetes criteria at BMI of 23 kg/m² vs. 30 kg/m² in white Europeans (WHO Asia-Pacific threshold).",
      "The UK Biobank study found South Asians develop T2DM 10 years earlier than white Europeans.",
      "DECODA study showed South Asians have higher 2-hour glucose for every level of fasting glucose.",
      "Waist circumference ≥90 cm (men) and ≥80 cm (women) defines central obesity in South Asians vs. ≥102/88 cm Western thresholds.",
    ],
    southAsianStats: [
      { value: "3–5×", label: "higher lifetime risk" },
      { value: "23 kg/m²", label: "overweight threshold" },
      { value: "10 yrs", label: "earlier onset" },
    ],
    chatQuestions: [
      "Why are South Asians at higher risk for type 2 diabetes at lower BMI?",
      "What are South Asian-specific diabetes screening guidelines?",
      "How does the traditional South Asian diet affect blood sugar control?",
    ],
  },
  {
    slug: "cardiovascular-disease",
    name: "Cardiovascular Disease",
    icon: "❤️",
    tagline: "South Asians have 40% higher cardiovascular mortality despite similar or lower cholesterol.",
    color: "bg-rose-50",
    borderColor: "border-rose-200",
    iconBg: "bg-rose-100",
    prevalence: "CVD is the leading cause of death for South Asians worldwide, accounting for 30–40% of all deaths.",
    whyHigherRisk: [
      "Higher lipoprotein(a) [Lp(a)] levels — a genetic risk factor for CVD independent of LDL cholesterol.",
      "Greater tendency for smaller, denser LDL particles that are more atherogenic than large LDL.",
      "Higher rates of insulin resistance amplify CVD risk beyond what traditional Framingham scores predict.",
      "Higher rates of premature coronary artery disease — South Asian men are 3–4× more likely to have a heart attack before age 40.",
      "ACE inhibitors are less effective in South Asians; calcium channel blockers are preferred first-line.",
    ],
    keyFindings: [
      "South Asians have a 50% higher age-adjusted CVD mortality rate than the general UK population (NHS data).",
      "Lp(a) levels are 2–3× higher in South Asians than in white Europeans — this is largely genetic.",
      "Traditional Framingham risk scores underestimate actual CVD risk in South Asians by ~30%.",
      "The INTERHEART study showed 90% of myocardial infarctions are attributable to 9 modifiable risk factors, all more prevalent in South Asians.",
    ],
    southAsianStats: [
      { value: "50%", label: "higher CVD mortality" },
      { value: "3–4×", label: "premature MI risk" },
      { value: "30%", label: "Framingham underestimation" },
    ],
    chatQuestions: [
      "How does cardiovascular disease risk differ in South Asians vs. white Europeans?",
      "What is Lp(a) and why is it a concern for South Asians?",
      "What blood pressure medications work best for South Asian patients?",
    ],
  },
  {
    slug: "hypertension",
    name: "Hypertension",
    icon: "💊",
    tagline: "High blood pressure is more severe and harder to control in South Asian populations.",
    color: "bg-orange-50",
    borderColor: "border-orange-200",
    iconBg: "bg-orange-100",
    prevalence: "Hypertension affects 33–40% of South Asian adults and is the leading modifiable CVD risk factor.",
    whyHigherRisk: [
      "Higher salt sensitivity in South Asian populations leads to greater blood pressure response to dietary sodium.",
      "Greater salt retention in kidneys at lower blood pressure levels compared to other ethnic groups.",
      "Higher rates of underlying metabolic syndrome and insulin resistance amplify hypertension risk.",
      "Cultural high-sodium diet patterns (pickles, chutneys, processed foods) compound genetic sensitivity.",
    ],
    keyFindings: [
      "South Asians are more salt-sensitive: the same sodium intake raises BP more in South Asians than in white Europeans.",
      "ACE inhibitors and beta-blockers are less effective as monotherapy in South Asians.",
      "Calcium channel blockers (e.g., amlodipine) and thiazide diuretics are recommended as first-line by NICE for South Asians.",
      "Target BP for South Asians with diabetes should be <130/80 mmHg rather than the standard <140/90.",
    ],
    southAsianStats: [
      { value: "33–40%", label: "adult prevalence" },
      { value: "130/80", label: "target if diabetic (mmHg)" },
      { value: "1st line", label: "CCBs preferred over ACEi" },
    ],
    chatQuestions: [
      "Which blood pressure medications are most effective for South Asians?",
      "How does salt sensitivity affect blood pressure in South Asians?",
      "What are the South Asian-specific blood pressure targets?",
    ],
  },
  {
    slug: "vitamin-d-deficiency",
    name: "Vitamin D Deficiency",
    icon: "☀️",
    tagline: "Over 60% of South Asians in Western countries are vitamin D deficient, affecting bone, immune, and metabolic health.",
    color: "bg-yellow-50",
    borderColor: "border-yellow-200",
    iconBg: "bg-yellow-100",
    prevalence: "60–90% of South Asians living at northern latitudes are vitamin D deficient (serum 25-OH < 50 nmol/L).",
    whyHigherRisk: [
      "Darker skin pigmentation (higher melanin) reduces skin's ability to synthesise vitamin D from UV light.",
      "Cultural practices — covered clothing, indoor lifestyles, sunscreen use — reduce sun exposure.",
      "Vegetarian and vegan diets common in South Asian communities provide very little dietary vitamin D.",
      "Living at northern latitudes (UK, Canada) provides insufficient UV-B radiation for adequate synthesis year-round.",
    ],
    keyFindings: [
      "Vitamin D deficiency is independently associated with T2DM, hypertension, CVD, and impaired immune function.",
      "Vitamin D supplementation in deficient South Asians improves insulin secretion and reduces inflammation markers.",
      "NICE recommends 400–1000 IU/day for at-risk groups; many South Asian adults require 1000–2000 IU to maintain adequate levels.",
      "Rickets (severe vitamin D deficiency in children) disproportionately affects South Asian children in the UK.",
    ],
    southAsianStats: [
      { value: "60–90%", label: "deficiency prevalence" },
      { value: "50 nmol/L", label: "sufficiency threshold" },
      { value: "1000–2000 IU", label: "typical supplementation need" },
    ],
    chatQuestions: [
      "What is the prevalence of vitamin D deficiency in South Asian populations?",
      "How much vitamin D supplementation do South Asians typically need?",
      "How does vitamin D deficiency affect diabetes risk?",
    ],
  },
  {
    slug: "pcos",
    name: "PCOS",
    icon: "🌸",
    tagline: "PCOS presents more severely in South Asian women, with stronger links to insulin resistance and metabolic complications.",
    color: "bg-pink-50",
    borderColor: "border-pink-200",
    iconBg: "bg-pink-100",
    prevalence: "PCOS affects 15–20% of South Asian women — significantly higher than the 8–13% global average.",
    whyHigherRisk: [
      "Higher baseline insulin resistance in South Asian women amplifies androgen excess and ovarian dysfunction.",
      "South Asian women with PCOS have more severe insulin resistance and metabolic syndrome at lower BMI.",
      "Cultural pressures and delayed diagnosis: symptoms are often dismissed or attributed to stress.",
      "Higher rates of Type 2 Diabetes risk in PCOS — South Asian women with PCOS have 4× the T2DM risk.",
    ],
    keyFindings: [
      "South Asian women with PCOS have significantly higher fasting insulin levels than white European women with identical BMI.",
      "The classic 'lean PCOS' phenotype is more common in South Asians — normal weight but severe insulin resistance.",
      "Metformin as an adjunct to lifestyle changes is particularly effective in South Asian women with PCOS due to higher IR.",
      "Gestational diabetes risk is 2–3× higher in South Asian women with PCOS history.",
    ],
    southAsianStats: [
      { value: "15–20%", label: "prevalence in SA women" },
      { value: "4×", label: "T2DM risk with PCOS" },
      { value: "Lean", label: "phenotype common in SA" },
    ],
    chatQuestions: [
      "How does PCOS present differently in South Asian women?",
      "What is the link between PCOS and diabetes in South Asian women?",
      "What lifestyle changes are most effective for PCOS in South Asians?",
    ],
  },
  {
    slug: "thyroid-disorders",
    name: "Thyroid Disorders",
    icon: "🦋",
    tagline: "Hypothyroidism and autoimmune thyroid disease are more prevalent in South Asian populations.",
    color: "bg-purple-50",
    borderColor: "border-purple-200",
    iconBg: "bg-purple-100",
    prevalence: "Hypothyroidism affects 10–15% of South Asian women and 2–5% of South Asian men.",
    whyHigherRisk: [
      "Higher rates of autoimmune conditions (Hashimoto's thyroiditis) in South Asian populations.",
      "Iodine insufficiency historically prevalent in parts of South Asia, still affecting some immigrant communities.",
      "Genetic predisposition: HLA-DR3 and HLA-DR5 variants linked to autoimmune thyroid disease are more prevalent.",
      "Interaction with vitamin D deficiency — low vitamin D independently increases autoimmune thyroid risk.",
    ],
    keyFindings: [
      "South Asian women are 5–8× more likely to develop hypothyroidism than South Asian men.",
      "Subclinical hypothyroidism is often undertreated in South Asians despite its effects on lipids and cardiovascular risk.",
      "Thyroid dysfunction significantly worsens metabolic syndrome and T2DM control — important co-diagnosis.",
      "Pregnancy-related thyroid screening is particularly important for South Asian women given the higher baseline prevalence.",
    ],
    southAsianStats: [
      { value: "10–15%", label: "prevalence in SA women" },
      { value: "5–8×", label: "higher in women vs men" },
      { value: "Co-morbid", label: "with T2DM & MetSyn" },
    ],
    chatQuestions: [
      "Why are thyroid disorders more common in South Asian women?",
      "How does hypothyroidism affect diabetes management?",
      "What thyroid screening is recommended for South Asians?",
    ],
  },
  {
    slug: "metabolic-syndrome",
    name: "Metabolic Syndrome",
    icon: "⚖️",
    tagline: "South Asians meet metabolic syndrome criteria at much lower BMI thresholds than Western populations.",
    color: "bg-amber-50",
    borderColor: "border-amber-200",
    iconBg: "bg-amber-100",
    prevalence: "Metabolic syndrome affects 25–35% of South Asian adults and 40–50% of those over 50.",
    whyHigherRisk: [
      "Ectopic fat deposition — South Asians store more fat in the liver, pancreas, and around organs at lower total body weight.",
      "South Asian phenotype: lower muscle mass and higher fat mass at same BMI as white Europeans ('thin-fat' phenotype).",
      "Combination of insulin resistance, central obesity, dyslipidaemia, and hypertension converges earlier.",
      "The 'thrifty genotype' hypothesis: genes selected for food scarcity now promote fat storage in caloric abundance.",
    ],
    keyFindings: [
      "South Asians have twice the visceral fat of white Europeans at the same BMI — drives MetSyn independent of total weight.",
      "IDF criteria for South Asians: waist ≥90 cm (men) / ≥80 cm (women) vs. ≥102/88 for Europeans.",
      "Even lean South Asians (BMI < 23) can have metabolic syndrome due to high visceral fat.",
      "Liver fat is 3–4× higher in South Asian versus white Europeans at the same BMI — linked to NAFLD and T2DM.",
    ],
    southAsianStats: [
      { value: "25–35%", label: "adult prevalence" },
      { value: "90/80 cm", label: "waist thresholds (M/F)" },
      { value: "2×", label: "visceral fat vs Europeans" },
    ],
    chatQuestions: [
      "What are the metabolic syndrome criteria for South Asians?",
      "Why do South Asians have higher visceral fat at lower BMI?",
      "How is metabolic syndrome treated differently in South Asians?",
    ],
  },
  {
    slug: "mental-health",
    name: "Mental Health",
    icon: "🧠",
    tagline: "Mental health conditions are under-diagnosed in South Asian communities due to stigma, cultural barriers, and different presentations.",
    color: "bg-teal-50",
    borderColor: "border-teal-200",
    iconBg: "bg-teal-100",
    prevalence: "South Asians experience similar rates of depression and anxiety but are 4× less likely to seek professional help.",
    whyHigherRisk: [
      "Cultural stigma: mental illness is often viewed as shameful or a sign of weakness in many South Asian communities.",
      "Somatic presentation: depression and anxiety often present as physical symptoms (headaches, chest pain) rather than emotional distress.",
      "Immigration stress, acculturation conflict, and intergenerational tension are significant risk factors.",
      "Lack of culturally competent mental health services — many South Asians report feeling misunderstood by providers.",
    ],
    keyFindings: [
      "South Asian women are particularly vulnerable to postpartum depression, with rates 2× higher than the UK average.",
      "Depression is bidirectionally linked with T2DM — each significantly worsens the other's outcomes.",
      "South Asian men are significantly less likely to disclose mental health symptoms due to masculinity-related stigma.",
      "Community-based, culturally adapted CBT has shown 60% better outcomes than standard CBT for South Asian patients.",
    ],
    southAsianStats: [
      { value: "4×", label: "less likely to seek help" },
      { value: "2×", label: "postpartum depression risk" },
      { value: "Somatic", label: "typical presentation" },
    ],
    chatQuestions: [
      "How does mental health stigma affect South Asian communities?",
      "What is the link between depression and type 2 diabetes in South Asians?",
      "What are culturally adapted mental health interventions for South Asians?",
    ],
  },
];

export function getCondition(slug: string): Condition | undefined {
  return CONDITIONS.find((c) => c.slug === slug);
}
