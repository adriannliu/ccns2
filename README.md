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
  api/upload/route.ts   POST: issues a presigned S3 PUT URL
lib/
  types.ts              Shared domain types
  scenarios.ts          Scenario config (labels, icons, accent colors)
  s3.ts                 Presigned upload/download URLs + Bedrock s3Location
  butterbase.ts         Generic Butterbase REST client (fetch-based)
  scanStore.ts          sessionStorage hand-off between scan -> results
```

### Image pipeline (S3)

To avoid Bedrock's ~5 MB inline-image cap (and Vercel's serverless body limit),
the photo is uploaded **directly to S3** from the browser:

1. `/scan` asks `POST /api/upload` for a presigned PUT URL.
2. The browser `PUT`s the photo bytes straight to S3.
3. `/scan` calls `POST /api/analyze` with the S3 `imageKey` (not the bytes).
4. `/api/analyze` passes the object to Bedrock via Converse `s3Location`, then
   returns a presigned GET URL the results page uses to render the image.

If `S3_BUCKET` is unset, the client transparently falls back to inline base64.

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

The VLM is **Anthropic Claude Sonnet 4.5 on AWS Bedrock**, called via the
**Converse API** (`@aws-sdk/client-bedrock-runtime`). The image is referenced
from S3 (`s3Location`), or sent inline as bytes when S3 is unset; inference runs
at `temperature 0.1` / `maxTokens 1024` (per `AGENTS.md`). Claude has no
`json_object` flag, so the route enforces JSON via the system prompt and a
tolerant `extractJson()` parser.

## Configuration (`.env`)

```bash
# AWS Bedrock (Claude Sonnet 4.5) — uses the AWS SigV4 credential chain
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
# AWS_SESSION_TOKEN=""   # only for temporary/STS creds
BEDROCK_MODEL_ID="us.anthropic.claude-sonnet-4-5-20250929-v1:0"

# S3 (direct image upload) — same region as AWS_REGION
S3_BUCKET="safespace-scans"
S3_PREFIX="scans"
AWS_ACCOUNT_ID="073158194660"

# Butterbase (REST)
BUTTERBASE_API_URL="https://api.butterbase.dev/v1"
BUTTERBASE_API_KEY="bb-..."
BUTTERBASE_TABLE="scans"
```

- **System prompt:** drop your exact prompt into the `SYSTEM_PROMPT` constant in
  `app/api/analyze/route.ts` (currently a placeholder).
- **Offline mode:** without `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, the
  route returns a deterministic mock so the flow is fully demoable.
- **Bedrock access:** enable model access for Claude Sonnet 4.5 in your AWS
  account/region. Newer Claude models are on-demand only via a **cross-region
  inference profile**, so use the `us.`-prefixed id. Ensure the IAM principal has
  `bedrock:InvokeModel` (skip for root).
- **Butterbase:** adjust endpoints/shapes in `lib/butterbase.ts` to match the
  real API once you have docs.

### S3 setup

1. **Create the bucket** (same region as the model):

```bash
aws s3 mb s3://safespace-scans --region us-east-1
```

2. **Add CORS** so the browser can presigned-`PUT` directly:

```bash
aws s3api put-bucket-cors --bucket safespace-scans --cors-configuration '{
  "CORSRules": [{
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://YOUR-DOMAIN.vercel.app"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}'
```

3. **IAM** — the app identity needs S3 access in addition to Bedrock:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject"],
  "Resource": "arn:aws:s3:::safespace-scans/*"
}
```

> Bedrock reads the object using the *caller's* credentials, so the same
> `s3:GetObject` permission covers both the presigned download and the
> `s3Location` model read.

## Deploy

Designed for **Vercel** — push the repo and import. Set the env vars above in the
Vercel dashboard (the AWS keys must belong to an IAM user/role with Bedrock
invoke permissions).
