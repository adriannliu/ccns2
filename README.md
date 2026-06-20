# SafeSpace

> Mobile-first **Spatial Intelligence** for emergencies. Set up labeled room scans during calm times, then instantly get escape routes, safe zones, hiding spots, and step-by-step action plans for **Fire**, **Earthquake**, or **Code Red**.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + Lucide.

## Quick start

```bash
npm install
cp .env.example .env   # optional — app runs with mock AI if left unset
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone (or use device toolbar / responsive mode).

> Without AWS credentials the setup API returns deterministic **mock** analysis so the full flow is demoable offline. Add credentials to call a real vision model on Bedrock.

## Core flow

| Route | Purpose |
| ----- | ------- |
| `/` | Landing — **Set up a room** (calm time) or **Emergency** (crisis lookup). |
| `/scan` | Name a room, capture photo(s) or 360° video, pre-compute plans for all scenarios. |
| `/scan?rescan=<id>` | Re-scan an existing room — keeps the same id, replaces plans. |
| `/rooms` | Saved room library — view, rename, re-scan, or delete (with confirmation). |
| `/rooms/[id]` | Room detail — floor plan, labeled frames, and room management actions. |
| `/emergency` | Pick room + scenario → instant precomputed plan (no live AI wait). |

Legacy `/results` and `POST /api/analyze` remain for single-scan experiments but are not used by the main app flow.

## Room management

From **Saved rooms** (list or detail):

- **Rename** — inline edit with duplicate-name validation.
- **Re-scan** — opens `/scan?rescan=<id>`, runs full setup, updates plans in place.
- **Delete** — confirmation dialog before removal (local + best-effort remote).

## Architecture

```
app/
  page.tsx                  Home
  scan/page.tsx             Room setup (photo / 360° video)
  rooms/page.tsx            Saved room library
  rooms/[id]/page.tsx       Room detail + labeled frames
  emergency/page.tsx        Crisis lookup (room → scenario → plan)
  api/rooms/setup/route.ts  POST: map room + all scenario plans
  api/rooms/[id]/route.ts   PATCH rename, DELETE room
  api/rooms/route.ts        GET list (refreshes S3 frame URLs)
  api/upload/route.ts       Presigned S3 PUT for captures
components/
  ImageOverlay.tsx          Normalized bbox overlay + exit path
  RoomModelView.tsx         Top-down floor plan from 360° scans
  RoomManageActions.tsx     Rename / re-scan / delete controls
  ConfirmDialog.tsx         Delete confirmation modal
lib/
  types.ts                  Domain types
  vlmPrompts.ts             System prompts (see AGENTS.md)
  spatialAnalysis.ts        Bedrock invocation, fallback, normalization
  videoSetup.ts             360° floor plan + per-frame photo labels
  videoFrames.ts            Client-side video frame extraction
  roomLibrary.ts            localStorage + API sync for saved rooms
  roomMapView.ts            Neutral library map (merged scenario labels)
  analyzeInput.ts           Capture payload → model input
  s3.ts                     Presigned upload/download URLs
  butterbase.ts             Optional remote persistence
```

See [AGENTS.md](./AGENTS.md) for the Spatial Emergency VLM contract (tool schema, scenarios, coordinate systems).

### Image pipeline (S3)

To avoid Bedrock's ~5 MB inline-image cap (and serverless body limits), captures upload **directly to S3** from the browser when configured:

1. `/scan` asks `POST /api/upload` for a presigned PUT URL.
2. The browser PUTs bytes straight to S3.
3. `/api/rooms/setup` receives S3 keys (or inline base64 fallback) and runs analysis.
4. Presigned GET URLs are returned for display; `frameKeys` are stored for refresh on list.

If `S3_BUCKET` is unset, the client falls back to inline base64.

### The overlay math (`components/ImageOverlay.tsx`)

The model returns **normalized** boxes `[ymin, xmin, ymax, xmax]` (0.0 = top/left, 1.0 = bottom/right). Colors: exits (blue), safe zones (green), hazards (red).

## AI model

Vision analysis uses **AWS Bedrock Converse** with forced tool-use structured output (`lib/bedrockTool.ts`). Primary model: **Claude Sonnet 4.5**; fallback: **Amazon Nova Pro**. Prompts live in `lib/vlmPrompts.ts`; normalization in `lib/spatialAnalysis.ts`.

Photo setup runs three scenario passes in parallel. Video setup adds a 360° pass for the floor plan plus a photo-style pass on each sampled frame.

## Configuration (`.env`)

```bash
# AWS Bedrock — uses the AWS SigV4 credential chain
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
BEDROCK_MODEL_ID="us.anthropic.claude-sonnet-4-5-20250929-v1:0"
BEDROCK_FALLBACK_MODEL_ID="us.amazon.nova-pro-v1:0"

# S3 (direct image upload)
S3_BUCKET="safespace-scans"
S3_PREFIX="scans"
AWS_ACCOUNT_ID="073158194660"

# Butterbase (optional remote sync)
BUTTERBASE_API_URL="https://api.butterbase.dev/v1"
BUTTERBASE_API_KEY="bb-..."
BUTTERBASE_ROOMS_TABLE="rooms"
BUTTERBASE_TABLE="scans"
```

- **Offline mode:** without AWS credentials, setup returns deterministic mocks.
- **Bedrock access:** enable model access in your AWS account/region; use `us.`-prefixed inference profile ids for Claude 4.x.
- **Butterbase:** saved rooms use `BUTTERBASE_ROOMS_TABLE` (default `rooms`); legacy analyze scans use `BUTTERBASE_TABLE`.

### S3 setup

1. Create the bucket (same region as Bedrock, e.g. `us-west-2`):

```bash
aws s3 mb s3://safespace-scans-usw2-073158194660 --region us-west-2
```

2. Add CORS for browser presigned PUT (local + production):

```bash
aws s3api put-bucket-cors --bucket safespace-scans-usw2-073158194660 --region us-west-2 --cors-configuration '{
  "CORSRules": [{
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://ccns2.vercel.app"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}'
```

3. IAM — the app identity needs S3 + Bedrock:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject"],
  "Resource": "arn:aws:s3:::safespace-scans/*"
}
```

## Deploy

Designed for **Vercel** — push the repo and import. Set env vars in the dashboard. Video re-scans can run many Bedrock calls; consider raising `maxDuration` on `/api/rooms/setup` if you hit timeouts.
