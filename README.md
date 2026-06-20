# SafeSpace 🛰️

> Mobile-first **Spatial Intelligence** for emergencies. Scan any indoor space and instantly get escape routes, safe zones, hiding spots, and a step-by-step action plan for **Fire**, **Earthquake**, or **Code Red**.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + Lucide.

## Quick start

```bash
npm install
cp .env.example .env   # optional — app runs with mock AI if left unset
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone (or use device toolbar / responsive mode).

> Without API keys the `/api/analyze` route returns a deterministic **mock** analysis so the full flow is demoable offline. Add credentials to call a real model.

## Core flow

| Route      | Purpose                                                            |
| ---------- | ----------------------------------------------------------------- |
| `/`        | High-contrast landing page with a **Scan Room** CTA.              |
| `/scan`    | Pick a scenario → capture a photo (mobile camera) → run analysis. |
| `/results` | Image + bounding-box overlay + actionable instructions.           |

## Architecture

```
app/
  layout.tsx            Root layout (dark theme, viewport)
  globals.css           Tailwind + grid backdrop
  page.tsx              Home / landing
  scan/page.tsx         Scenario selector + camera capture + loading
  results/page.tsx      Overlay + action plan
  api/analyze/route.ts  POST: base64 image + scenario -> AnalysisResult
components/
  ImageOverlay.tsx      Renders normalized [ymin,xmin,ymax,xmax] boxes
lib/
  types.ts              Shared domain types
  scenarios.ts          Scenario config (labels, icons, accent colors)
  butterbase.ts         Generic Butterbase REST client (fetch-based)
  scanStore.ts          sessionStorage hand-off between scan -> results
```

### The overlay math (`components/ImageOverlay.tsx`)

The model returns **normalized** boxes `[ymin, xmin, ymax, xmax]` (0.0 = top/left,
1.0 = bottom/right). Each box becomes:

```
top:    ymin * 100%
left:   xmin * 100%
width:  (xmax - xmin) * 100%
height: (ymax - ymin) * 100%
```

To keep boxes perfectly aligned, the overlay wrapper is sized to the **rendered**
image (`inline-block` + `max-w/max-h` auto sizing) so `object-contain`
letterboxing can never shift the coordinate space. Colors: 🔵 exits, 🟢 safe
zones, 🔴 hazards.

## AI model

The VLM is **Anthropic Claude 3.5 Sonnet on AWS Bedrock**, called via the
**Converse API** (`@aws-sdk/client-bedrock-runtime`). The image is sent as bytes
in a multimodal content block; inference runs at `temperature 0.1` / `maxTokens
1024` (per `AGENTS.md`). Claude has no `json_object` flag, so the route enforces
JSON via the system prompt and a tolerant `extractJson()` parser.

## Configuration (`.env`)

```bash
# AWS Bedrock (Claude 3.5 Sonnet) — uses the AWS SigV4 credential chain
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
# AWS_SESSION_TOKEN=""   # only for temporary/STS creds
BEDROCK_MODEL_ID="anthropic.claude-3-5-sonnet-20240620-v1:0"

# Butterbase (REST)
BUTTERBASE_API_URL="https://api.butterbase.dev/v1"
BUTTERBASE_API_KEY="bb-..."
BUTTERBASE_TABLE="scans"
```

- **System prompt:** drop your exact prompt into the `SYSTEM_PROMPT` constant in
  `app/api/analyze/route.ts` (currently a placeholder).
- **Offline mode:** without `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, the
  route returns a deterministic mock so the flow is fully demoable.
- **Bedrock access:** enable model access for Claude 3.5 Sonnet in your AWS
  account/region, and ensure the IAM principal has `bedrock:InvokeModel`.
- **Butterbase:** adjust endpoints/shapes in `lib/butterbase.ts` to match the
  real API once you have docs.

## Deploy

Designed for **Vercel** — push the repo and import. Set the env vars above in the
Vercel dashboard (the AWS keys must belong to an IAM user/role with Bedrock
invoke permissions).
