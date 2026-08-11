import "./style/style.css";
import * as THREE from "three";

import { tracklist } from "../../utils/tracks";
import LiquidBackground from "../LiquidBackground/LiquidBackground";

function average(data: Uint8Array, start: number, end: number): number {
    let sum = 0;

    for (let i = start; i < end; i++) sum += data[i];

    return sum / (end - start);
}

// unlit cube shader: album cover texture plus a faint holographic sheen and bass-driven flare
const cubeVertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const cubeFragmentShader = `
    uniform sampler2D map;
    uniform float uTime;
    uniform float uBass;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        vec4 texColor = texture2D(map, vUv);

        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.0);

        float diag = vUv.x + vUv.y + uTime * 0.15;
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (diag + vec3(0.0, 0.33, 0.67)));

        vec2 flareCenter = vec2(0.5 + 0.5 * sin(uTime * 0.3), 0.5 + 0.5 * cos(uTime * 0.23));
        float flare = pow(smoothstep(0.4, 0.0, distance(vUv, flareCenter)), 2.0);

        vec3 holo = rainbow * fresnel * 0.12 + vec3(1.0) * flare * (0.25 + uBass * 0.35);
        vec3 finalColor = texColor.rgb + holo;

        gl_FragColor = vec4(finalColor, texColor.a);
    }
`;

const BAR_COUNT = 40;
const BAR_SPACING = 0.11;
const BAR_WIDTH = 0.08;
const BAR_BASELINE = -1.4;

export default {
    audioCtx: null as AudioContext | null,
    analyser: null as AnalyserNode | null,
    freqData: null as Uint8Array<ArrayBuffer> | null,
    audioEl: null as HTMLAudioElement | null,

    renderer: null as THREE.WebGLRenderer | null,
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,

    bars: null as THREE.InstancedMesh | null,
    barDummy: new THREE.Object3D(),
    barCount: BAR_COUNT,
    barSpacing: BAR_SPACING,
    barWidth: BAR_WIDTH,

    cube: null as THREE.Mesh | null,
    cubeUniforms: null as any,
    shape: "spectrum" as "spectrum" | "cube",

    smoothedBass: 0,
    smoothedMid: 0,
    smoothedTreble: 0,

    targetBass: 0,
    targetMid: 0,
    targetTreble: 0,

    energy: 0,
    beat: 0,
    previousEnergy: 0,

    spectrumColors: {
        colorA: null as THREE.Color | null,
        colorB: null as THREE.Color | null
    },

    clock: new THREE.Clock(),

    render() {
        return `
            ${LiquidBackground.render()}

            <div class="visualizer-stage">
                <button id="back-btn" class="back-button" aria-label="Back to menu">&larr; Menu</button>
                <div class="visualizer-canvas"></div>
                <button id="shape-toggle" class="shape-toggle" aria-label="Switch visualizer shape">Cube</button>
            </div>
        `;
    },

    init() {
        this.initAudio();
        this.initThree();
        this.initShapeToggle();
        this.initBackButton();

        LiquidBackground.init(true, this.analyser!, tracklist[0].albumCover);
    },

    initShapeToggle() {
        const toggle = document.getElementById("shape-toggle")!;

        toggle.addEventListener("click", () => {
            this.shape = this.shape === "spectrum" ? "cube" : "spectrum";
            this.bars!.visible = this.shape === "spectrum";
            this.cube!.visible = this.shape === "cube";
            toggle.textContent = this.shape === "spectrum" ? "Cube" : "Spectrum";
        });
    },

    initBackButton() {
        const backBtn = document.getElementById("back-btn")!;

        backBtn.addEventListener("click", () => {
            document.body.classList.remove("is-visualizing");
        });
    },

    playTrack(index: number) {
        this.selectTrack(index, true);
    },

    // set track audio source and optionally start playback
    selectTrack(index: number, autoplay: boolean = false) {
        const track = tracklist[index];

        if (!this.audioEl || !track) return;

        this.audioEl.src = track.audioSrc;
        this.audioEl.load();

        // ensure background tint updates even when not autoplaying
        LiquidBackground.setCoverColors(track.albumCover);

        if (this.cubeUniforms) {
            new THREE.TextureLoader().load(track.albumCover, (texture) => {
                this.cubeUniforms.map.value = texture;
            });
        }

        // update spectrum colors to match cover
        this.setSpectrumColors(track.albumCover);

        if (autoplay) {
            // ensure the cube is shown by default when autoplaying
            this.shape = "cube";
            if (this.bars) this.bars.visible = false;
            if (this.cube) this.cube.visible = true;
            const toggle = document.getElementById("shape-toggle");
            if (toggle) toggle.textContent = "Spectrum"; // button shows the other option

            this.audioCtx?.resume();
            this.audioEl.play();
            document.body.classList.add("is-visualizing");
        } else {
            // if not autoplaying, keep visualizing state as-is
            // do not add is-visualizing class so rendering remains stopped until play
        }
    },

    initAudio() {
        const audioEl = new Audio();

        audioEl.loop = true;
        this.audioEl = audioEl;

        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx: AudioContext = new AudioContextCtor();

        const source = audioCtx.createMediaElementSource(audioEl);
        const analyser = audioCtx.createAnalyser();

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;

        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        this.audioCtx = audioCtx;
        this.analyser = analyser;
        this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    },

    updateAudioLevels(delta: number) {
        if (!this.analyser || !this.freqData) return;

        // when paused/ended, feed zeroes in so every level decays toward rest instead of holding the last reading
        const isPlaying = !!this.audioEl && !this.audioEl.paused && !this.audioEl.ended;

        if (isPlaying) {
            this.analyser.getByteFrequencyData(this.freqData);

            this.targetBass = average(this.freqData, 0, 12) / 255;
            this.targetMid = average(this.freqData, 12, 80) / 255;
            this.targetTreble = average(this.freqData, 80, this.freqData.length) / 255;
        } else {
            this.targetBass = 0;
            this.targetMid = 0;
            this.targetTreble = 0;
        }

        // time-based smoothing, independent of framerate
        const attack = 8.0;
        const release = 3.0;

        const smooth = (current: number, target: number) => {
            const speed = target > current ? attack : release;
            const factor = 1 - Math.exp(-speed * delta);

            return THREE.MathUtils.lerp(current, target, factor);
        };

        this.smoothedBass = smooth(this.smoothedBass, this.targetBass);
        this.smoothedMid = smooth(this.smoothedMid, this.targetMid);
        this.smoothedTreble = smooth(this.smoothedTreble, this.targetTreble);

        const rawEnergy = this.smoothedBass * 0.5 + this.smoothedMid * 0.35 + this.smoothedTreble * 0.15;
        this.energy = smooth(this.energy, rawEnergy);

        // sudden energy increases give a soft "beat" impulse
        const deltaEnergy = Math.max(0, rawEnergy - this.previousEnergy);
        const beatTarget = THREE.MathUtils.clamp(deltaEnergy * 8, 0, 1);

        this.beat = THREE.MathUtils.lerp(this.beat, beatTarget, 1 - Math.exp(-10 * delta));
        this.previousEnergy = rawEnergy;
    },

    updateBars() {
        if (!this.bars || !this.freqData) return;

        const usableBins = Math.floor(this.freqData.length * 0.6);

        for (let i = 0; i < this.barCount; i++) {
            const bin = 2 + Math.floor((i / this.barCount) * usableBins);
            const value = this.freqData[bin] / 255;
            const height = 0.05 + value * 3.2;

            this.barDummy.position.set(i * this.barSpacing - ((this.barCount - 1) * this.barSpacing) / 2, BAR_BASELINE + height / 2, 0);
            this.barDummy.scale.set(this.barWidth, height, 1);
            this.barDummy.updateMatrix();
            this.bars.setMatrixAt(i, this.barDummy.matrix);
        }

        this.bars.instanceMatrix.needsUpdate = true;
    },

    createBars(count: number) {
        if (!this.scene) return;

        if (this.bars) {
            this.scene.remove(this.bars);
            this.bars.geometry.dispose();
            (this.bars.material as THREE.Material).dispose();
            this.bars = null;
        }

        const geometry = new THREE.PlaneGeometry(1, 1);

        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const bars = new THREE.InstancedMesh(
            geometry,
            material,
            count
        );

        // allocate instanceColor so setColorAt works reliably
        bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        const totalWidth = (count - 1) * this.barSpacing;

        for (let i = 0; i < count; i++) {
            const t = i / Math.max(1, count - 1);

            position.set(
                i * this.barSpacing - totalWidth / 2,
                0,
                0
            );

            const width =
                this.barWidth *
                (0.9 + Math.sin(t * Math.PI) * 0.1);

            scale.set(width, 1, 1);

            matrix.compose(
                position,
                quaternion,
                scale
            );

            bars.setMatrixAt(i, matrix);

            // apply stored spectrum gradient if available, otherwise use a small palette
            if (this.spectrumColors && this.spectrumColors.colorA && this.spectrumColors.colorB) {
                const col = this.spectrumColors.colorA.clone().lerp(this.spectrumColors.colorB, Math.pow(t, 0.9));
                bars.setColorAt(i, col);
            } else {
                const palette = [0x00e5ff, 0x2979ff, 0x7c4dff, 0xe040fb, 0xff4081, 0xff6d00];
                const col = new THREE.Color(palette[Math.floor(t * palette.length) % palette.length]);
                bars.setColorAt(i, col);
            }
        }

        bars.instanceMatrix.needsUpdate = true;

        if (bars.instanceColor) {
            bars.instanceColor.needsUpdate = true;
        }

        // IMPORTANTISSIMO:
        // mantieni la modalità corrente
        bars.visible = this.shape === "spectrum";

        this.scene.add(bars);
        this.bars = bars;
    },

    // reapply stored spectrum colors to the current bars (used after resize/create)
    applySpectrumColors() {
        if (!this.bars) return;
        if (!this.spectrumColors || !this.spectrumColors.colorA || !this.spectrumColors.colorB) return;

        for (let i = 0; i < this.barCount; i++) {
            const t = i / Math.max(1, this.barCount - 1);
            const col = this.spectrumColors.colorA.clone().lerp(this.spectrumColors.colorB, Math.pow(t, 0.9));
            this.bars.setColorAt(i, col);
        }

        if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
    },

    layoutSpectrum() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        const isMobile = width < 600;

        // Padding laterale
        const horizontalPadding = isMobile ? 55 : 140;

        const availableWidth = Math.max(
            200,
            width - horizontalPadding * 2
        );

        // Poche barre e abbastanza grosse
        const desiredBarPx = isMobile ? 22 : 26;

        let count = Math.floor(
            availableWidth / desiredBarPx
        );

        count = Math.max(
            10,
            Math.min(42, count)
        );

        const viewHeight = 4;

        const aspect =
            width / height;

        const viewWidth =
            viewHeight * aspect;

        const worldPerPixel =
            viewWidth / width;

        const availableWorldWidth =
            availableWidth * worldPerPixel;

        this.barSpacing =
            availableWorldWidth / count;

        this.barWidth =
            this.barSpacing * 0.68;

        if (count !== this.barCount) {
            this.barCount = count;
            this.createBars(count);
        }
    },

    // sample an album cover and tint the spectrum bars to match
    setSpectrumColors(url: string) {
        if (!url) return;

        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
            const size = 32;

            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.drawImage(img, 0, 0, size, size);

            let data: Uint8ClampedArray;

            try {
                data = ctx.getImageData(
                    0,
                    0,
                    size,
                    size
                ).data;
            } catch {
                return;
            }

            let rSum = 0;
            let gSum = 0;
            let bSum = 0;
            let count = 0;

            let vibR = 0;
            let vibG = 0;
            let vibB = 0;
            let vibScore = -1;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                rSum += r;
                gSum += g;
                bSum += b;
                count++;

                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);

                const saturation =
                    max === 0
                        ? 0
                        : (max - min) / max;

                const score =
                    saturation * (max / 255);

                if (score > vibScore) {
                    vibScore = score;
                    vibR = r;
                    vibG = g;
                    vibB = b;
                }
            }

            const colorA = new THREE.Color(
                rSum / count / 255,
                gSum / count / 255,
                bSum / count / 255
            );

            const colorB = new THREE.Color(
                vibR / 255,
                vibG / 255,
                vibB / 255
            );

            // Salva i colori correnti della cover
            this.spectrumColors.colorA = colorA;
            this.spectrumColors.colorB = colorB;

            if (!this.bars) return;

            for (let i = 0; i < this.barCount; i++) {
                const t =
                    i /
                    Math.max(1, this.barCount - 1);

                const color = colorA
                    .clone()
                    .lerp(
                        colorB,
                        Math.pow(t, 0.9)
                    );

                this.bars.setColorAt(i, color);
            }

            if (this.bars.instanceColor) {
                this.bars.instanceColor.needsUpdate = true;
            }
        };

        img.src = url;
    },

    initThree() {
        const container = document.querySelector(".visualizer-canvas") as HTMLElement;
        const width = window.innerWidth;
        const height = window.innerHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.inset = "0";
        renderer.domElement.style.zIndex = "1";

        container.appendChild(renderer.domElement);
        this.renderer = renderer;

        const scene = new THREE.Scene();
        this.scene = scene;

        // FOV chosen so visible height at z=0 matches the previous ortho viewHeight=4
        const fov = 2 * (180 / Math.PI) * Math.atan(2 / 5); // ≈ 43.6°
        const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);

        camera.position.z = 5;
        this.camera = camera;

        // Spectrum: a single instanced mesh, cheap to draw and update every frame
        // create initial bars using responsive layout
        this.layoutSpectrum();

        // Cube: album cover on every face
        const placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
        placeholder.needsUpdate = true;

        const cubeUniforms = {
            map: { value: placeholder as THREE.Texture },
            uTime: { value: 0 },
            uBass: { value: 0 }
        };

        const cubeMaterial = new THREE.ShaderMaterial({
            uniforms: cubeUniforms,
            vertexShader: cubeVertexShader,
            fragmentShader: cubeFragmentShader
        });

        const cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), cubeMaterial);
        cube.visible = false;
        cube.rotation.set(0.35, 0.18, 0);
        scene.add(cube);

        new THREE.TextureLoader().load(tracklist[0].albumCover, (texture) => {
            cubeUniforms.map.value = texture;
        });

        this.cube = cube;
        this.cubeUniforms = cubeUniforms;

        window.addEventListener("resize", () => {
            const w = window.innerWidth;
            const h = window.innerHeight;

            camera.aspect = w / h;
            camera.updateProjectionMatrix();

            renderer.setSize(w, h);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.layoutSpectrum();
        });

        const animate = () => {
            requestAnimationFrame(animate);

            // skips all the audio analysis, mesh updates and rendering while the menu is shown
            if (!document.body.classList.contains("is-visualizing")) return;

            const delta = this.clock.getDelta();
            const elapsedTime = this.clock.elapsedTime;

            this.updateAudioLevels(delta);
            this.updateBars();

            // subtle cube motion and modest scaling (avoid deformation / overgrowth)
            const cubeSpin = 0.0009 + this.energy * 0.01;

            cube.rotation.x += cubeSpin;
            cube.rotation.y += cubeSpin * 1.1;
            const cubeScale = 1 + Math.min(0.12, this.energy * 0.12) + this.beat * 0.08;
            cube.scale.setScalar(cubeScale);

            cubeUniforms.uTime.value = elapsedTime;
            cubeUniforms.uBass.value = this.smoothedBass;

            renderer.render(scene, camera);
        };

        animate();
    }
};
