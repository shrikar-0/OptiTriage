export interface Coordinate {
  x: number;
  y: number;
  z?: number;
}

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface SkinRoi {
  /** Approximate bounding box for the forehead region */
  forehead: BoundingBox;
  /** Approximate bounding box for the left cheek region */
  leftCheek: BoundingBox;
  /** Approximate bounding box for the right cheek region */
  rightCheek: BoundingBox;
}

export interface MotionRoi {
  /** Bounding box capturing the lower face / shoulder approximation for general motion */
  torso: BoundingBox;
  /** Facial grid for asymmetry detection (e.g., corners of mouth/eyes) */
  landmarks: Coordinate[];
  /** Monotonic timestamp from the face-tracker frame when this ROI was computed */
  timestamp: number;
}

export interface RoiData {
  timestamp: number;
  faceDetected: boolean;
  skinRoi?: SkinRoi;
  motionRoi?: MotionRoi;
}

export type WorkerMessageOut =
  { type: 'READY' } | { type: 'ROI_DATA'; payload: RoiData } | { type: 'ERROR'; error: string };

export type WorkerMessageIn =
  { type: 'PROCESS_FRAME'; bitmap: ImageBitmap; timestamp: number } | { type: 'DESTROY' };
