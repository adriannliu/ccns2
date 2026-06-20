# 🤖 Agents Architecture (AGENTS.md)

This document outlines the AI agents utilized in this project, their core responsibilities, expected inputs/outputs, and operational constraints.

## 1. Primary Agent: Spatial Emergency VLM

The core intelligence of the application. This Vision-Language Model (VLM) is responsible for interpreting physical spaces and applying situational emergency logic to identify safe zones, hazards, and egress routes.

*   **Role:** Spatial Analyst & Emergency Routing
*   **Model (in use):** Anthropic **Claude Sonnet 4.5** on **AWS Bedrock**, invoked via the Converse API using the cross-region inference profile (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`).
*   **Alternatives:** any high visual-spatial-reasoning VLM (other Bedrock Claude 4.x models, Gemini, GPT-4o-class).
*   **Mode:** Zero-shot inference with strict JSON schema enforcement.

### 1.1 Parameters
| Parameter | Value | Rationale |
|---|---|---|
| **Temperature** | `0.1` | Emergency routing requires high determinism and precision; creativity is dangerous here. |
| **Response Format** | JSON-only (prompt-enforced) | Bedrock/Claude has no `json_object` flag; the system prompt mandates raw JSON and the route parses it tolerantly via `extractJson()`. Required for reliable frontend overlay mapping. |
| **Max Tokens** | `1024` | Sufficient for JSON payload without risking run-on outputs. |

### 1.2 I/O Specification

**Input Pipeline:**
1. `image`: Base64 encoded string captured from the mobile device's rear-facing camera.
2. `scenario`: A strict string enum `["FIRE", "EARTHQUAKE", "CODE_RED"]`.

**Output Schema:**
The agent must return an object containing normalized bounding box coordinates `[ymin, xmin, ymax, xmax]`, where `0.0` represents the top/left edge of the image and `1.0` represents the bottom/right edge.

```typescript
interface AgentOutput {
  scenario: string;
  egress_points: Array<{
    type: "Primary Door" | "Secondary Door" | "Window";
    coordinates: [number, number, number, number];
    accessibility_status: "Clear" | "Partially Blocked" | "Blocked";
  }>;
  hazards: Array<{
    description: string;
    reason: string;
    coordinates: [number, number, number, number];
  }>;
  safe_zones: Array<{
    type: "Hiding Spot" | "Cover" | "Drop & Cover";
    description: string;
    effectiveness_rating: "High" | "Medium" | "Low";
    coordinates: [number, number, number, number];
  }>;
  actionable_instructions: string[];
}