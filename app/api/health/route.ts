import { NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  DetectLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { isS3Configured, s3RoundTrip } from "@/lib/s3";
import { isYoloConfigured } from "@/lib/detection/yoloRoboflow";

export const runtime = "nodejs";

const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

interface Check {
  ok: boolean;
  detail?: string;
}

async function checkBedrock(): Promise<Check> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { ok: false, detail: "AWS credentials are not set." };
  }
  try {
    const client = new BedrockRuntimeClient({ region: AWS_REGION });
    const res = await client.send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_ID,
        messages: [{ role: "user", content: [{ text: "reply with ok" }] }],
        inferenceConfig: { maxTokens: 5, temperature: 0 },
      }),
    );
    const text = res.output?.message?.content?.find((c) => "text" in c)?.text;
    return { ok: Boolean(text), detail: text?.trim() };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "error" };
  }
}

async function checkRekognition(): Promise<Check> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { ok: false, detail: "AWS credentials are not set." };
  }
  try {
    const client = new RekognitionClient({ region: AWS_REGION });
    await client.send(
      new DetectLabelsCommand({
        Image: { Bytes: Buffer.from("healthcheck") },
        MaxLabels: 1,
        MinConfidence: 99,
      }),
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    // InvalidImageFormatException means the API is reachable.
    if (msg.includes("InvalidImageFormatException") || msg.includes("invalid image")) {
      return { ok: true, detail: "API reachable" };
    }
    return { ok: false, detail: msg };
  }
}

/**
 * Verifies the AWS wiring end to end: env presence, a live S3 read/write
 * round-trip, and a tiny Bedrock Converse ping. Useful to confirm setup
 * without running a full scan.
 */
export async function GET() {
  const env = {
    AWS_REGION: Boolean(process.env.AWS_REGION),
    AWS_ACCESS_KEY_ID: Boolean(process.env.AWS_ACCESS_KEY_ID),
    AWS_SECRET_ACCESS_KEY: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
    BEDROCK_MODEL_ID: Boolean(process.env.BEDROCK_MODEL_ID),
    S3_BUCKET: isS3Configured(),
    AWS_ACCOUNT_ID: Boolean(process.env.AWS_ACCOUNT_ID),
  };

  const [s3, bedrock, rekognition] = await Promise.all([
    s3RoundTrip(),
    checkBedrock(),
    checkRekognition(),
  ]);

  const checks = {
    env,
    s3: { ok: s3.ok, detail: s3.error },
    bedrock,
    rekognition,
    yolo: { ok: isYoloConfigured(), detail: isYoloConfigured() ? "configured" : "ROBOFLOW_API_KEY not set" },
  };
  const ok = s3.ok && bedrock.ok && rekognition.ok;

  return NextResponse.json({ ok, model: BEDROCK_MODEL_ID, checks });
}
