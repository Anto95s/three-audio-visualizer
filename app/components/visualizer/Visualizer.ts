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

    // -----------------------------------------------AUDIO INITIALIZATION
    this.audioCtx = new AudioContext();
    const audioCtx = this.audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const audio = document.getElementById("audioPlayer") as HTMLAudioElement;
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
};