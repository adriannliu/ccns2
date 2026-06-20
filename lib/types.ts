/**
 * Shared domain types for SafeSpace.
 *
 * Schema mirrors AGENTS.md (the Spatial Emergency VLM contract).
 *
 * The Vision-Language Model returns normalized bounding boxes in the form
 * [ymin, xmin, ymax, xmax] where each value is in the range 0.0 -> 1.0,
 * with 0.0 = top/left and 1.0 = bottom/right of the image.
 */

export type Scenario = "FIRE" | "EARTHQUAKE" | "CODE_RED";

/** [ymin, xmin, ymax, xmax], each normalized 0.0 - 1.0 */
export type BBox = [number, number, number, number];

/** The kind of region. Drives the overlay color in ImageOverlay. */
export type RegionKind = "egress" | "hazard" | "safe_zone";

export type EgressType = "Primary Door" | "Secondary Door" | "Window";
export type AccessibilityStatus = "Clear" | "Partially Blocked" | "Blocked";

export type SafeZoneType = "Hiding Spot" | "Cover" | "Drop & Cover";
export type EffectivenessRating = "High" | "Medium" | "Low";

export interface EgressPoint {
  type: EgressType;
  coordinates: BBox;
  accessibility_status: AccessibilityStatus;
}

export interface Hazard {
  description: string;
  reason: string;
  coordinates: BBox;
}

export interface SafeZone {
  type: SafeZoneType;
  description: string;
  effectiveness_rating: EffectivenessRating;
  coordinates: BBox;
}

export interface AnalysisResult {
  egress_points: EgressPoint[];
  hazards: Hazard[];
  safe_zones: SafeZone[];
  actionable_instructions: string[];
}

/**
 * Payload sent from the client to /api/analyze.
 *
 * Preferred path: `imageKey` referencing an object already uploaded to S3.
 * Fallback path (no S3 configured): inline base64 `image`.
 */
export interface AnalyzeRequest {
  scenario: Scenario;
  /** S3 object key of an already-uploaded scan image. */
  imageKey?: string;
  /** Browser content type of the uploaded image (e.g. "image/jpeg"). */
  imageContentType?: string;
  /** Inline base64 data URL / raw base64 (fallback when S3 is unavailable). */
  image?: string;
}

/** Response returned by /api/analyze. */
export interface AnalyzeResponse extends AnalysisResult {
  scenario: Scenario;
  /** Displayable image URL (presigned S3 GET) when the scan came from S3. */
  imageUrl?: string;
  /** Result of persisting the scan to Butterbase. */
  saved: {
    success: boolean;
    id?: string;
    error?: string;
  };
}

/**
 * A normalized region used by the overlay renderer. Each source region
 * (egress / hazard / safe zone) is flattened into this common shape so the
 * overlay can render a colored box + label chip uniformly.
 */
export interface OverlayRegion {
  kind: RegionKind;
  coordinates: BBox;
  /** Primary label shown in the chip (type or description). */
  label: string;
  /** Secondary detail (status / rating). */
  detail?: string;
}
