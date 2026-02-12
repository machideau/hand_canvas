import * as THREE from 'three';
import gsap from 'gsap';
import { BalloonObject, Stroke } from './types';
import { Scene3D } from './scene3D';
import { BalloonInflator } from './balloonInflator';
import { SCENE, TIMING } from './constants';
import { audioManager } from './audioManager';

class ParticleSystem {
  private particles: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private count = 100;
  private positions: Float32Array;
  private velocities: THREE.Vector3[] = [];
  private colors: Float32Array;
  private alive = false;
  private scene: THREE.Scene;
  private startTime = 0;
  private duration = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(this.geometry, this.material);
    this.particles.visible = false;
    this.scene.add(this.particles);
  }

  explode(position: THREE.Vector3, color: THREE.Color) {
    this.alive = true;
    this.startTime = performance.now();
    this.particles.visible = true;
    this.particles.position.copy(position);

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colorAttr = this.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.count; i++) {
      // Start at origin relative to points object
      posAttr.setXYZ(i, 0, 0, 0);

      // Random velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
      );
      this.velocities[i] = velocity;

      // Color variation
      const particleColor = color.clone();
      particleColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      colorAttr.setXYZ(i, particleColor.r, particleColor.g, particleColor.b);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  update(deltaTime: number) {
    if (!this.alive) return;

    const elapsed = (performance.now() - this.startTime) / 1000;
    if (elapsed > this.duration) {
      this.alive = false;
      this.particles.visible = false;
      return;
    }

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const opacity = 1.0 - (elapsed / this.duration);
    this.material.opacity = opacity;

    for (let i = 0; i < this.count; i++) {
      const v = this.velocities[i];
      const x = posAttr.getX(i) + v.x * deltaTime;
      const y = posAttr.getY(i) + v.y * deltaTime;
      const z = posAttr.getZ(i) + v.z * deltaTime;

      // Add gravity
      v.y -= 9.8 * deltaTime * 0.2;
      // Add friction
      v.multiplyScalar(0.98);

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.particles);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class ObjectManager {
  private scene: Scene3D;
  private inflator: BalloonInflator;
  private objects: BalloonObject[] = [];
  private idCounter = 0;
  private packetSystems: ParticleSystem[] = [];
  private maxParticleSystems = 5;
  private currentParticleIdx = 0;
  private onBalloonCreatedCallback: ((stroke: Stroke, color: string) => void) | null = null;

  constructor(scene: Scene3D, canvasWidth: number, canvasHeight: number) {
    this.scene = scene;
    this.inflator = new BalloonInflator(scene.getCamera(), canvasWidth, canvasHeight);

    // Initialize particle systems pooling
    for (let i = 0; i < this.maxParticleSystems; i++) {
      this.packetSystems.push(new ParticleSystem(this.scene.getScene()));
    }
  }

  // Set callback for when a balloon is created
  onBalloonCreated(callback: (stroke: Stroke, color: string) => void): void {
    this.onBalloonCreatedCallback = callback;
  }

  updateSize(width: number, height: number): void {
    this.inflator.updateSize(width, height);
  }

  async createFromStroke(stroke: Stroke): Promise<BalloonObject> {
    const mesh = this.inflator.createBalloonMesh(stroke);

    // Start invisible for inflation animation
    mesh.scale.set(0.001, 0.001, 0.001);

    const balloonObject: BalloonObject = {
      id: `balloon_${this.idCounter++}`,
      mesh,
      color: stroke.color,
      originalStroke: stroke,
      position: mesh.position.clone(),
      targetPosition: mesh.position.clone(),
      rotation: new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ),
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * SCENE.ROTATION_SPEED_MAX,
        (Math.random() - 0.5) * SCENE.ROTATION_SPEED_MAX,
        (Math.random() - 0.5) * SCENE.ROTATION_SPEED_MAX
      ),
      bobOffset: Math.random() * Math.PI * 2,
      bobSpeed: SCENE.BOB_SPEED_MIN + Math.random() * (SCENE.BOB_SPEED_MAX - SCENE.BOB_SPEED_MIN),
      scale: 1,
      targetScale: 1,
      createdAt: Date.now(),
      isGrabbed: false,
      squishAmount: 0
    };

    this.scene.add(mesh);
    this.objects.push(balloonObject);

    // Animate inflation
    await this.animateInflation(balloonObject);

    // Settle into position
    this.findBalancedPosition(balloonObject);

    // Notify that a balloon was created
    if (this.onBalloonCreatedCallback) {
      this.onBalloonCreatedCallback(stroke, stroke.color);
    }

    return balloonObject;
  }

  private async animateInflation(obj: BalloonObject): Promise<void> {
    return new Promise((resolve) => {
      // Small delay before inflation
      gsap.delayedCall(0.3, () => {
        // Inflate with elastic easing
        gsap.to(obj.mesh.scale, {
          x: obj.scale,
          y: obj.scale,
          z: obj.scale,
          duration: TIMING.INFLATE_DURATION,
          ease: 'elastic.out(1, 0.5)',
          onStart: () => {
            // Smaller = higher pitch
            const pitch = 0.8 + (1.0 / obj.scale) * 0.2;
            audioManager.playSpatial('inflate', obj.mesh.position, 0.4, pitch);
          },
          onComplete: resolve
        });

        // Slight rotation during inflation
        gsap.to(obj.mesh.rotation, {
          y: obj.mesh.rotation.y + Math.PI * 0.25,
          duration: TIMING.INFLATE_DURATION,
          ease: 'power2.out'
        });
      });
    });
  }

  private findBalancedPosition(obj: BalloonObject): void {
    // Calculate target position that avoids other objects
    const newPos = obj.position.clone();

    // Push away from other objects
    for (const other of this.objects) {
      if (other.id === obj.id) continue;

      const diff = new THREE.Vector3().subVectors(newPos, other.position);
      const dist = diff.length();

      if (dist < SCENE.COLLISION_RADIUS) {
        const pushForce = (SCENE.COLLISION_RADIUS - dist) / SCENE.COLLISION_RADIUS;
        diff.normalize().multiplyScalar(pushForce * 0.5);
        newPos.add(diff);
      }
    }

    // Keep within reasonable bounds
    newPos.x = Math.max(-4, Math.min(4, newPos.x));
    newPos.y = Math.max(-3, Math.min(3, newPos.y));
    newPos.z = Math.max(-2, Math.min(2, newPos.z));

    obj.targetPosition = newPos;

    // Animate to new position
    gsap.to(obj.mesh.position, {
      x: newPos.x,
      y: newPos.y,
      z: newPos.z,
      duration: TIMING.OBJECT_SETTLE,
      ease: 'power2.out'
    });
  }

  update(deltaTime: number, elapsedTime: number): void {
    // Update particle systems
    for (const ps of this.packetSystems) {
      ps.update(deltaTime);
    }

    for (const obj of this.objects) {
      if (obj.isGrabbed) continue;

      // Gentle rotation
      obj.mesh.rotation.x += obj.rotationSpeed.x * deltaTime;
      obj.mesh.rotation.y += obj.rotationSpeed.y * deltaTime;
      obj.mesh.rotation.z += obj.rotationSpeed.z * deltaTime;

      // Bobbing motion
      const bobAmount = Math.sin(elapsedTime * obj.bobSpeed + obj.bobOffset) * SCENE.BOB_AMPLITUDE;
      obj.mesh.position.y = obj.targetPosition.y + bobAmount;

      // Gentle drift
      obj.mesh.position.x += Math.sin(elapsedTime * 0.2 + obj.bobOffset) * SCENE.DRIFT_SPEED * deltaTime;

      // Soft collision avoidance
      this.softCollisionAvoidance(obj, deltaTime);

      // Apply squish if any
      if (obj.squishAmount > 0) {
        const squish = 1 - obj.squishAmount * 0.3;
        const expand = 1 + obj.squishAmount * 0.15;
        obj.mesh.scale.set(
          obj.scale * expand,
          obj.scale * squish,
          obj.scale * expand
        );
      }
    }
  }

  private softCollisionAvoidance(obj: BalloonObject, deltaTime: number): void {
    for (const other of this.objects) {
      if (other.id === obj.id) continue;

      const diff = new THREE.Vector3().subVectors(obj.mesh.position, other.mesh.position);
      const dist = diff.length();

      if (dist < SCENE.COLLISION_RADIUS && dist > 0.001) {
        const pushForce = ((SCENE.COLLISION_RADIUS - dist) / SCENE.COLLISION_RADIUS) * deltaTime * 2;
        diff.normalize().multiplyScalar(pushForce);
        obj.mesh.position.add(diff);
        obj.targetPosition.add(diff.multiplyScalar(0.5));
      }
    }
  }

  pokeObject(obj: BalloonObject): void {
    // Squish animation
    gsap.to(obj, {
      squishAmount: 1,
      duration: TIMING.POKE_SQUISH_IN,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(obj, {
          squishAmount: 0,
          duration: TIMING.POKE_SQUISH_OUT,
          ease: 'elastic.out(1, 0.3)'
        });
      }
    });

    // Smaller = higher pitch
    const pitch = 0.8 + (1.0 / obj.scale) * 0.4 + (Math.random() - 0.5) * 0.2;
    audioManager.playSpatial('poke', obj.mesh.position, 0.3, pitch);

    // Jiggle rotation
    gsap.to(obj.mesh.rotation, {
      x: obj.mesh.rotation.x + (Math.random() - 0.5) * 0.5,
      y: obj.mesh.rotation.y + (Math.random() - 0.5) * 0.5,
      duration: 0.3,
      ease: 'elastic.out(1, 0.5)'
    });
  }

  grabObject(obj: BalloonObject): void {
    obj.isGrabbed = true;
    gsap.killTweensOf(obj.mesh.position);
    gsap.killTweensOf(obj.mesh.scale);

    // Slight scale up when grabbed
    gsap.to(obj.mesh.scale, {
      x: obj.scale * 1.1,
      y: obj.scale * 1.1,
      z: obj.scale * 1.1,
      duration: 0.15,
      ease: 'power2.out'
    });

    audioManager.playSpatial('select', obj.mesh.position, 0.2);
  }

  moveGrabbedObject(obj: BalloonObject, screenX: number, screenY: number): void {
    if (!obj.isGrabbed) return;

    const worldPos = this.scene.screenToWorld(screenX, screenY, 0);
    obj.mesh.position.copy(worldPos);
    obj.position.copy(worldPos);
  }

  releaseObject(obj: BalloonObject): void {
    obj.isGrabbed = false;
    obj.targetPosition.copy(obj.mesh.position);

    // Scale back and bounce
    gsap.to(obj.mesh.scale, {
      x: obj.scale,
      y: obj.scale,
      z: obj.scale,
      duration: 0.3,
      ease: 'elastic.out(1, 0.5)'
    });

    // Push other objects away
    for (const other of this.objects) {
      if (other.id === obj.id) continue;
      this.findBalancedPosition(other);
    }
  }

  async removeObject(obj: BalloonObject, fade: boolean = false): Promise<void> {
    const index = this.objects.indexOf(obj);
    if (index === -1) return;

    this.objects.splice(index, 1);

    return new Promise((resolve) => {
      if (fade) {
        // Fade out animation
        gsap.to(obj.mesh.scale, {
          x: 0,
          y: 0,
          z: 0,
          duration: TIMING.OBJECT_POP,
          ease: 'power2.in',
          onComplete: () => {
            this.triggerPopEffect(obj.mesh.position, obj.color);
            this.scene.remove(obj.mesh);
            obj.mesh.geometry.dispose();
            (obj.mesh.material as THREE.Material).dispose();
            resolve();
          }
        });
        const pitch = 0.9 + (1.0 / obj.scale) * 0.2 + (Math.random() - 0.5) * 0.2;
        audioManager.playSpatial('pop', obj.mesh.position, 0.4, pitch);
      } else {
        // Pop animation
        gsap.to(obj.mesh.scale, {
          x: obj.scale * 1.3,
          y: obj.scale * 1.3,
          z: obj.scale * 1.3,
          duration: 0.1,
          ease: 'power2.out',
          onComplete: () => {
            gsap.to(obj.mesh.scale, {
              x: 0,
              y: 0,
              z: 0,
              duration: TIMING.OBJECT_POP,
              ease: 'power2.in',
              onComplete: () => {
                this.triggerPopEffect(obj.mesh.position, obj.color);
                this.scene.remove(obj.mesh);
                obj.mesh.geometry.dispose();
                (obj.mesh.material as THREE.Material).dispose();
                resolve();
              }
            });
          }
        });
      }
    });
  }

  private triggerPopEffect(position: THREE.Vector3, color: string): void {
    const ps = this.packetSystems[this.currentParticleIdx];
    ps.explode(position, new THREE.Color(color));
    this.currentParticleIdx = (this.currentParticleIdx + 1) % this.maxParticleSystems;
  }

  async clearAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Staggered removal
    for (let i = 0; i < this.objects.length; i++) {
      const delay = i * 0.1;
      promises.push(
        new Promise((resolve) => {
          gsap.delayedCall(delay, async () => {
            if (this.objects[i]) {
              await this.removeObject(this.objects[i], true);
            }
            resolve();
          });
        })
      );
    }

    await Promise.all(promises);
    this.objects = [];
  }

  getObjectAtPosition(screenX: number, screenY: number): BalloonObject | null {
    const meshes = this.objects.map(o => o.mesh);
    const intersects = this.scene.raycastObjects(screenX, screenY, meshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      return this.objects.find(o => o.mesh === mesh) || null;
    }

    return null;
  }

  getObjects(): BalloonObject[] {
    return this.objects;
  }

  getObjectCount(): number {
    return this.objects.length;
  }

  // Rotate an object manually
  rotateObject(obj: BalloonObject, deltaX: number, deltaY: number): void {
    obj.mesh.rotation.y += deltaX;
    obj.mesh.rotation.x += deltaY;
  }

  // Select an object (visual feedback)
  selectObject(obj: BalloonObject): void {
    // Brief highlight animation
    gsap.to(obj.mesh.scale, {
      x: obj.scale * 1.15,
      y: obj.scale * 1.15,
      z: obj.scale * 1.15,
      duration: 0.15,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(obj.mesh.scale, {
          x: obj.scale,
          y: obj.scale,
          z: obj.scale,
          duration: 0.2,
          ease: 'power2.out'
        });
      }
    });

    // Jiggle effect
    gsap.to(obj.mesh.rotation, {
      y: obj.mesh.rotation.y + 0.3,
      duration: 0.3,
      ease: 'elastic.out(1, 0.5)'
    });
  }
}
