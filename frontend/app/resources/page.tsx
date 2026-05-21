import Link from "next/link";

interface Resource {
  title: string;
  description: string;
  url: string;
  tag: string;
  tagColor: string;
}

const RESOURCES: Resource[] = [
  {
    title: "South Asian Health Foundation (UK)",
    description:
      "UK charity dedicated to improving the health of South Asian communities through research, education, and clinical guidelines.",
    url: "https://www.sahf.org.uk",
    tag: "Organization",
    tagColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    title: "South Asian Cardiovascular Center — Cleveland Clinic",
    description:
      "Specialized center addressing the outsized cardiovascular risk in South Asians, with patient resources and care pathways.",
    url: "https://my.clevelandclinic.org/departments/heart/depts/south-asian-cardiovascular-center",
    tag: "Clinical Center",
    tagColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    title: "AHA: Heart Disease Risk in South Asians",
    description:
      "American Heart Association overview of why South Asians develop coronary artery disease at higher rates and at younger ages.",
    url: "https://www.heart.org/en/health-topics/consumer-healthcare/what-is-cardiovascular-disease/heart-disease-and-stroke-statistics",
    tag: "Guideline",
    tagColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    title: "MASALA Study",
    description:
      "Mediators of Atherosclerosis in South Asians Living in America — landmark UCSF cohort study with ongoing findings on South Asian CVD risk.",
    url: "https://masalastudy.ucsf.edu",
    tag: "Research",
    tagColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    title: "CDC: Diabetes & Asian Americans",
    description:
      "CDC explainer on why Asian Americans — including South Asians — develop type 2 diabetes at lower BMI thresholds than other groups.",
    url: "https://www.cdc.gov/diabetes/library/features/diabetes-asian-americans.html",
    tag: "Government",
    tagColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    title: "South Asian Heart Center — El Camino Health",
    description:
      "One of the first centers focused exclusively on South Asian heart health, offering screenings and prevention programs.",
    url: "https://www.elcaminohealth.org/service/heart-vascular-care/south-asian-heart-center",
    tag: "Clinical Center",
    tagColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    title: "IDF Diabetes Atlas",
    description:
      "International Diabetes Federation global statistics — the South-East Asia and SEAR regions cover India, Sri Lanka, Bangladesh, and Nepal.",
    url: "https://diabetesatlas.org",
    tag: "Research",
    tagColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    title: "ICMR-INDIAB Study",
    description:
      "India's largest national study on diabetes prevalence, estimating over 101 million people with diabetes across all states.",
    url: "https://www.thelancet.com/journals/landia/article/PIIS2213-8587(23)00119-5/fulltext",
    tag: "Research",
    tagColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    title: "South Asian Public Health Association (SAPHA)",
    description:
      "US-based nonprofit advancing the health of South Asians through advocacy, research partnerships, and community outreach.",
    url: "https://www.sapha.net",
    tag: "Organization",
    tagColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    title: "WHO South-East Asia Region — NCDs",
    description:
      "WHO SEARO data and policy resources on non-communicable diseases (cardiovascular disease, diabetes, cancer) across the region.",
    url: "https://www.who.int/southeastasia/health-topics/noncommunicable-diseases",
    tag: "Government",
    tagColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    title: "Cooking with South Asian Spices (AHA)",
    description:
      "American Heart Association practical guide for adapting traditional South Asian cooking to be heart-healthy.",
    url: "https://www.heart.org/en/healthy-living/healthy-eating/cooking-skills/cooking/cooking-with-traditional-south-asian-foods",
    tag: "Lifestyle",
    tagColor: "bg-green-50 text-green-700 border-green-200",
  },
  {
    title: "South Asian Mental Health Initiative (SAMHIN)",
    description:
      "Organization destigmatizing mental health in South Asian communities and connecting families with culturally competent care.",
    url: "https://samhin.org",
    tag: "Mental Health",
    tagColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
];

const CATEGORY_ORDER = ["Clinical Center", "Organization", "Government", "Research", "Lifestyle", "Mental Health", "Guideline"];

export default function ResourcesPage() {
  const grouped = CATEGORY_ORDER.reduce<Record<string, Resource[]>>((acc, tag) => {
    const items = RESOURCES.filter((r) => r.tag === tag);
    if (items.length) acc[tag] = items;
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] text-[var(--primary)] text-xs font-semibold mb-4">
          Curated Resource Library
        </div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-3">
          Trusted resources on South Asian health
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm leading-relaxed max-w-2xl">
          A hand-picked collection of clinical centers, research studies, government data, and
          community organizations focused on the health challenges that disproportionately affect
          South Asian populations.
        </p>
      </div>

      {/* Resource sections */}
      <div className="space-y-10">
        {Object.entries(grouped).map(([tag, items]) => (
          <section key={tag}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-4">
              {tag}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-2 rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[var(--foreground)] leading-snug group-hover:text-[var(--primary)] transition-colors">
                      {r.title}
                    </h3>
                    <span
                      className={`shrink-0 text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${r.tagColor}`}
                    >
                      {r.tag}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] leading-relaxed flex-1">
                    {r.description}
                  </p>
                  <span className="text-xs font-medium text-[var(--primary)] group-hover:underline">
                    Visit →
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="mt-12 bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-[var(--foreground)] mb-1">Want to go deeper?</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Ask our AI specific questions — every answer is cited from peer-reviewed literature.
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <Link
            href="/chat"
            className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-hover)] transition-colors whitespace-nowrap"
          >
            Ask a Question →
          </Link>
          <Link
            href="/conditions"
            className="px-4 py-2 rounded-xl border border-[var(--card-border)] bg-white text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors whitespace-nowrap"
          >
            Browse Conditions →
          </Link>
        </div>
      </div>
    </div>
  );
}
