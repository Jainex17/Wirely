/**
 * Whether the canvas camera is moving. Building a page's DOM or drawing its
 * snapshot holds the main thread for a frame or more, which a pan or zoom
 * shows as a dropped frame. So that work waits while the camera moves and
 * resumes once it rests. The canvas reports both.
 */
let isMoving = false;
let resumes: Array<() => void> = [];

export const setCameraMoving = (moving: boolean) => {
  isMoving = moving;
  if (moving) return;
  const waiting = resumes;
  resumes = [];
  waiting.forEach((resume) => resume());
};

export const isCameraMoving = () => isMoving;

/** Resolves at once while the camera rests, or when it next comes to rest. */
export const whenCameraRests = () =>
  isMoving ? new Promise<void>((resolve) => resumes.push(resolve)) : Promise.resolve();
