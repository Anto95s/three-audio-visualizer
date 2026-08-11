import "./style/style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { tracklist } from "../../utils/tracks";
import LiquidBackground from "../LiquidBackground/LiquidBackground";

// unlit shader: base texture + a holographic rainbow sweep and a moving sun-flare streak
const holoVertexShader = `
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

const holoFragmentShader = `
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

    // faint diagonal rainbow sheen, like light shifting across a laminated card
    float diag = vUv.x + vUv.y + uTime * 0.15;
    vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (diag + vec3(0.0, 0.33, 0.67)));

    // soft round sun-flare drifting across the surface, no hard edges
    vec2 flareCenter = vec2(0.5 + 0.5 * sin(uTime * 0.3), 0.5 + 0.5 * cos(uTime * 0.23));
    float flare = pow(smoothstep(0.4, 0.0, distance(vUv, flareCenter)), 2.0);

    vec3 holo = rainbow * fresnel * 0.12 + vec3(1.0) * flare * (0.25 + uBass * 0.35);
    vec3 finalColor = texColor.rgb + holo;

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

export default {
  audioCtx: null as AudioContext | null,
  analyser: null as AnalyserNode | null,
  freqData: null as Uint8Array<ArrayBuffer> | null,
  audioEl: null as HTMLAudioElement | null,
  audioSrc: tracklist[0].audioSrc, //default to first track in tracklist
  audioImgSrc: tracklist[0].albumCover, //default to first track in tracklist
  smoothedBass: 0, // eased bass level, avoids jittery cube movement
  holoUniforms: null as null | { map: { value: THREE.Texture }; uTime: { value: number }; uBass: { value: number } },


  render() {
    return `
    ${LiquidBackground.render()}
      <div class="visualizer cube-wrapper"></div>
      <div class="track-select">
      <select id="track-select" aria-label="Select track">
        ${tracklist
        .map(
          (track, index) =>
            `<option value="${index}">${track.title}</option>`
        )
        .join("")}
      </select>
      </div>
      <div class="audio-player">
        <div class="audio-controls">
          <button id="play-btn" aria-label="Play">▶</button>
          <button id="pause-btn" aria-label="Pause">⏸</button>
          <button id="stop-btn" aria-label="Stop">⏹</button>
          <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="0.2" aria-label="Volume">
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
      </div>
    `;
  },

  init() {
    this.initAudio();
    this.initThree();
    this.initPlayerControls();
    LiquidBackground.init(true, this.analyser!, this.audioImgSrc);
  },

  playTrack(index: number) {
    const track = tracklist[index];
    if (!this.audioEl || !track) return;

    this.audioSrc = track.audioSrc;
    this.audioImgSrc = track.albumCover;

    this.audioEl.src = track.audioSrc;
    this.audioEl.load();
    this.audioCtx?.resume();
    this.audioEl.play();

    // swaps the cube texture to match the newly selected track's cover
    if (this.holoUniforms) {
      new THREE.TextureLoader().load(track.albumCover, (texture) => {
        this.holoUniforms!.map.value = texture;
      });
    }

    LiquidBackground.setCoverColors(track.albumCover);
  },

  // sets up analyser node for bass-reactive animation
  initAudio() {
    const audioEl = new Audio(this.audioSrc);
    audioEl.loop = true;
    this.audioEl = audioEl;

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx: AudioContext = new AudioContextCtor();
    const source = audioCtx.createMediaElementSource(audioEl);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    this.audioCtx = audioCtx;
    this.analyser = analyser;
    // ArrayBuffer (not SharedArrayBuffer) required to satisfy AnalyserNode typings
    this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  },

  // wires play/pause/stop buttons and a seekable/draggable progress bar
  initPlayerControls() {
    const audioEl = this.audioEl!;
    const player = document.querySelector(".audio-player")!;
    const playBtn = document.getElementById("play-btn")!;
    const pauseBtn = document.getElementById("pause-btn")!;
    const stopBtn = document.getElementById("stop-btn")!;
    const progressFill = document.getElementById("progress-fill")!;
    const volume = document.getElementById("volume-slider") as HTMLInputElement;

    const trackSelect = document.getElementById("track-select") as HTMLSelectElement;

    trackSelect.addEventListener("change", () => {
      const index = Number(trackSelect.value);
      this.playTrack(index);
    });

    playBtn.addEventListener("click", () => {
      this.audioCtx?.resume();
      audioEl.play();
    });
    pauseBtn.addEventListener("click", () => audioEl.pause());
    stopBtn.addEventListener("click", () => {
      audioEl.pause();
      audioEl.currentTime = 0;
    });
    audioEl.addEventListener("play", () =>
      player.classList.add("is-playing")
    );
    audioEl.addEventListener("pause", () =>
      player.classList.remove("is-playing")
    );
    audioEl.addEventListener("ended", () =>
      player.classList.remove("is-playing")
    );
    audioEl.addEventListener("timeupdate", () => {
      const pct = (audioEl.currentTime / audioEl.duration) * 100 || 0;
      progressFill.style.width = `${pct}%`;
    });
    audioEl.volume = Number(volume.value);
    volume.addEventListener("input", () => {
      audioEl.volume = Number(volume.value);
    });


    // click-and-drag seeking on the progress bar
    const seekFromEvent = (clientX: number) => {
      const progressBar = document.querySelector(".progress-bar") as HTMLElement;
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      if (audioEl.duration) audioEl.currentTime = pct * audioEl.duration;
    };
    const progressBar = document.querySelector(".progress-bar") as HTMLElement;
    progressBar.addEventListener("mousedown", (e) => {
      seekFromEvent(e.clientX);
      const onMove = (ev: MouseEvent) => seekFromEvent(ev.clientX);
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  },

  initThreeElements(scene: THREE.Scene) {
    const geometry = new THREE.BoxGeometry(8, 8, 8);

    // 1x1 white placeholder keeps the mesh visible before the album texture loads
    const placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    placeholder.needsUpdate = true;

    const holoUniforms = {
      map: { value: placeholder as THREE.Texture },
      uTime: { value: 0 },
      uBass: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: holoUniforms,
      vertexShader: holoVertexShader,
      fragmentShader: holoFragmentShader,
    });

    const cube = new THREE.Mesh(geometry, material);

    cube.rotation.set(0.4, 0.2, 0);
    scene.add(cube);

    const loader = new THREE.TextureLoader();

    loader.load(this.audioImgSrc, (texture) => {
      holoUniforms.map.value = texture;
    });

    this.holoUniforms = holoUniforms;

    const light = new THREE.PointLight(0xffffff, 5000);
    light.position.set(-10, 15, 50);
    scene.add(light);

    return { cube, holoUniforms };
  },

  initThree() {
    const WIDTH = window.innerWidth;
    const HEIGHT = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0xffffff, 1);
    renderer.setSize(WIDTH, HEIGHT);
    // caps pixel ratio to avoid overloading the GPU on high-DPI mobile screens
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      WIDTH / HEIGHT
    );
    camera.position.z = 50;
    scene.add(camera);
    const { cube, holoUniforms } = this.initThreeElements(scene);

    // keeps canvas and camera aspect correct on mobile/orientation changes
    window.addEventListener("resize", () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
    });

    const analyser = this.analyser!;
    const freqData = this.freqData!;
    const clock = new THREE.Clock();

    const render = () => {
      requestAnimationFrame(render);
      analyser.getByteFrequencyData(freqData);
      // bass = low-frequency bins average, the cube's main music input
      const bassBins = freqData.slice(0, 8);
      const bassAvg = bassBins.reduce((sum, v) => sum + v, 0) / bassBins.length;
      const bassNorm = bassAvg / 255;
      // lerp toward the live bass value so the pulse feels smooth, not jumpy
      this.smoothedBass += (bassNorm - this.smoothedBass) * 0.8;
      const pulse = 0.8 + this.smoothedBass * 1.5;
      cube.scale.set(pulse, pulse, pulse);

      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;

      // drives the rainbow flow and sun-flare sweep on the mesh shader
      holoUniforms.uTime.value = clock.getElapsedTime();
      holoUniforms.uBass.value = this.smoothedBass;

      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.zIndex = "1";
      renderer.render(scene, camera);
    };

    render();
  },
};