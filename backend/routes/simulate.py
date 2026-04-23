"""
Simulate API route: accepts patient profile and scenario, returns Pulse Engine results.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from pulse.engine import PatientProfile, run_simulation

router = APIRouter()

AVAILABLE_SCENARIOS = [
    {
        "id": "cardiovascular_stress",
        "label": "How Your Heart Responds to Exercise",
        "description": "See how your heart rate and blood pressure change during a 2-minute workout.",
        "x_axis": "time_s",
        "x_label": "Time (seconds)",
        "metrics": ["heart_rate", "systolic_bp", "diastolic_bp", "cardiac_output_L_min"],
    },
    {
        "id": "metabolic_syndrome",
        "label": "My Health Over the Next 10 Years",
        "description": "See how weight, blood sugar, and heart disease risk may evolve if current habits continue.",
        "x_axis": "year",
        "x_label": "Year",
        "metrics": ["bmi", "fasting_glucose_mmol", "hba1c_percent", "cvd_risk_10yr_percent"],
    },
    {
        "id": "hypertension_treatment",
        "label": "Blood Pressure Treatment Progress",
        "description": "See how blood pressure medication could lower your readings over 12 weeks.",
        "x_axis": "week",
        "x_label": "Week",
        "metrics": ["systolic_bp", "diastolic_bp", "estimated_cvd_risk_reduction_percent"],
    },
    {
        "id": "diabetes_progression",
        "label": "Diabetes Risk Over Time",
        "description": "Track how blood sugar and diabetes risk may change over the next 5 years.",
        "x_axis": "year",
        "x_label": "Year",
        "metrics": ["fasting_glucose_mmol", "hba1c_percent", "t2dm_5yr_risk_percent"],
    },
]


class SimulationRequest(BaseModel):
    age: int = Field(..., ge=18, le=100, description="Age in years")
    sex: str = Field(..., description="'male' or 'female'")
    weight_kg: float = Field(..., gt=30, lt=300, description="Weight in kilograms")
    height_cm: float = Field(..., gt=100, lt=250, description="Height in centimeters")
    systolic_bp: int = Field(..., ge=70, le=250, description="Systolic BP in mmHg")
    diastolic_bp: int = Field(..., ge=40, le=150, description="Diastolic BP in mmHg")
    heart_rate: int = Field(..., ge=40, le=200, description="Resting heart rate (bpm)")
    fasting_glucose_mmol: float = Field(
        ..., gt=0, lt=30, description="Fasting blood glucose in mmol/L"
    )
    hba1c: float | None = Field(None, ge=3.0, le=15.0, description="HbA1c % (optional)")
    has_diabetes: bool = False
    has_hypertension: bool = False
    is_smoker: bool = False
    physical_activity: str = Field(
        "moderate",
        description="'sedentary', 'moderate', or 'active'",
    )
    scenario: str = Field(..., description="Scenario ID to simulate")


@router.get("/scenarios")
async def list_scenarios():
    return {"scenarios": AVAILABLE_SCENARIOS}


@router.post("/simulate")
async def simulate(request: SimulationRequest):
    profile = PatientProfile(
        age=request.age,
        sex=request.sex,
        weight_kg=request.weight_kg,
        height_cm=request.height_cm,
        systolic_bp=request.systolic_bp,
        diastolic_bp=request.diastolic_bp,
        heart_rate=request.heart_rate,
        fasting_glucose_mmol=request.fasting_glucose_mmol,
        hba1c=request.hba1c,
        has_diabetes=request.has_diabetes,
        has_hypertension=request.has_hypertension,
        is_smoker=request.is_smoker,
        physical_activity=request.physical_activity,
    )

    result = run_simulation(profile, request.scenario)

    scenario_meta = next(
        (s for s in AVAILABLE_SCENARIOS if s["id"] == request.scenario), None
    )
    if scenario_meta:
        result["x_axis"] = scenario_meta["x_axis"]
        result["x_label"] = scenario_meta["x_label"]
        result["metrics"] = scenario_meta["metrics"]

    return result
