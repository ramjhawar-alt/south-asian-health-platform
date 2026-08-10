"""
MCP server — South Asian Health literature retrieval tool.

Exposes the full hybrid retrieval pipeline (query expansion + HyDE + Voyage dense
search + BM25 + FlashRank reranking + evidence boosting) as a single MCP tool,
plus pre-synthesized wiki pages as readable MCP resources, plus a South Asian
cardiometabolic risk calculator tool.

Run:
    python backend/mcp_server.py           # stdio transport (used by Claude Desktop)
    mcp dev backend/mcp_server.py          # MCP Inspector — interactive browser UI
    mcp install backend/mcp_server.py --env-file backend/.env   # auto-configure Claude Desktop
"""
from __future__ import annotations

import os
import sys

# Put the backend package root on sys.path so "from rag.retrieval import …" works
# regardless of where the MCP client launches this script from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp.server.mcpserver import MCPServer

from pulse.engine import PatientProfile, run_simulation
from rag.retrieval import format_context, retrieve

mcp = MCPServer(
    name="south-asian-health",
    instructions=(
        "This server gives you direct access to a curated corpus of peer-reviewed "
        "research on South Asian cardiometabolic health (~43 000 indexed paper chunks). "
        "Use search_south_asian_health_literature before answering any question about "
        "diabetes, cardiovascular disease, hypertension, metabolic syndrome, obesity, "
        "or related conditions specifically in South Asian populations. "
        "Use calculate_south_asian_risk when the user gives you their health numbers "
        "(age, weight, height, blood pressure, glucose) and wants a personalised risk "
        "snapshot using South Asian-specific thresholds. "
        "Use the wiki:// resources to load a pre-synthesized topic summary directly "
        "into context — faster than a search when the topic is known."
    ),
)


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _chroma_path() -> str:
    """Same resolution logic as routes/chat.py get_chroma_path()."""
    return os.getenv(
        "CHROMA_DB_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "chroma_db"),
    )


def _kb_root() -> str:
    return os.getenv(
        "KNOWLEDGE_BASE_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "knowledge_base"),
    )


def _slug_to_title(slug: str) -> str:
    return slug.replace("_", " ").title()


# ─────────────────────────────────────────────────────────────────────────────
#  Tool 1 — Literature search
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def search_south_asian_health_literature(query: str, top_k: int = 8) -> dict:
    """Search the South Asian cardiometabolic health literature corpus and return cited evidence.

    Use this tool for any question about health risks, conditions, or interventions
    specifically studied in South Asian populations, including:
      - Type 2 diabetes and insulin resistance in South Asians
      - Cardiovascular disease, hypertension, and stroke risk
      - Metabolic syndrome, visceral adiposity, and BMI thresholds
      - PCOS, gestational diabetes, chronic kidney disease, NAFLD
      - Dietary patterns, physical activity, and pharmacological management
      - Genetic risk factors and South Asian-specific clinical thresholds
      - Vitamin D deficiency, thalassemia, tuberculosis in South Asian cohorts

    The pipeline runs: query expansion → HyDE → Voyage AI dense search across raw
    papers + synthesized wiki pages → BM25 → Reciprocal Rank Fusion → FlashRank
    cross-encoder reranking → evidence-level boosting.

    NOT for: general (non-South-Asian-specific) medicine, drug prescribing advice,
    diagnosis, or topics outside cardiometabolic/metabolic medicine.

    Args:
        query: A specific health question or search topic. Mention the condition or
               intervention and ideally the South Asian population context.
        top_k: Number of evidence passages to return. Default 8; raise to 12–15
               for complex multi-condition questions.

    Returns:
        A dict with:
          "evidence"       — formatted context string; each passage is prefixed with a
                             reference number and evidence type (Guideline, RCT, etc.).
          "citations"      — list of dicts: {ref, title, authors, year, doi, source,
                             evidence_level, evidence_label}.
          "low_confidence" — bool. True when top-match score < 0.35; caveat your
                             answer and do not fabricate missing evidence.
    """
    hits, info = retrieve(query=query, chroma_db_path=_chroma_path(), top_k=top_k)
    evidence, citations = format_context(hits)
    return {
        "evidence": evidence,
        "citations": citations,
        "low_confidence": bool(info.get("low_confidence", False)),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Tool 2 — South Asian cardiometabolic risk calculator
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def calculate_south_asian_risk(
    age: int,
    sex: str,
    weight_kg: float,
    height_cm: float,
    systolic_bp: int,
    diastolic_bp: int,
    heart_rate: int,
    fasting_glucose_mmol: float,
    hba1c: float | None = None,
    has_diabetes: bool = False,
    has_hypertension: bool = False,
    is_smoker: bool = False,
    physical_activity: str = "moderate",
) -> dict:
    """Calculate South Asian-specific cardiometabolic risk snapshot for a patient.

    Use this tool when the user provides their health numbers and wants a personalised
    risk summary. This is specifically calibrated for South Asian populations using:
      - WHO Asia-Pacific BMI thresholds (overweight ≥23, obese ≥27.5 — not the
        standard Western ≥25/≥30)
      - Framingham 10-year CVD risk with a 1.3× South Asian amplification factor
        (South Asians develop CVD at lower BMI and younger age than white Europeans)
      - South Asian-specific impaired fasting glucose flag (≥5.6 mmol/L)
      - Lifestyle-informed clinical notes (calcium channel blockers over ACE
        inhibitors for hypertension in South Asians, etc.)

    Args:
        age: Patient age in years.
        sex: "male" or "female".
        weight_kg: Body weight in kilograms.
        height_cm: Height in centimetres.
        systolic_bp: Systolic blood pressure in mmHg.
        diastolic_bp: Diastolic blood pressure in mmHg.
        heart_rate: Resting heart rate in beats per minute.
        fasting_glucose_mmol: Fasting plasma glucose in mmol/L.
        hba1c: HbA1c in % (optional; estimated from glucose if omitted).
        has_diabetes: Whether the patient has a diabetes diagnosis.
        has_hypertension: Whether the patient has a hypertension diagnosis.
        is_smoker: Current smoker status.
        physical_activity: One of "sedentary", "moderate", or "active".

    Returns:
        A dict with:
          "bmi"                    — calculated BMI (kg/m²)
          "bmi_category"           — South Asian category (Normal/Overweight/Obese)
          "cvd_risk_10yr_percent"  — 10-year CVD risk % (Framingham + 1.3× SA factor)
          "risk_tier"              — "low" (<10%), "moderate" (10–20%), or "high" (>20%)
          "clinical_flags"         — list of South Asian-specific clinical alerts
          "clinical_notes"         — list of plain-language educational notes
    """
    profile = PatientProfile(
        age=age,
        sex=sex,
        weight_kg=weight_kg,
        height_cm=height_cm,
        systolic_bp=systolic_bp,
        diastolic_bp=diastolic_bp,
        heart_rate=heart_rate,
        fasting_glucose_mmol=fasting_glucose_mmol,
        hba1c=hba1c,
        has_diabetes=has_diabetes,
        has_hypertension=has_hypertension,
        is_smoker=is_smoker,
        physical_activity=physical_activity,
    )

    cvd_risk = profile.framingham_risk_10yr()
    bmi = profile.bmi
    bmi_category = profile.south_asian_bmi_category()

    if cvd_risk < 10:
        risk_tier = "low"
    elif cvd_risk <= 20:
        risk_tier = "moderate"
    else:
        risk_tier = "high"

    clinical_flags = []
    if bmi >= 23.0:
        clinical_flags.append(
            f"BMI {bmi:.1f} — above South Asian overweight threshold (≥23 kg/m²); "
            "standard Western cutoffs (≥25) would miss this."
        )
    if fasting_glucose_mmol >= 5.6 and not has_diabetes:
        clinical_flags.append(
            f"Fasting glucose {fasting_glucose_mmol} mmol/L — impaired fasting glycaemia "
            "(≥5.6 mmol/L). South Asians have 3–5× higher lifetime T2DM risk vs white Europeans."
        )
    if systolic_bp >= 130:
        clinical_flags.append(
            f"BP {systolic_bp}/{diastolic_bp} mmHg — at or above the 130/80 threshold. "
            "Calcium channel blockers are often preferred over ACE inhibitors in South Asians."
        )
    if is_smoker:
        clinical_flags.append(
            "Current smoker — smoking amplifies CVD risk substantially in South Asians, "
            "who already have elevated baseline risk."
        )

    from pulse.engine import _get_clinical_notes
    clinical_notes = _get_clinical_notes(profile, "cardiovascular_stress")

    return {
        "bmi": round(bmi, 1),
        "bmi_category": bmi_category,
        "cvd_risk_10yr_percent": cvd_risk,
        "risk_tier": risk_tier,
        "clinical_flags": clinical_flags,
        "clinical_notes": clinical_notes,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Resources — pre-synthesized wiki pages
# ─────────────────────────────────────────────────────────────────────────────

def _register_kb_resources() -> None:
    """Scan the knowledge base directory and register each page as a resource.

    Resources are registered at startup so MCP clients can list and browse them
    without doing a search. URIs follow the pattern:
        wiki://south-asian-health/{category}/{slug}
    e.g. wiki://south-asian-health/conditions/type_2_diabetes
    """
    kb_root = _kb_root()
    if not os.path.isdir(kb_root):
        return

    for category in ("conditions", "mechanisms", "risk_factors", "interventions"):
        cat_dir = os.path.join(kb_root, category)
        if not os.path.isdir(cat_dir):
            continue
        for fname in sorted(os.listdir(cat_dir)):
            if not fname.endswith(".md"):
                continue
            slug = fname[:-3]
            uri = f"wiki://south-asian-health/{category}/{slug}"
            page_path = os.path.join(cat_dir, fname)
            title = f"{_slug_to_title(category)} — {_slug_to_title(slug)}"

            # Capture path in closure
            def _make_reader(path: str):
                @mcp.resource(uri, name=title, mime_type="text/markdown",
                              description=f"Pre-synthesized South Asian health wiki page: {_slug_to_title(slug)}")
                def _reader() -> str:
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            return f.read()
                    except OSError:
                        return f"# Not found\n\nPage not available at {path}"
                return _reader

            _make_reader(page_path)


_register_kb_resources()


# ─────────────────────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
