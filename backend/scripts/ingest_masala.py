"""
Ingest MASALA Study publications into the South Asian Health ChromaDB.

Searches PubMed by exact title for each paper, fetches the abstract
(and PMC full text where available), embeds with the project's
PubMedBERT model, and upserts into the existing collection.

Run from the backend directory with venv active:
    python scripts/ingest_masala.py
"""
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

# Ensure the backend root is on the path so rag.ingest imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import ssl
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
    _flush_batch,
    _classify_evidence,
)

# ---------------------------------------------------------------------------
# Full list of MASALA publications (titles only — we search PubMed by title)
# ---------------------------------------------------------------------------

MASALA_TITLES = [
    # 2026
    "Associations of the PREVENT Score with coronary artery and thoracic aortic calcification among South Asian Americans",
    "Association of Parity With ASCVD Risk Factors Among South Asian Women",
    "Adipokines and Cardiometabolic Risk in South Asian Americans: Findings from the MASALA Study",
    "Prevalence and Trends in Cardiovascular Risk Factors Among Middle-Aged South Asian Adults Compared With Other Racial and Ethnic Groups in the United States: A Longitudinal Analysis of 2 Cohort Studies",
    # 2025
    "The structure of religion and spirituality in a diverse sample of adults in the U.S.: A report on exploratory and confirmatory factor analyses in the Study on Stress, Spirituality, and Health",
    "Development and Evaluation of a Planetary Health Diet Index: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Chronic Stress and Cardiovascular Health: The MESA and MASALA Studies",
    "Remnant cholesterol and associations with incidence, progression, and change in coronary artery calcium in South Asian Americans",
    "Who Turns to God, and How? Religious and Spiritual Identity Differentially Predict Religious Coping Strategy Use in the Study on Stress, Spirituality, and Health",
    "Neighborhood social cohesion and Alzheimer's disease dementia risk in South Asian individuals in the United States",
    "Adherence to the EAT-Lancet Planetary Health Diet and Cardiometabolic Risk Markers in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Belief in Miracles, Religious/Spiritual Struggles, and Depressive Symptoms: Exploring Variation among American Indian, South Asian, and White Cohorts in the Study on Stress, Spirituality, and Health",
    "Sex-specific Coronary Artery Calcium Percentiles Across South Asian Adults: Combined Analyses from MASALA and DILWALE",
    "The Association of Discrimination, Inflammation, and Coping Style on Self-Rated Health among South Asian Individuals in the MASALA Study",
    "Immigration, acculturation, and diabetes: a comparative study of diabetes prevalence among Asian Indian immigrants living in the United States and native-born populations in India and the United States",
    "Experiences of Hot Flashes, Urinary Incontinence, and Mood Among South Asian American Women: the MASALA Study",
    "Everyday Discrimination and its Predictors in the MASALA Study",
    "Forgiveness and health across racial-ethnic cohorts: exploring the conditioning roles of religious attendance and closeness to God in the study on stress, spirituality, and health",
    "Association of Diastolic Blood Pressure and Coronary Artery Calcium in South Asian American Adults",
    "Religious affiliations, religious practices, and health behaviors in U.S. South Asians",
    "Demographic and Clinical Factors associated with SARS-CoV-2 anti-nucleocapsid antibody response among previously infected US adults: The C4R Study",
    "Association between behavioural risk factors for hypertension and concordance with the DASH dietary pattern among South Asians in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "Classifying COVID-19 Related Hospitalizations and Deaths",
    # 2024
    "Concordance Between DASH Diet and Coronary Artery Calcification: Results From the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Prospective Cohort Study",
    "Profiles of cardiometabolic risk and acculturation indicators among South Asians in the US: Latent class analysis of the MASALA study",
    "Predictors of weight and waist gain in US South Asians: Findings from the Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "Inverse association between total bilirubin and type 2 diabetes in U.S. South Asian males but not females",
    "Association of cardiovascular health with subclinical coronary atherosclerosis progression among five racial and ethnic groups: The MASALA and MESA studies",
    "Do religion and spirituality buffer the effect of childhood trauma on depressive symptoms? Examination of a South Asian cohort from the USA",
    "Epidemiologic features of recovery from SARS-CoV infection",
    "Metabolite profiles of plant-based diets and cardiometabolic risk in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Dietary Patterns in the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study: Comparisons Across Methodologies",
    "Comparing coronary artery cross-sectional area among asymptomatic South Asian, White, and Black participants: the MASALA and CARDIA studies",
    "Adipose Tissue-Derived Metabolite Risk Scores and Risk For Type 2 Diabetes in South Asians",
    "Social and Psychosocial Determinants of Racial and Ethnic Differences in Cardiovascular Health: The MASALA and MESA Studies",
    "Demographic and Clinical Factors Associated With SARS-CoV-2 Spike 1 Antibody Response Among Vaccinated US Adults: the C4R Study",
    # 2023
    "Does Religious Service Attendance Modify the Relationship between Everyday Discrimination and Risk of Obesity? Results from the Study on Stress, Spirituality and Health",
    "Association of lipoprotein subfractions with incidence of type 2 diabetes among five U.S. Race and Ethnic groups: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) and Multi-Ethnic study of Atherosclerosis (MESA)",
    "Examining the Relationship Between Multilevel Resilience Resources and Cardiovascular Disease Incidence, Overall and by Psychosocial Risks, Among Participants in the Jackson Heart Study, the Multi-Ethnic Study of Atherosclerosis, and the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Association of Diabetes with Coronary Artery Calcium in South Asian Adults and Other Race/Ethnic Groups: The Multi-Ethnic Study on Atherosclerosis (MESA) and the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Why Is Religious Attendance Linked to More Anxiety in U.S. South Asians? The Mediating Role of Congregational Neglect",
    "Concordance between Dash Diet and Hypertension: Results from the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Cardiovascular health by Life's Essential 8 and associations with coronary artery calcium in South Asian American adults in the MASALA Study",
    "Body mass index in young adulthood and mid-life cardiovascular risk factors in South Asian American adults: The MASALA Study",
    "Associations of Discrimination, Low Social Support, and Limited English Proficiency with Depression in South Asian Immigrants",
    "Association of American identity with cardiovascular health in South Asian Americans: The MASALA Study",
    "A South Asian Mediterranean-style diet is associated with favorable adiposity measures and lower diabetes risk: The MASALA cohort",
    "Religion/Spirituality and Prevalent Hypertension among Ethnic Cohorts in the Study on Stress, Spirituality, and Health",
    "A Multilevel Framework to Investigate Cardiovascular Health Disparities among South Asian Immigrants in the United States",
    # 2022
    "Cardiovascular Risk-Enhancing Factors and Coronary Artery Calcium in South Asian American Adults: The MASALA Study",
    "Social support, psychological risks, and cardiovascular health: Using harmonized data from JHS, MASALA, and MESA",
    "Liver, visceral and subcutaneous fat in men and women of South Asian and white European descent: a systematic review and meta-analysis of new and published data",
    "Examining relationships between perceived neighborhood social cohesion and ideal cardiovascular health and whether psychosocial stressors modify observed relationships among JHS, MESA, and MASALA participants",
    "A healthy plant-based diet is favorably associated with cardiometabolic risk factors among participants of South Asian ancestry",
    "Diet Patterns Are Associated with Circulating Metabolites and Lipid Profiles of South Asians in the United States",
    "Psychological Symptoms as Mediators in the Association between Discrimination and Health among South Asian Americans",
    "Coronary artery calcium incidence and changes using direct plaque measurements: The MASALA study",
    "Association of Coronary Artery Calcium Density and Volume with Predicted Atherosclerotic Cardiovascular Disease Risk and Cardiometabolic Risk Factors in South Asians: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Relationship of American Heart Association's Life Simple 7, Ectopic Fat and Insulin Resistance in 5 racial/ethnic groups",
    "Relation of Menopause with Cardiovascular Risk Factors in South Asian American Women (From the MASALA Study)",
    "Associations of NAFLD with Circulating Ceramides and Impaired Glycemia",
    "Collaborative Cohort of Cohorts for COVID-19 Research (C4R) Study: Study Design",
    # 2021
    "Cardiovascular risk factor profiles in North and South Indian and Pakistani Americans: The MASALA Study",
    "Implications of the 2019 American College of Cardiology/American Heart Association Primary Prevention Guidelines and potential value of the coronary artery calcium score among South Asians in the US: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "The Study on Stress, Spirituality, and Health (SSSH): Psychometric Evaluation and Initial Validation of the SSSH Baseline Spirituality Survey",
    "Cardiovascular Health and Subclinical Atherosclerosis in Second Generation South Asian Americans: The MASALA Study",
    "Associations between Cumulative Biological Risk and Subclinical Atherosclerosis in Middle- and Older-Aged South Asian Immigrants in the United States",
    "Distribution and Correlates of Incident Heart Failure Risk in South Asian Americans: The MASALA Study",
    "Association of Social Network Characteristics With Cardiovascular Health and Coronary Artery Calcium in South Asian Adults in the United States: The MASALA Cohort Study",
    "Hypertension guidelines and coronary artery calcification among South Asians: Results from MASALA and MESA",
    "Plasma protein expression profiles, cardiovascular disease, and religious struggles among South Asians in the MASALA study",
    # 2020
    "Association of diabetes subgroups with race/ethnicity, risk factor burden and complications: the MASALA and MESA studies",
    "Depression, religiosity, and telomere length in the Study on Stress, Spirituality, and Health (SSSH)",
    "The association between dairy intake and body composition among South Asian adults from the Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "Circulating metabolites and lipids are associated with glycaemic measures in South Asians",
    "Association of Alcohol Consumption and Ideal Cardiovascular Health among South Asians: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Physical and sexual abuse in childhood and adolescence and leukocyte telomere length: A pooled analysis of the study on psychosocial stress, spirituality, and health",
    "Distribution of Calcium Volume, Density, Number, and Type of Coronary Vessel with Calcified Plaque in South Asians in the US and other Race/Ethnic Groups: The MASALA and MESA Studies",
    "Lipoprotein (a) and Aortic Valve Calcium in South Asians Compared to Other Race/Ethnic Groups",
    "Social network characteristics are correlated with dietary patterns among middle aged and older South Asians living in the United States",
    "Incidence of diabetes and prediabetes and predictors of glycemic change among South Asians in the USA: the MASALA study",
    "Self-Rated Religiosity/Spirituality and Four Health Outcomes Among U.S. South Asians: Findings from the Study on Stress, Spirituality, and Health",
    "Acculturation is Associated with Dietary Patterns in South Asians in America",
    "Differences in Diet Quality among Multiple US Racial/Ethnic Groups from the Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study and the Multi-Ethnic Study of Atherosclerosis (MESA)",
    "Social influence of adult children on parental health behavior among South Asian immigrants: findings from the MASALA (Mediators of Atherosclerosis in South Asians Living in America) study",
    "The relationship of acculturation to cardiovascular disease risk factors among U.S. South Asians: Findings from the MASALA study",
    "Linkage between neighborhood social cohesion and BMI of South Asians in the MASALA Study",
    # 2019
    "Obstructive Sleep Apnea Risk and Subclinical Atherosclerosis in South Asians Living in the United States",
    "Association of Social Networks and Physical Activity in South Asians: The Mediators of Atherosclerosis in South Asians Living in America Cohort Study",
    "Methods to Account for Uncertainty in Latent Class Assignments When Using Latent Classes as Predictors in Regression Models, with Application to Acculturation Strategy Measures",
    "Private religion/spirituality, self-rated health, and mental health among US South Asians",
    "Mental health and self-rated health among U.S. South Asians: the role of religious group involvement",
    "Isolated HbA1c identifies a different subgroup of individuals with type 2 diabetes compared to fasting or post-challenge glucose in Asian Indians: The CARRS and MASALA studies",
    "Recruitment and retention of US South Asians for an epidemiologic cohort: Experience from the MASALA study",
    "Vegetarian diet is inversely associated with prevalence of depression in middle-older aged South Asians in the United States",
    "The association of religious affiliation with cholesterol levels among South Asians: the Mediators of Atherosclerosis in South Asians Living in America study",
    "Body Composition and Diabetes Risk in South Asians: Findings From the MASALA and MESA Studies",
    "Evaluating the Potential Association Between Lipoprotein(a) and Atherosclerosis (from the Mediators of Atherosclerosis Among South Asians Living in America Cohort)",
    "Incidence and Progression of Coronary Artery Calcium in South Asians Compared With 4 Race/Ethnic Groups",
    # 2018
    "Vegetarian Diets Are Associated with Selected Cardiometabolic Risk Factors among Middle-Older Aged South Asians in the United States",
    "Discordance between 10-year cardiovascular risk estimates using the ACC/AHA 2013 estimator and coronary artery calcium in individuals from 5 racial/ethnic groups: Comparing MASALA and MESA",
    "Prevalence of low-calorie sweetener intake in South Asian adults",
    "Social network body size is associated with body size norms of South Asian adults",
    "Associations Between Television Viewing and Adiposity Among South Asians",
    "Inflammation and coronary artery calcification in South Asians: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) study",
    "Personal Social Networks and Organizational Affiliation of South Asians in the United States",
    # 2017
    "Relation of Ectopic Fat with Atherosclerotic Cardiovascular Disease Risk Score in South Asians Living in the United States (from the Mediators of Atherosclerosis in South Asians Living in America [MASALA] Study)",
    "Risk of obstructive sleep apnoea is associated with glycaemia status in South Asian men and women in the United States",
    "Are Experiences of Discrimination Related to Poorer Dietary Intakes Among South Asians in the MASALA Study?",
    "Family History of CHD Is Associated With Severe CAC in South Asians",
    "Acculturation Strategies and Symptoms of Depression: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Cardiometabolic Abnormalities Among Normal-Weight Persons From Five Racial/Ethnic Groups in the United States",
    "Type 2 diabetes after gestational diabetes mellitus in South Asian women in the United States",
    "Prevalence of chronic kidney disease and risk factors for its progression: A cross-sectional comparison of Indians living in Indian versus U.S. cities",
    "Cardiovascular health metrics among South Asian adults in the United States: Prevalence and associations with subclinical atherosclerosis",
    # 2016
    "Ectopic Fat Depots and Coronary Artery Calcium in South Asians Compared With Other Racial/Ethnic Groups",
    "The Relationship between anthropometry and body composition from computed tomography: The Mediators of Atherosclerosis in South Asians Living in America Study",
    "Self-Reported Discrimination and Mental Health Among Asian Indians: Cultural Beliefs and Coping Style as Moderators",
    "The Association of Religious Affiliation with Overweight/Obesity among South Asians: The Mediators of Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Neighborhood Walkability and Walking for Transport Among South Asians in the MASALA Study",
    "Use of web-based methods for follow-up and collection of patient reported outcome measures in the Mediators of Atherosclerosis in South Asians Living in America Study",
    "Associations Between Discrimination and Cardiovascular Health Among Asian Indians in the United States",
    "Acculturation Strategies Among South Asian Immigrants: the MASALA Study",
    "Psychosocial factors and subclinical atherosclerosis in South Asians: the MASALA Study",
    # 2015
    "Neighborhood Social Cohesion and Prevalence of Hypertension and Diabetes in a South Asian Population",
    "Optimum BMI cut-points to screen Asian Americans for type 2 diabetes",
    "Dietary patterns are associated with metabolic risk factors in South Asians living in the United States",
    "Comparing type 2 diabetes, prediabetes, and their associated risk factors in Asian Indians in India and in the U.S.: the CARRS and MASALA Studies",
    "Dietary intakes among South Asian adults differ by length of residence in the USA",
    "Less favorable body composition and adipokines in South Asians compared to other U.S. ethnic groups: results from the MASALA and MESA Studies",
    # 2014
    "Correlates of prediabetes and type II diabetes in US South Asians: findings from the MASALA Study",
    "Comparing coronary artery calcium among U.S. South Asians with four racial/ethnic groups: the MASALA and MESA studies",
    "Understanding the high prevalence of diabetes in U.S. South Asians compared to four racial/ethnic groups: the MASALA and MESA studies",
    "Acculturation and subclinical atherosclerosis among U.S. South Asians: Findings from the MASALA study",
    "Association of 10-year and lifetime predicted cardiovascular disease risk with subclinical atherosclerosis in South Asians: findings from the MASALA Study",
    # 2013
    "Mediators of Atherosclerosis in South Asians Living in America (MASALA) study: Objectives, design, and cohort description",
    # Pilot studies
    "Exposure to Persistent Organic Pollutants (POPs) and Their Relationship to Hepatic Fat and Insulin Insensitivity among Asian Indian Immigrants in the United States",
    "Dietary Patterns among Asian Indians Living in the United States Have Distinct Metabolomic Profiles That Are Associated with Cardiometabolic Risk",
    "Vitamin D Levels, Body Composition, and Metabolic Factors in Asian Indians: Results from the Metabolic Syndrome and Atherosclerosis in South Asians Living in America Pilot Study",
    "The association between body composition and cystatin C in South Asians: results from the MASALA Study",
    "Endogenous sex hormones and glucose in a South Asian population without diabetes: the Metabolic Syndrome and Atherosclerosis in South-Asians Living in America pilot study",
    "Obesity and depression among Asian Indians in the United States: results from the MASALA study",
    "Circulating microRNAs associated with glycemic impairment and progression in Asian Indians",
    "Endogenous sex steroid hormones, lipid subfractions, and ectopic adiposity in Asian Indians",
    "The relative associations of beta-cell function and insulin sensitivity with glycemic status and glycemic progression in migrant Asian Indians in the United States: the MASALA study",
    "Dietary patterns in Asian Indians in the United States: an analysis of the metabolic syndrome and atherosclerosis in South Asians Living in America Study",
    "Glycemic associations with endothelial function and biomarkers among 5 ethnic groups: the MESA and MASALA Studies",
    "Asian Indian views on diet and health in the United States: importance of understanding cultural and social factors to address disparities",
    "Adipokines and body fat composition in South Asians: results of the Metabolic Syndrome and Atherosclerosis in South Asians Living in America (MASALA) Study",
    "Prevalence and correlates of diabetes in South Asian Indians in the United States: findings from the Metabolic Syndrome and Atherosclerosis in South Asians Living in America Study and the Multi-Ethnic Study of Atherosclerosis",
    "Higher protein intake is associated with diabetes risk in South Asian Indians: the Metabolic Syndrome and Atherosclerosis in South Asians Living in America (MASALA) Study",
    "BMD reference standards among South Asians in the United States",
]


def _title_to_search_term(title: str) -> str:
    """Convert a full title to a reliable PubMed search query.

    Exact [ti] searches fail on NCBI when titles contain special characters
    or are very long. Instead we use the first 8 significant words from the
    title combined with MASALA[tiab] to narrow results reliably.
    """
    import re
    # Strip punctuation that confuses the parser
    clean = re.sub(r"[\"()\[\]&/:?]", " ", title)
    # Take first 8 words (enough for uniqueness, short enough to avoid parse errors)
    words = clean.split()[:8]
    keyword_query = " ".join(words)
    return f"{keyword_query}[tiab] AND MASALA[tiab]"


def search_pubmed_by_title(title: str, email: str, retries: int = 2) -> list[dict]:
    """Search PubMed for a MASALA paper. Returns a list with 0 or 1 paper dicts."""
    Entrez.email = email
    search_term = _title_to_search_term(title)
    for attempt in range(retries):
        try:
            handle = Entrez.esearch(
                db="pubmed",
                term=search_term,
                retmax=3,
                sort="relevance",
            )
            record = Entrez.read(handle)
            handle.close()
            pmids = record.get("IdList", [])
            if not pmids:
                return []

            fetch_handle = Entrez.efetch(
                db="pubmed", id=pmids[0], rettype="xml", retmode="xml"
            )
            fetch_record = Entrez.read(fetch_handle)
            fetch_handle.close()

            papers = []
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
                        # No abstract on PubMed — still ingest the title so the
                        # paper is searchable by title text
                        abstract = fetched_title

                    pmid = str(medline["PMID"])
                    pub_date = (
                        art.get("Journal", {})
                        .get("JournalIssue", {})
                        .get("PubDate", {})
                    )
                    year = str(
                        pub_date.get("Year", pub_date.get("MedlineDate", "")[:4])
                    )
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

                    papers.append({
                        "pmid": pmid,
                        "title": fetched_title,
                        "abstract": abstract,
                        "authors": ", ".join(authors),
                        "year": year,
                        "source": "MASALA Study / PubMed",
                        "doi": "",
                        "evidence_level": evidence_level,
                        "pub_types": ", ".join(pub_types),
                    })
                    break  # Take the first result
                except Exception:
                    continue
            return papers
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                print(f"  PubMed lookup failed: {e}")
    return []


def fetch_pmc_for_pmid(pmid: str, email: str) -> str | None:
    """Try to get PMC full text for a given PMID. Returns body text or None."""
    Entrez.email = email
    try:
        # Convert PMID -> PMCID via elink
        link_handle = Entrez.elink(
            dbfrom="pubmed", db="pmc", id=pmid, linkname="pubmed_pmc"
        )
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

        fetch_handle = Entrez.efetch(
            db="pmc", id=pmc_ids[0], rettype="xml", retmode="xml"
        )
        raw_xml = fetch_handle.read()
        fetch_handle.close()

        # Parse body text from PMC XML
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

    print(f"Loading embedding model…")
    get_embedding_model()

    client = get_chroma_client(chroma_path)
    collection = get_collection(client)
    print(f"ChromaDB collection currently has {collection.count()} chunks.\n")

    found = 0
    not_found: list[str] = []
    papers_to_ingest: list[dict] = []

    total = len(MASALA_TITLES)
    for i, title in enumerate(MASALA_TITLES, 1):
        print(f"[{i}/{total}] Searching: {title[:70]}…")
        results = search_pubmed_by_title(title, email)
        time.sleep(0.35)  # Respect NCBI rate limit (3 req/s)

        if not results:
            print(f"  ✗ Not found on PubMed")
            not_found.append(title)
            continue

        paper = results[0]
        found += 1

        # Attempt to upgrade to PMC full text
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
            print(f"  ✓ Found")

        papers_to_ingest.append(paper)

        # Ingest in batches of 20 to checkpoint progress
        if len(papers_to_ingest) >= 20:
            n = ingest_papers_to_chroma(papers_to_ingest, collection)
            print(f"\n  → Ingested batch of {n} chunks. Total in DB: {collection.count()}\n")
            papers_to_ingest = []

    # Ingest remaining
    if papers_to_ingest:
        n = ingest_papers_to_chroma(papers_to_ingest, collection)
        print(f"\n  → Ingested final batch of {n} chunks.")

    print(f"\n{'='*60}")
    print(f"MASALA ingestion complete.")
    print(f"  Found on PubMed: {found}/{total}")
    print(f"  Not found:       {len(not_found)}")
    print(f"  Total chunks now in DB: {collection.count()}")

    if not_found:
        print(f"\nPapers not found on PubMed ({len(not_found)}):")
        for t in not_found:
            print(f"  - {t}")


if __name__ == "__main__":
    main()
