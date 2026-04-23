# Clinical Guidelines

Drop PDF files of authoritative clinical guidelines into this folder. They will be ingested with `evidence_level=guideline` and boosted during retrieval so the chatbot treats them as primary, high-confidence sources.

## Recommended sources for South Asian health

Download PDFs of these documents and place them here:

### Obesity / BMI
- **WHO Expert Consultation on BMI in Asian populations** (2004) — defines the lower BMI cutoffs (overweight ≥23, obese ≥27.5). Search: "WHO appropriate body-mass index for Asian populations 2004 pdf"

### Diabetes
- **ADA Standards of Medical Care in Diabetes** (latest year) — includes specific Asian American screening BMI threshold of 23. diabetesjournals.org/care
- **IDF Clinical Practice Recommendations for managing T2D in primary care**

### Cardiovascular
- **AHA/ACC Guidelines on Primary Prevention of Cardiovascular Disease** — has sections on South Asian ethnicity as a risk-enhancing factor
- **ESC Guidelines on cardiovascular disease prevention**

### Metabolic syndrome
- **IDF consensus worldwide definition of the metabolic syndrome** — with Asian-specific waist circumference cutoffs

### General
- **NHS guidelines on South Asian cardiovascular health**
- Any national guidelines from **ICMR (India)**, **Pakistan Society of Cardiology**, etc.

## How re-ingestion works

Run `POST /api/ingest/run` and the guidelines folder will be scanned automatically. Existing content is upserted, so re-running is safe.
