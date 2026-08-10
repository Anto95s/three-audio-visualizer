import "./style/style.css";
import * as THREE from "three";
import { fragmentShader } from "./components/shader";

function average(data: Uint8Array, start: number, end: number): number {
    let sum = 0;
    const count = end - start;

    for (let i = start; i < end; i++) sum += data[i];

    return sum / count;
}

export default {
    material: null as THREE.ShaderMaterial | null,
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    analyser: null as AnalyserNode | null,
    freqData: null as Uint8Array<ArrayBuffer> | null,
    smoothedBass: 0, // eased low-frequency level, drives the big slow warp
    smoothedMid: 0, // eased mid-band level, drives secondary flow layer
    smoothedTreble: 0, // eased high-band level, drives fine ripple/sparkle

    theme: false,

    render() {
        return `
            <div class="background-wrapper">
                <canvas id="background-canvas"></canvas>

                <div id="content"></div>

                <div class="background-overlay"></div>
            </div>
        `;
    },

    init(theme: boolean = false, analyser: AnalyserNode | null = null, coverUrl: string | null = null) {
        this.analyser = analyser;
        this.freqData = analyser ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) : null;
        this.theme = theme;

        const canvas = document.getElementById(
            "background-canvas"
        ) as HTMLCanvasElement | null;

        if (!canvas) return;

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true
        });

        renderer.domElement.style.zIndex = "0";
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;

        const uniforms = {
            u_resolution: {
                value: new THREE.Vector2(
                    window.innerWidth,
                    window.innerHeight
                )
            },
            u_time: {
                value: 0.0
            },
            u_theme: {
                value: theme
            },
            u_bass: {
                value: 0.0
            },
            u_mid: {
                value: 0.0
            },
            u_treble: {
                value: 0.0
            },
            u_colorA: {
                value: new THREE.Color(0.36, 0.60, 0.94)
            },
            u_colorB: {
                value: new THREE.Color(0.60, 0.50, 0.86)
            }
        };

        const shaderMaterial = new THREE.ShaderMaterial({
            fragmentShader,
            uniforms,
            side: THREE.DoubleSide
        });

        const geometry = new THREE.PlaneGeometry(
            window.innerWidth,
            window.innerHeight,
            50,
            50
        );

        const mesh = new THREE.Mesh(
            geometry,
            shaderMaterial
        );

        scene.add(mesh);

        this.material = shaderMaterial;
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        let lastTime = performance.now();
        let time = 0;
        let paused = false;

        const onVisibilityChange = () => {
            paused = document.hidden;
            lastTime = performance.now();
        };

        document.addEventListener(
            "visibilitychange",
            onVisibilityChange
        );

        const animate = (now: number) => {
            requestAnimationFrame(animate);

            if (paused) {
                lastTime = now;
                return;
            }

            const delta = Math.min(
                (now - lastTime) * 0.001,
                0.033
            );

            lastTime = now;
            time += delta;

            if (this.analyser && this.freqData) {
                this.analyser.getByteFrequencyData(this.freqData);

                // three bands split the spectrum so the fluid reacts differently across low/mid/high content
                const bassNorm = average(this.freqData, 0, 8) / 255;
                const midNorm = average(this.freqData, 8, 40) / 255;
                const trebleNorm = average(this.freqData, 40, 100) / 255;

                this.smoothedBass += (bassNorm - this.smoothedBass) * (bassNorm > this.smoothedBass ? 0.5 : 0.1);
                this.smoothedMid += (midNorm - this.smoothedMid) * (midNorm > this.smoothedMid ? 0.35 : 0.08);
                this.smoothedTreble += (trebleNorm - this.smoothedTreble) * (trebleNorm > this.smoothedTreble ? 0.3 : 0.08);
            } else {
                this.smoothedBass += (0 - this.smoothedBass) * 0.05;
                this.smoothedMid += (0 - this.smoothedMid) * 0.05;
                this.smoothedTreble += (0 - this.smoothedTreble) * 0.05;
            }

            if (this.material) {
                this.material.uniforms.u_time.value = time;
                this.material.uniforms.u_bass.value = this.smoothedBass;
                this.material.uniforms.u_mid.value = this.smoothedMid;
                this.material.uniforms.u_treble.value = this.smoothedTreble;
            }

            if (
                this.renderer &&
                this.scene &&
                this.camera
            ) {
                this.renderer.render(
                    this.scene,
                    this.camera
                );
            }
        };

        requestAnimationFrame(animate);

        const onWindowResize = () => {
            if (
                !this.camera ||
                !this.renderer ||
                !this.material
            ) {
                return;
            }

            const width = window.innerWidth;
            const height = window.innerHeight;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(width, height);

            this.material.uniforms.u_resolution.value.set(
                width,
                height
            );
        };

        window.addEventListener(
            "resize",
            onWindowResize
        );

        onWindowResize();

        if (coverUrl) this.setCoverColors(coverUrl);
    },

    // samples the album cover to tint the liquid with its dominant/vibrant colors
    setCoverColors(url: string) {
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
                data = ctx.getImageData(0, 0, size, size).data;
            } catch {
                return; // canvas tainted by cross-origin image, skip tinting
            }

            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            let vibR = 0, vibG = 0, vibB = 0, vibScore = -1;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                rSum += r; gSum += g; bSum += b; count++;

                // picks the most saturated, well-lit pixel as the vibrant accent color
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const saturation = max === 0 ? 0 : (max - min) / max;
                const score = saturation * (max / 255);

                if (score > vibScore) {
                    vibScore = score;
                    vibR = r; vibG = g; vibB = b;
                }
            }

            if (!this.material || count === 0) return;

            this.material.uniforms.u_colorA.value.setRGB(
                rSum / count / 255,
                gSum / count / 255,
                bSum / count / 255
            );

            this.material.uniforms.u_colorB.value.setRGB(
                vibR / 255,
                vibG / 255,
                vibB / 255
            );
        };

        img.src = url;
    },

    setTheme(theme: boolean) {
        this.theme = theme;

        if (this.material) {
            this.material.uniforms.u_theme.value = theme;
        }
    }
};