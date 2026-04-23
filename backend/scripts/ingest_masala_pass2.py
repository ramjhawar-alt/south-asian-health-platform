"""
Second-pass MASALA ingestion for papers that weren't found in pass 1.

Uses a smarter search: extract key content words from title (skipping
stop words), search each word as [tiab], and filter by South Asian context.

Run from the backend directory with venv active:
    python scripts/ingest_masala_pass2.py
"""
import os
import sys
import time
import ssl
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import certifi
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
ssl._create_default_https_context = ssl.create_default_context

from Bio import Entrez

from rag.ingest import (
    get_chroma_client,
    get_collection,
    get_embedding_model,
    ingest_papers_to_chroma,
    _classify_evidence,
)

# Papers that were NOT found in pass 1
NOT_FOUND_TITLES = [
    "Associations of the PREVENT Score with coronary artery and thoracic aortic calcification among South Asian Americans",
    "Adipokines and Cardiometabolic Risk in South Asian Americans: Findings from the MASALA Study",
    "The structure of religion and spirituality in a diverse sample of adults in the U.S.: A report on exploratory and confirmatory factor analyses in the Study on Stress, Spirituality, and Health",
    "Chronic Stress and Cardiovascular Health: The MESA and MASALA Studies",
    "Who Turns to God, and How? Religious and Spiritual Identity Differentially Predict Religious Coping Strategy Use in the Study on Stress, Spirituality, and Health",
    "Neighborhood social cohesion and Alzheimer's disease dementia risk in South Asian individuals in the United States",
    "Adherence to the EAT-Lancet Planetary Health Diet and Cardiometabolic Risk Markers in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Belief in Miracles, Religious/Spiritual Struggles, and Depressive Symptoms: Exploring Variation among American Indian, South Asian, and White Cohorts in the Study on Stress, Spirituality, and Health",
    "Immigration, acculturation, and diabetes: a comparative study of diabetes prevalence among Asian Indian immigrants living in the United States and native-born populations in India and the United States",
    "Religious affiliations, religious practices, and health behaviors in U.S. South Asians",
    "Demographic and Clinical Factors associated with SARS-CoV-2 anti-nucleocapsid antibody response among previously infected US adults: The C4R Study",
    "Association between behavioural risk factors for hypertension and concordance with the DASH dietary pattern among South Asians in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "Classifying COVID-19 Related Hospitalizations and Deaths",
    "Profiles of cardiometabolic risk and acculturation indicators among South Asians in the US: Latent class analysis of the MASALA study",
    "Predictors of weight and waist gain in US South Asians: Findings from the Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "Inverse association between total bilirubin and type 2 diabetes in U.S. South Asian males but not females",
    "Epidemiologic features of recovery from SARS-CoV infection",
    "Dietary Patterns in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study: Comparisons Across Methodologies",
    "Adipose Tissue-Derived Metabolite Risk Scores and Risk For Type 2 Diabetes in South Asians",
    "Social and Psychosocial Determinants of Racial and Ethnic Differences in Cardiovascular Health: The MASALA and MESA Studies",
    "Demographic and Clinical Factors Associated With SARS-CoV-2 Spike 1 Antibody Response Among Vaccinated US Adults: the C4R Study",
    "Does Religious Service Attendance Modify the Relationship between Everyday Discrimination and Risk of Obesity? Results from the Study on Stress, Spirituality and Health",
    "Association of lipoprotein subfractions with incidence of type 2 diabetes among five U.S. Race and Ethnic groups: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) and Multi-Ethnic study of Atherosclerosis (MESA)",
    "Association of Diabetes with Coronary Artery Calcium in South Asian Adults and Other Race/Ethnic Groups: The Multi-Ethnic Study on Atherosclerosis (MESA) and the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Body mass index in young adulthood and mid-life cardiovascular risk factors in South Asian American adults: The MASALA Study",
    "Associations of Discrimination, Low Social Support, and Limited English Proficiency with Depression in South Asian Immigrants",
    "A South Asian Mediterranean-style diet is associated with favorable adiposity measures and lower diabetes risk: The MASALA cohort",
    "Religion/Spirituality and Prevalent Hypertension among Ethnic Cohorts in the Study on Stress, Spirituality, and Health",
    "A Multilevel Framework to Investigate Cardiovascular Health Disparities among South Asian Immigrants in the United States",
    "Social support, psychological risks, and cardiovascular health: Using harmonized data from JHS, MASALA, and MESA",
    "Liver, visceral and subcutaneous fat in men and women of South Asian and white European descent: a systematic review and meta-analysis of new and published data",
    "Association of Coronary Artery Calcium Density and Volume with Predicted Atherosclerotic Cardiovascular Disease Risk and Cardiometabolic Risk Factors in South Asians: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Relationship of American Heart Association's Life Simple 7, Ectopic Fat and Insulin Resistance in 5 racial/ethnic groups",
    "Associations of NAFLD with Circulating Ceramides and Impaired Glycemia",
    "Collaborative Cohort of Cohorts for COVID-19 Research (C4R) Study: Study Design",
    "The Study on Stress, Spirituality, and Health (SSSH): Psychometric Evaluation and Initial Validation of the SSSH Baseline Spirituality Survey",
    "Associations between Cumulative Biological Risk and Subclinical Atherosclerosis in Middle- and Older-Aged South Asian Immigrants in the United States",
    "Hypertension guidelines and coronary artery calcification among South Asians: Results from MASALA and MESA",
    "Plasma protein expression profiles, cardiovascular disease, and religious struggles among South Asians in the MASALA study",
    "Depression, religiosity, and telomere length in the Study on Stress, Spirituality, and Health (SSSH)",
    "Physical and sexual abuse in childhood and adolescence and leukocyte telomere length: A pooled analysis of the study on psychosocial stress, spirituality, and health",
    "Distribution of Calcium Volume, Density, Number, and Type of Coronary Vessel with Calcified Plaque in South Asians in the US and other Race/Ethnic Groups: The MASALA and MESA Studies",
    "Obstructive Sleep Apnea Risk and Subclinical Atherosclerosis in South Asians Living in the United States",
    "Association of Social Networks and Physical Activity in South Asians: The Mediators of Atherosclerosis in South Asians Living in America Cohort Study",
    "Private religion/spirituality, self-rated health, and mental health among US South Asians",
    "Mental health and self-rated health among U.S. South Asians: the role of religious group involvement",
    "Recruitment and retention of US South Asians for an epidemiologic cohort: Experience from the MASALA study",
    "Evaluating the Potential Association Between Lipoprotein(a) and Atherosclerosis (from the Mediators of Atherosclerosis Among South Asians Living in America Cohort)",
    "Vegetarian Diets Are Associated with Selected Cardiometabolic Risk Factors among Middle-Older Aged South Asians in the United States",
    "Prevalence of low-calorie sweetener intake in South Asian adults",
    "Social network body size is associated with body size norms of South Asian adults",
    "Associations Between Television Viewing and Adiposity Among South Asians",
    "Risk of obstructive sleep apnoea is associated with glycaemia status in South Asian men and women in the United States",
    "Family History of CHD Is Associated With Severe CAC in South Asians",
    "Type 2 diabetes after gestational diabetes mellitus in South Asian women in the United States",
    "Prevalence of chronic kidney disease and risk factors for its progression: A cross-sectional comparison of Indians living in Indian versus U.S. cities",
    "Ectopic Fat Depots and Coronary Artery Calcium in South Asians Compared With Other Racial/Ethnic Groups",
    "The Association of Religious Affiliation with Overweight/Obesity among South Asians: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Neighborhood Walkability and Walking for Transport Among South Asians in the MASALA Study",
    "Use of web-based methods for follow-up and collection of patient reported outcome measures in the Mediators of Atherosclerosis in South Asians Living in America Study",
    "Associations Between Discrimination and Cardiovascular Health Among Asian Indians in the United States",
    "Neighborhood Social Cohesion and Prevalence of Hypertension and Diabetes in a South Asian Population",
    "Optimum BMI cut-points to screen Asian Americans for type 2 diabetes",
    "Dietary patterns are associated with metabolic risk factors in South Asians living in the United States",
    "Dietary intakes among South Asian adults differ by length of residence in the USA",
    "Understanding the high prevalence of diabetes in U.S. South Asians compared to four racial/ethnic groups: the MASALA and MESA studies",
    "Exposure to Persistent Organic Pollutants (POPs) and Their Relationship to Hepatic Fat and Insulin Insensitivity among Asian Indian Immigrants in the United States",
    "Vitamin D Levels, Body Composition, and Metabolic Factors in Asian Indians: Results from the Metabolic Syndrome and Atherosclerosis in South Asians Living in America Pilot Study",
    "The association between body composition and cystatin C in South Asians: results from the MASALA Study",
    "Endogenous sex hormones and glucose in a South Asian population without diabetes: the Metabolic Syndrome and Atherosclerosis in South-Asians Living in America pilot study",
    "Obesity and depression among Asian Indians in the United States: results from the MASALA study",
    "Circulating microRNAs associated with glycemic impairment and progression in Asian Indians",
    "Endogenous sex steroid hormones, lipid subfractions, and ectopic adiposity in Asian Indians",
    "The relative associations of beta-cell function and insulin sensitivity with glycemic status and glycemic progression in migrant Asian Indians in the United States: the MASALA study",
    "Glycemic associations with endothelial function and biomarkers among 5 ethnic groups: the MESA and MASALA Studies",
    "Asian Indian views on diet and health in the United States: importance of understanding cultural and social factors to address disparities",
    "BMD reference standards among South Asians in the United States",
]

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "its", "it",
    "this", "that", "these", "those", "not", "no", "nor", "so", "yet",
    "both", "either", "neither", "each", "than", "such", "among",
    "between", "about", "into", "through", "during", "before", "after",
    "above", "below", "up", "down", "out", "off", "over", "under",
    "u.s", "u.s.", "us", "versus", "vs",
}

CONTEXT_FILTERS = [
    '"South Asian"[tiab]',
    "MASALA[tiab]",
    '"Asian Indian"[tiab]',
    "SSSH[tiab]",
    '"South Asians"[tiab]',
]


def _content_words(title: str, n: int = 5) -> list[str]:
    """Extract N meaningful (non-stop) words from a title."""
    import re
    clean = re.sub(r"[\"'()\[\]&/:?.,;!]", " ", title.lower())
    words = [w for w in clean.split() if w not in STOPWORDS and len(w) > 2]
    return words[:n]


def _build_queries(title: str) -> list[str]:
    """Build multiple fallback search queries for a title."""
    import re
    words = _content_words(title, 5)
    if not words:
        return []

    keyword_part = " AND ".join(f"{w}[tiab]" for w in words)

    queries = []
    for ctx in CONTEXT_FILTERS:
        queries.append(f"({keyword_part}) AND {ctx}")

    # Final fallback: just key words, no context filter
    queries.append(keyword_part)

    return queries


def fetch_paper_details(pmid: str, email: str) -> dict | None:
    """Fetch PubMed article metadata for a single PMID."""
    Entrez.email = email
    try:
        fetch_handle = Entrez.efetch(db="pubmed", id=pmid, rettype="xml", retmode="xml")
        fetch_record = Entrez.read(fetch_handle)
        fetch_handle.close()

        for article in fetch_record.get("PubmedArticle", []):
            try:
                medline = article["MedlineCitation"]
                art = medline["Article"]
                fetched_title = str(art.get("ArticleTitle", ""))
                abstract_list = art.get("Abstract", {}).get("AbstractText", [])
                abstract = (
                    " ".join(str(a) for a in abstract_list)
                    if isinstance(abstract_list, list)
                    else str(abstract_list)
                )
                if not abstract.strip():
                    abstract = fetched_title

                pmid_str = str(medline["PMID"])
                pub_date = (
                    art.get("Journal", {})
                    .get("JournalIssue", {})
                    .get("PubDate", {})
                )
                year = str(pub_date.get("Year", pub_date.get("MedlineDate", "")[:4]))
                pub_types = [str(pt) for pt in art.get("PublicationTypeList", [])]
                evidence_level = _classify_evidence(pub_types)
                authors_list = art.get("AuthorList", [])
                authors = []
                for a in authors_list[:3]:
                    last = a.get("LastName", "")
                    fore = a.get("ForeName", "")
                    if last:
                        authors.append(f"{last} {fore}".strip())
                if len(authors_list) > 3:
                    authors.append("et al.")

                return {
                    "pmid": pmid_str,
                    "title": fetched_title,
                    "abstract": abstract,
                    "authors": ", ".join(authors),
                    "year": year,
                    "source": "MASALA Study / PubMed",
                    "doi": "",
                    "evidence_level": evidence_level,
                    "pub_types": ", ".join(pub_types),
                }
            except Exception:
                continue
    except Exception:
        return None
    return None


def search_pubmed_fallback(title: str, email: str) -> dict | None:
    """Try multiple query strategies and return the first result found."""
    Entrez.email = email
    queries = _build_queries(title)
    for q in queries:
        try:
            handle = Entrez.esearch(db="pubmed", term=q, retmax=3, sort="relevance")
            record = Entrez.read(handle)
            handle.close()
            pmids = record.get("IdList", [])
            if pmids:
                paper = fetch_paper_details(pmids[0], email)
                if paper:
                    return paper
            time.sleep(0.2)
        except Exception:
            time.sleep(0.5)
    return None


def fetch_pmc_for_pmid(pmid: str, email: str) -> str | None:
    """Try PMC full text for a given PMID."""
    Entrez.email = email
    try:
        link_handle = Entrez.elink(dbfrom="pubmed", db="pmc", id=pmid, linkname="pubmed_pmc")
        link_record = Entrez.read(link_handle)
        link_handle.close()

        pmc_ids = []
        for link_set in link_record:
            for db_link in link_set.get("LinkSetDb", []):
                if db_link.get("LinkName") == "pubmed_pmc":
                    pmc_ids = [l["Id"] for l in db_link.get("Link", [])]
                    break
            if pmc_ids:
                break

        if not pmc_ids:
            return None

        fetch_handle = Entrez.efetch(db="pmc", id=pmc_ids[0], rettype="xml", retmode="xml")
        raw_xml = fetch_handle.read()
        fetch_handle.close()

        try:
            root = ET.fromstring(
                raw_xml if isinstance(raw_xml, str)
                else raw_xml.decode("utf-8", errors="replace")
            )
        except ET.ParseError:
            return None

        parts: list[str] = []
        for body in root.iter("body"):
            for p in body.iter("p"):
                text = "".join(p.itertext()).strip()
                if text:
                    parts.append(text)
        return "\n\n".join(parts) if parts else None
    except Exception:
        return None


def main() -> None:
    email = os.getenv("ENTREZ_EMAIL", "")
    if not email:
        print("ERROR: ENTREZ_EMAIL not set in .env")
        sys.exit(1)

    chroma_path = os.getenv("CHROMA_DB_PATH", "../data/chroma_db")

    print("Loading embedding model…")
    get_embedding_model()

    client = get_chroma_client(chroma_path)
    collection = get_collection(client)
    print(f"ChromaDB collection currently has {collection.count()} chunks.\n")

    found = 0
    still_not_found: list[str] = []
    papers_to_ingest: list[dict] = []

    total = len(NOT_FOUND_TITLES)
    for i, title in enumerate(NOT_FOUND_TITLES, 1):
        print(f"[{i}/{total}] Searching: {title[:70]}…")
        paper = search_pubmed_fallback(title, email)
        time.sleep(0.35)

        if not paper:
            print("  ✗ Still not found")
            still_not_found.append(title)
            continue

        found += 1

        # Try PMC full text upgrade
        if paper.get("pmid"):
            full_text = fetch_pmc_for_pmid(paper["pmid"], email)
            time.sleep(0.35)
            if full_text and len(full_text) > 300:
                paper["abstract"] = full_text
                paper["source"] = "MASALA Study / PMC Full Text"
                print(f"  ✓ Found + PMC full text ({len(full_text):,} chars)")
            else:
                print(f"  ✓ Found (abstract only)")
        else:
            print("  ✓ Found")

        papers_to_ingest.append(paper)

        if len(papers_to_ingest) >= 20:
            n = ingest_papers_to_chroma(papers_to_ingest, collection)
            print(f"\n  → Batch ingested: {n} chunks. Total in DB: {collection.count()}\n")
            papers_to_ingest = []

    if papers_to_ingest:
        n = ingest_papers_to_chroma(papers_to_ingest, collection)
        print(f"\n  → Final batch: {n} chunks.")

    print(f"\n{'='*60}")
    print(f"Pass 2 complete.")
    print(f"  Found:     {found}/{total}")
    print(f"  Not found: {len(still_not_found)}")
    print(f"  Total chunks in DB: {collection.count()}")

    if still_not_found:
        print(f"\nStill not found ({len(still_not_found)}):")
        for t in still_not_found:
            print(f"  - {t}")


if __name__ == "__main__":
    main()
