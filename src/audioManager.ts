import * as THREE from 'three';

export type SoundEffect = 'pop' | 'inflate' | 'poke' | 'swipe' | 'select' | 'clear' | 'join' | 'leave';

export class AudioManager {
    private context: AudioContext | null = null;
    private buffers: Map<SoundEffect, AudioBuffer> = new Map();
    private masterGain: GainNode | null = null;
    private isMuted: boolean = false;
    private isInitialized: boolean = false;

    private SOUND_URLS: Record<SoundEffect, string> = {
        pop: '/audio/pop.wav',
        inflate: '/audio/inflate.wav',
        poke: '/audio/poke.wav',
        swipe: '/audio/swipe.wav',
        select: '/audio/select.wav',
        clear: '/audio/clear.wav',
        join: '/audio/join.wav',
        leave: '/audio/leave.wav'
    };

    constructor() {
        // We don't initialize context here due to browser policies
    }

    /**
     * Initialize the AudioContext after user interaction
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized && this.context?.state === 'running') return;

        try {
            if (!this.context) {
                this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
                this.masterGain = this.context.createGain();
                this.masterGain.connect(this.context.destination);
                this.masterGain.gain.value = 1.0;
            }

            if (this.context.state === 'suspended') {
                await this.context.resume();
            }

            this.isInitialized = true;
            console.log('AudioManager: Initialized');

            if (this.buffers.size === 0) {
                await this.loadSounds();
            }
        } catch (err) {
            console.error('AudioManager: Failed to initialize', err);
        }
    }

    /**
     * Update the audio listener to match the camera
     */
    public updateListener(camera: THREE.Camera): void {
        if (!this.context) return;

        const listener = this.context.listener;
        const worldPos = new THREE.Vector3();
        camera.getWorldPosition(worldPos);

        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);

        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(camera.quaternion);

        if (listener.positionX) {
            listener.positionX.setTargetAtTime(worldPos.x, this.context.currentTime, 0.1);
            listener.positionY.setTargetAtTime(worldPos.y, this.context.currentTime, 0.1);
            listener.positionZ.setTargetAtTime(worldPos.z, this.context.currentTime, 0.1);
            listener.forwardX.setTargetAtTime(forward.x, this.context.currentTime, 0.1);
            listener.forwardY.setTargetAtTime(forward.y, this.context.currentTime, 0.1);
            listener.forwardZ.setTargetAtTime(forward.z, this.context.currentTime, 0.1);
            listener.upX.setTargetAtTime(up.x, this.context.currentTime, 0.1);
            listener.upY.setTargetAtTime(up.y, this.context.currentTime, 0.1);
            listener.upZ.setTargetAtTime(up.z, this.context.currentTime, 0.1);
        } else {
            // Fallback for older browsers
            listener.setPosition(worldPos.x, worldPos.y, worldPos.z);
            listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }
    }

    private async loadSounds(): Promise<void> {
        const loadTasks = Object.entries(this.SOUND_URLS).map(async ([id, url]) => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();

                if (this.context) {
                    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
                    this.buffers.set(id as SoundEffect, audioBuffer);
                }
            } catch (err) {
                console.warn(`AudioManager: Failed to load sound ${id} from ${url}`, err);
            }
        });

        await Promise.all(loadTasks);
        console.log(`AudioManager: Loaded ${this.buffers.size} sounds`);
    }

    /**
     * Play a 2D UI sound
     */
    public playUI(soundId: SoundEffect, volume: number = 0.5, playbackRate: number = 1.0): void {
        if (!this.isInitialized || !this.context || this.isMuted) return;

        const buffer = this.buffers.get(soundId);
        if (!buffer) return;

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;

        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        if (this.masterGain) {
            gainNode.connect(this.masterGain);
        }

        source.start(0);
    }

    /**
     * Play a sound at a specific 3D position
     */
    public playSpatial(
        soundId: SoundEffect,
        position: THREE.Vector3,
        volume: number = 0.8,
        playbackRate: number = 1.0
    ): void {
        if (!this.isInitialized || !this.context || this.isMuted) return;

        const buffer = this.buffers.get(soundId);
        if (!buffer) return;

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;

        const panner = this.context.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 5; // Start dropping volume after 5 units
        panner.maxDistance = 100;
        panner.rolloffFactor = 0.5; // Gentler volume drop

        // Set position
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;

        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(panner);
        panner.connect(gainNode);
        if (this.masterGain) {
            gainNode.connect(this.masterGain);
        }

        source.start(0);
    }

    public setMute(muted: boolean): void {
        this.isMuted = muted;
        if (this.masterGain) {
            this.masterGain.gain.value = muted ? 0 : 1;
        }
    }

    public getMute(): boolean {
        return this.isMuted;
    }
}

export const audioManager = new AudioManager();
