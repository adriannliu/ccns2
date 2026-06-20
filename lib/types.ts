/**
 * Shared domain types for SafeSpace.
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

export type EgressStatus = "clear" | "blocked" | "compromised" | "unknown";

export interface SpatialRegion {
  /** Human-readable label, e.g. "Window", "Main Door", "Under desk". */
  type: string;
  /** Normalized bounding box [ymin, xmin, ymax, xmax]. */
  coordinates: BBox;
  /** Optional status, primarily used for egress points. */
  status?: EgressStatus;
}

export interface AnalysisResult {
  egress_points: SpatialRegion[];
  hazards: SpatialRegion[];
  safe_zones: SpatialRegion[];
  actionable_instructions: string[];
}

/** Payload sent from the client to /api/analyze. */
export interface AnalyzeRequest {
  /** Base64 data URL or raw base64 string of the captured image. */
  image: string;
  scenario: Scenario;
}

/** Response returned by /api/analyze. */
export interface AnalyzeResponse extends AnalysisResult {
  scenario: Scenario;
  /** Result of persisting the scan to Butterbase. */
  saved: {
    success: boolean;
    id?: string;
    error?: string;
  };
}

/** A flattened region used by the overlay renderer. */
export interface OverlayRegion extends SpatialRegion {
  kind: RegionKind;
}
