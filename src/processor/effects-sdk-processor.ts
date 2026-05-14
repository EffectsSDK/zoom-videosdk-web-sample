/* eslint-disable @typescript-eslint/explicit-member-accessibility */
class EffectsSdkProcessor extends VideoProcessor {
  private context: OffscreenCanvasRenderingContext2D | null = null;
  private sdkPort: MessagePort | null = null;
  private outputCanvas: OffscreenCanvas | null = null;
  private isProcessing = false;
  private nextFrameId = 0;
  private pendingFrames = new Map<number, (value: boolean) => void>();
  private readonly maxFramesInFlight = 2;

  constructor(port: MessagePort, options?: any) {
    super(port, options);

    port.addEventListener('message', (e) => {
      if (e.data.cmd === 'initialize') {
        this.attachSdkPort(e.data.port);
      }
      if (e.data.cmd === 'start') {
        this.isProcessing = true;
      }
      if (e.data.cmd === 'stop') {
        this.isProcessing = false;
        this.resolveAllPendingFrames(false);
      }
      if (e.data.cmd === 'reset') {
        this.resetSdkPort();
      }
    });
  }

  private attachSdkPort(port: MessagePort | null) {
    this.resetSdkPort();
    this.sdkPort = port;
    this.sdkPort?.addEventListener('message', this.handleSdkMessage);
    this.sdkPort?.start();
  }

  private readonly handleSdkMessage = (event: MessageEvent) => {
    if (event.data.cmd === 'processed_video_frame') {
      this.handleProcessedFrame(event.data.frameId, event.data.frame);
    }
  };

  private handleProcessedFrame(frameId: number, frame: VideoFrame | null) {
    const resolve = this.pendingFrames.get(frameId);
    if (!resolve) {
      frame?.close();
      return;
    }
    this.pendingFrames.delete(frameId);

    if (!this.context || !this.outputCanvas || !frame) {
      frame?.close();
      resolve(false);
      return;
    }

    this.context.drawImage(frame, 0, 0, this.outputCanvas.width, this.outputCanvas.height);
    frame.close();
    resolve(true);
  }

  async processFrame(input: VideoFrame, output: OffscreenCanvas) {
    if (!this.isProcessing || !this.sdkPort || this.pendingFrames.size >= this.maxFramesInFlight) {
      return false;
    }

    this.outputCanvas = output;
    const frameId = ++this.nextFrameId;
    const framePromise = new Promise<boolean>((resolve) => {
      this.pendingFrames.set(frameId, resolve);
    });

    this.sdkPort.postMessage(
      {
        cmd: 'process_frame',
        frameId,
        frame: input
      },
      [input]
    );

    return framePromise;
  }

  onInit() {
    const canvas = this.getOutput();
    if (canvas) {
      this.outputCanvas = canvas;
      this.context = canvas.getContext('2d');
      if (!this.context) {
        console.error('2D context could not be initialized.');
      }
    }
  }

  onUninit() {
    this.context = null;
    this.outputCanvas = null;
    this.resetSdkPort();
    this.isProcessing = false;
  }

  private resolveAllPendingFrames(value: boolean) {
    this.pendingFrames.forEach((resolve) => resolve(value));
    this.pendingFrames.clear();
  }

  private resetSdkPort() {
    this.resolveAllPendingFrames(false);
    this.sdkPort?.removeEventListener('message', this.handleSdkMessage);
    this.sdkPort?.close();
    this.sdkPort = null;
  }
}

registerProcessor('effects-sdk-processor', EffectsSdkProcessor);
