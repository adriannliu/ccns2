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

/** Normalized [x, y] point on a top-down floor plan (0 = left/top, 1 = right/bottom). */
export type Point2D = [number, number];

export type LandmarkType =
  | "exit"
  | "door"
  | "window"
  | "hazard"
  | "safe_zone"
  | "furniture";

export interface RoomLandmark {
  label: string;
  type: LandmarkType;
  position: Point2D;
  detail?: string;
}

/**
 * Synthesized top-down room model stitched from a 360° video scan.
 * Coordinates are normalized to the floor-plan view box (0–1).
 */
export interface RoomModel {
  /** Wall segments as line pairs [[x1,y1],[x2,y2]]. */
  walls: Point2D[][];
  landmarks: RoomLandmark[];
  /** Dotted exit route from scan origin to the primary exit. */
  exit_path: Point2D[];
  /** Where the person stood when they started the pan. */
  scan_origin: Point2D;
}

export type ScanMode = "photo" | "video360";

/** Pre-computed emergency plans keyed by scenario. */
export type ScenarioPlans = Record<Scenario, AnalysisResult>;

/** A labeled room saved during setup for emergency lookup. */
export interface SavedRoom {
  id: string;
  label: string;
  image: string;
  panorama?: string;
  scanMode: ScanMode;
  plans: ScenarioPlans;
  createdAt: number;
}

export interface SetupRoomRequest extends Omit<AnalyzeRequest, "scenario"> {
  label: string;
  /** Display image when S3 presign is unavailable. */
  previewImage?: string;
  panorama?: string;
}

export interface AnalysisResult {
  egress_points: EgressPoint[];
  hazards: Hazard[];
  safe_zones: SafeZone[];
  actionable_instructions: string[];
  /** Present when the scan was built from a 360° video. */
  room_model?: RoomModel;
}

/**
 * Payload sent from the client to /api/analyze.
 *
 * Preferred path: `imageKey` referencing an object already uploaded to S3.
 * Fallback path (no S3 configured): inline base64 `image`.
 */
export interface AnalyzeRequest {
  scenario: Scenario;
  /** How the scan was captured. */
  scanMode?: ScanMode;
  /** S3 object key of an already-uploaded scan image. */
  imageKey?: string;
  /** Browser content type of the uploaded image (e.g. "image/jpeg"). */
  imageContentType?: string;
  /** Inline base64 data URL / raw base64 (fallback when S3 is unavailable). */
  image?: string;
  /** Sampled JPEG frames from a 360° video (inline base64 data URLs). */
  frames?: string[];
  /** S3 keys for frames already uploaded (preferred for large scans). */
  frameKeys?: string[];
}

/** Response returned by /api/analyze. */
export interface AnalyzeResponse extends AnalysisResult {
  scenario: Scenario;
  scanMode?: ScanMode;
  /** Displayable image URL (presigned S3 GET) when the scan came from S3. */
  imageUrl?: string;
  /** Stitched panorama data URL or presigned URL for 360° scans. */
  panoramaUrl?: string;
  /**
   * Id of the vision model that produced this result (e.g. the primary
   * Anthropic model, the non-Anthropic fallback, or "mock" offline).
   */
  model?: string;
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
