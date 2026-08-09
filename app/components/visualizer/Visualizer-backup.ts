import "./style/style.css";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default {
  audioCtx: null as AudioContext | null,
  render() {
    return `
      <div class="visualizer">
        <div class="switch-container">
          <label class="switch">
            <input type="checkbox">
            <span class="slider round"></span>
          </label>
        </div>

        <audio id="audioPlayer" hidden controls>
          <source src="/app/assets/girlEDM.mp3" type="audio/mpeg">
        </audio>

        <canvas id="oscilloscope" width="600" height="200"></canvas>
      </div>
    `;
  },

  init() {
    //INIT AUDIO AND THREE.JS
    const audioPlayer = document.getElementById("audioPlayer") as HTMLAudioElement;
    const switchInput = document.querySelector(".switch input") as HTMLInputElement;
    this.initializeThreeAndAudio();
    switchInput.addEventListener("change", async () => {
      if (switchInput.checked) {
        if (this.audioCtx?.state === "suspended") {
          await this.audioCtx.resume();
        }
        await audioPlayer.play();
      } else {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
      }
    });
  },

  initializeThreeAndAudio() {
    // ----------------------------------------------- THREE.JS INITIALIZATION
    // Initialize Three.js scene, camera, renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 10);  // camera back a bit from origin
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    // Add OrbitControls for camera rotation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;
    controls.enableZoom = false; // lock zoom for a more fixed view

    // -----------------------------------------------SHADER MESH
    const outerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        audioLevel: { value: 0 },            // this will be updated each frame
        distortion: { value: 1.0 },
        color: { value: new THREE.Color(0xff4e42) }  // a reddish-orange base color
      },
      wireframe: true,
      transparent: true,
      vertexShader: `
        uniform float time;
        uniform float audioLevel;
        uniform float distortion;
        varying vec3 vNormal;
        varying vec3 vPosition;

        // Ashima Arts simplex noise (https://github.com/ashima/webgl-noise)
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);

          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);

          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;

          i = mod289(i);
          vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;

          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);

          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);

          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);

          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));

          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);

          vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }

        void main() {
          // Start with the original position
          vec3 pos = position;
          // Calculate procedural noise value for this vertex (using its position and time)
          float noise = snoise(pos * 0.5 + vec3(0.0, 0.0, time * 0.3));
          // Displace vertex along its normal
          pos += normal * noise * distortion * (1.0 + audioLevel);

          vNormal = normal;
          vPosition = pos;

          // Standard transformation
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float audioLevel;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          // Calculate fresnel (view-angle dependent) term
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = 1.0 - max(0.0, dot(viewDir, vNormal));
          fresnel = pow(fresnel, 2.0 + audioLevel * 2.0);
          // Make the fragment color brighter on edges (fresnel) and pulse it slightly with time
          float pulse = 0.8 + 0.2 * sin(time * 2.0);
          vec3 emissiveColor = color * fresnel * pulse * (1.0 + audioLevel * 0.8);
          // Alpha fade out a bit when audio is high (to make spikes more ethereal)
          float alpha = fresnel * (0.7 - audioLevel * 0.3);
          gl_FragColor = vec4(emissiveColor, alpha);
        }
      `
    });

    const outerGeometry = new THREE.IcosahedronGeometry(3, 12);
    const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
    scene.add(outerMesh);

    // -----------------------------------------------AUDIO INITIALIZATION
    this.audioCtx = new AudioContext();
    const audioCtx = this.audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const audio = document.getElementById("audioPlayer") as HTMLAudioElement;
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    // -----------------------------------------------ANIMATION LOOP
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const sensitivity = 1.0; // This can be adjusted via a UI slider
    const clock = new THREE.Clock();

    animate();

    function animate() {
      requestAnimationFrame(animate);

      // ... update Three.js controls, etc.
      controls.update();

      let audioLevel = 0;
      if (analyser) {
        analyser.getByteFrequencyData(frequencyData);
        // Compute an average volume level from frequency data
        let sum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
          sum += frequencyData[i];
        }
        const average = sum / frequencyData.length;
        audioLevel = average / 255;  // normalize to 0.0–1.0
        // Apply a sensitivity scaling (from a UI slider) 
        audioLevel *= (sensitivity / 5.0);
        // Now audioLevel represents the intensity of the music (0 = silence, ~1 = very loud)
      }

      outerMaterial.uniforms.time.value = clock.getElapsedTime();
      outerMaterial.uniforms.audioLevel.value = audioLevel;
      outerMesh.rotation.y += 0.002 + audioLevel * 0.05; // spin faster with the music

      renderer.render(scene, camera);
    }
  },
};