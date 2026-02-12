import * as mpHands from '@mediapipe/hands';
import { HandLandmarks, Point2D } from './types';

// Compatibility hack for MediaPipe in different environments (Vite/Rollup)
// This is more robust for production builds where exports might be wrapped differently
let Hands = (mpHands as any).Hands || (mpHands as any).default?.Hands || (mpHands as any).default || mpHands;

// If we are in a browser and still haven't found it, check the global scope (though we prefer the module)
if (typeof Hands !== 'function' && typeof window !== 'undefined' && (window as any).Hands) {
  Hands = (window as any).Hands;
}

console.log('HandTracker: Resolved Hands constructor type:', typeof Hands);
if (typeof Hands !== 'function') {
  console.error('HandTracker: Hands is not a constructor! Contents:', Hands);
}

export type HandResultsCallback = (landmarks: HandLandmarks | null) => void;

export class HandTracker {
  private hands: any; // Using any to avoid complex type issues with the hack
  private videoElement: HTMLVideoElement;
  private callback: HandResultsCallback | null = null;
  private isRunning = false;
  private animationId: number | null = null;
  private canvasWidth = 640;
  private canvasHeight = 480;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;

    console.log('HandTracker: Initializing MediaPipe Hands...');
    this.hands = new Hands({
      locateFile: (file: string) => {
        const url = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
        console.log(`HandTracker: Loading MediaPipe asset: ${url}`);
        return url;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,  // Better accuracy model (less jitter)
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });

    this.hands.onResults((results: any) => this.onResults(results));
    console.log('HandTracker: MediaPipe Hands initialized');
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  private onResults(results: any): void {
    if (!this.callback) return;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      // Use the first detected hand (could enhance to prefer right hand)
      const landmarks = results.multiHandLandmarks[0];
      const worldLandmarks = results.multiHandWorldLandmarks?.[0];

      // Convert normalized coordinates to canvas coordinates
      const convertedLandmarks: Point2D[] = landmarks.map((lm: any) => ({
        x: (1 - lm.x) * this.canvasWidth,  // Mirror horizontally
        y: lm.y * this.canvasHeight
      }));

      const convertedWorldLandmarks = worldLandmarks?.map((lm: any) => ({
        x: -lm.x,  // Mirror
        y: -lm.y,
        z: lm.z
      }));

      this.callback({
        landmarks: convertedLandmarks,
        worldLandmarks: convertedWorldLandmarks
      });
    } else {
      this.callback(null);
    }
  }

  async start(callback: HandResultsCallback): Promise<void> {
    this.callback = callback;

    if (this.isRunning) return;

    try {
      console.log('HandTracker: Requesting camera access...');
      // Request camera access - balance between speed and detection quality
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },  // 30fps is enough for hand tracking
          facingMode: 'user'
        }
      });

      console.log('HandTracker: Camera stream obtained');
      this.videoElement.srcObject = stream;
      await this.videoElement.play();
      console.log('HandTracker: Video playing');

      this.isRunning = true;

      // Use direct requestAnimationFrame for lower latency
      const processFrame = async () => {
        if (!this.isRunning) return;

        if (this.videoElement.readyState >= 2) {
          try {
            await this.hands.send({ image: this.videoElement });
          } catch (err) {
            console.error('HandTracker: MediaPipe send error:', err);
          }
        }

        this.animationId = requestAnimationFrame(processFrame);
      };

      console.log('HandTracker: Starting processFrame loop');
      processFrame();
    } catch (error) {
      console.error('HandTracker: Failed to start hand tracking:', error);
      throw error;
    }

  }

  stop(): void {
    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    const stream = this.videoElement.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
