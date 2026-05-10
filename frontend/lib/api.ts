const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Citation {
  ref: number;
  title: string;
  authors: string;
  year: string;
  doi: string;
  source: string;
  evidence_level?: string;
  evidence_label?: string;
}

export interface RetrievalInfo {
  expanded_queries: string[];
  top_score: number;
  low_confidence: boolean;
  num_candidates: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  retrieval_info?: RetrievalInfo;
}

export type StreamChatOptions = {
  /** Risk Assessment or other self-reported summary; sent to the server for RAG + prompt personalization. */
  userContext?: string;
};

export async function* streamChat(
  question: string,
  history: ChatMessage[],
  options: StreamChatOptions = {}
): AsyncGenerator<
  | { type: "token"; content: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "retrieval_info"; info: RetrievalInfo }
  | { type: "follow_ups"; questions: string[] }
  | { type: "error"; message: string }
> {
  const { userContext } = options;
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      ...(userContext && userContext.trim() ? { user_context: userContext } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    yield { type: "error", message: text };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch {
          // skip malformed
        }
      }
    }
  }
}

export interface SimulationRequest {
  age: number;
  sex: string;
  weight_kg: number;
  height_cm: number;
  systolic_bp: number;
  diastolic_bp: number;
  heart_rate: number;
  fasting_glucose_mmol: number;
  hba1c?: number | null;
  has_diabetes: boolean;
  has_hypertension: boolean;
  is_smoker: boolean;
  physical_activity: string;
  scenario: string;
}

export interface SimulationResult {
  scenario: string;
  scenario_label: string;
  engine: string;
  x_axis: string;
  x_label: string;
  metrics: string[];
  patient_summary: {
    age: number;
    sex: string;
    bmi: number;
    bmi_category_south_asian: string;
    cvd_risk_10yr_percent: number;
  };
  data: Record<string, number>[];
  clinical_notes: string[];
}

export interface ScenarioMeta {
  id: string;
  label: string;
  description: string;
  x_axis: string;
  x_label: string;
  metrics: string[];
}

export async function fetchScenarios(): Promise<ScenarioMeta[]> {
  const res = await fetch(`${API_BASE}/api/scenarios`);
  const json = await res.json();
  return json.scenarios;
}

export async function runSimulation(
  request: SimulationRequest
): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}
