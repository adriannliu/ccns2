# 🤖 Agents Architecture (AGENTS.md)

This document outlines the AI agents utilized in this project, their core responsibilities, expected inputs/outputs, and operational constraints.

## 1. Primary Agent: Spatial Emergency VLM

The core intelligence of the application. This Vision-Language Model (VLM) is responsible for interpreting physical spaces and applying situational emergency logic to identify safe zones, hazards, and egress routes.

* **Role:** Spatial Analyst & Emergency Routing
* **Mode:** Zero-shot inference with **forced tool-use** structured output (see §1.3).

### 1.1 Models & Fallback Chain

Models are tried in order; the first that returns successfully wins. The id that produced a result is surfaced to the client as `model` on the response.

| Priority | Model | Bedrock ID | Notes |
|---|---|---|---|
| 1 (primary) | Anthropic **Claude Sonnet 4.5** | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Best spatial reasoning. Requires the Anthropic **use-case form** to be approved per AWS account before it can be invoked. |
| 2 (fallback) | Amazon **Nova Pro** | `us.amazon.nova-pro-v1:0` | Vision-capable, **no use-case approval required**, same Converse + tool-use API. This is the worst-case path the app is designed to run on indefinitely. |
| — (offline) | Deterministic **mock** | — | Used when no AWS credentials are present, so the full flow stays demoable offline. |

Both ids are overridable via `BEDROCK_MODEL_ID` and `BEDROCK_FALLBACK_MODEL_ID`. Set the fallback to `""` to disable it. **Alternatives:** any high visual-spatial-reasoning VLM that supports Bedrock Converse tool-use (other Bedrock Claude 4.x / Nova models).

> ⚠️ **Nova Pro caveat:** when prompted for free-form JSON, Nova tends to return prose strings (e.g. `actionable_instructions` as one paragraph) and string lists (e.g. `"Door at (5,5)"`) instead of the typed objects we need. We therefore **do not** rely on prompt-only JSON — we force a tool schema (§1.3) and additionally normalize defensively (§1.4).

### 1.2 Parameters

| Parameter | Value | Rationale |
|---|---|---|
| **Temperature** | `0.1` | Emergency routing requires high determinism and precision; creativity is dangerous here. |
| **Response Format** | **Forced tool-use** (`toolChoice: { tool: { name: "emit_safety_plan" } }`) | Both Claude 3+ and Nova must return arguments conforming to the tool's `inputSchema`. Far more reliable than prompt-enforced raw JSON, especially for Nova. A text-JSON parse (`extractJson`) remains as a secondary fallback. |
| **Max Tokens** | `1024` (photo) / `4096` (video 360°) | Video scans must also emit a `room_model` floor plan, which needs more room. |

### 1.3 Structured Output (Tool Use)

Defined once in `lib/bedrockTool.ts` and shared by every analysis path. We expose a single tool, `emit_safety_plan`, whose `inputSchema` **is** our output schema, and force the model to call it. The structured arguments are read from the `toolUse` content block; if a model ever replies with text instead, we fall back to parsing JSON out of the text.

### 1.4 Defensive Normalization

Even with tool-use, model output is treated as untrusted and passed through `normalizeResult` (`lib/spatialAnalysis.ts`) before reaching the UI:

* `actionable_instructions` → always coerced to `string[]` (a prose string is split into steps).
* `egress_points` / `hazards` / `safe_zones` → only objects with a **valid bounding box** are kept; malformed string entries are dropped.
* **Coordinates** are sanitized: `0–100` percentage values are rescaled to `0–1`, values are clamped to `[0, 1]`, and inverted min/max pairs are swapped.
* `room_model` → coerced via `normalizeRoomModel` (`lib/roomModel.ts`), tolerating assorted point/wall encodings.

This guarantees the frontend overlay and the saved room plans always receive the full, well-typed shape, regardless of which model answered.

### 1.5 Capture Modes & I/O Specification

**Input Pipeline:**
1. Imagery — one of:
   * `image` / `imageKey` — a single photo (inline base64 data URL, or an S3 key for a pre-uploaded object).
   * `frames` / `frameKeys` — multiple photos, **or** sampled JPEG frames from a 360° room-scan video (`scanMode: "video360"`).
2. `scenario`: A strict string enum `["FIRE", "EARTHQUAKE", "CODE_RED"]`.

Large bytes are uploaded directly to S3 (presigned PUT) and referenced by key so they bypass serverless body limits and Bedrock's inline-image cap; inline base64 is the no-S3 fallback.

**Output Schema:**
The agent returns normalized bounding boxes `[ymin, xmin, ymax, xmax]`, where `0.0` is the top/left edge and `1.0` is the bottom/right edge of the (first) image. For 360° video scans it additionally returns a top-down `room_model` whose `[x, y]` points are normalized `0.0–1.0` on the floor-plan view (`(0,0)` = top-left).

```typescript
interface AgentOutput {
  egress_points: Array<{
    type: "Primary Door" | "Secondary Door" | "Window";
    coordinates: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
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

  // Present only for 360° video scans (scanMode: "video360").
  room_model?: {
    walls: Array<[[number, number], [number, number]]>; // [[x1,y1],[x2,y2]]
    landmarks: Array<{
      label: string;
      type: "exit" | "door" | "window" | "hazard" | "safe_zone" | "furniture";
      position: [number, number]; // [x, y]
      detail?: string;
    }>;
    exit_path: Array<[number, number]>; // 3+ waypoints, scan_origin → exit
    scan_origin: [number, number];
  };
}
```

### 1.6 Scenario Logic

* **FIRE:** prefer low, smoke-free egress; flag flammable/electrical items, blocked/hot doorways, and glass.
* **EARTHQUAKE:** prioritize sturdy cover; hazards are anything that can fall, shatter, or topple. Do **not** recommend exiting during shaking.
* **CODE_RED:** prioritize concealment out of sightline from doors/windows and lockable barriers; de-prioritize doors/windows as exits unless clearly safe.

## 2. Pipeline Map (where things live)

| Concern | Module |
|---|---|
| Tool schema + forced tool-use config + tool-output extractor | `lib/bedrockTool.ts` |
| Model invocation, fallback chain, prompts, normalization, mocks | `lib/spatialAnalysis.ts` |
| Capture payload → model input + display-image URL | `lib/analyzeInput.ts` |
| `room_model` coercion | `lib/roomModel.ts` |
| Single-scenario endpoint | `app/api/analyze/route.ts` (thin wrapper over the libs) |
| Room setup (pre-computes all 3 scenarios) | `app/api/rooms/setup/route.ts` |
| Live AWS wiring check (S3 round-trip + Bedrock ping) | `app/api/health/route.ts` |
