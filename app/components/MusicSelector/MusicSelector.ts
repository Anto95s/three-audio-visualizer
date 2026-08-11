import "./style/style.css";
import { tracklist } from "../../utils/tracks";
import Visualizer from "../Visualizer/Visualizer";

const iconPlay = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
const iconPause = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>`;
const iconPrev = `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="5" y="5" width="2.5" height="14" fill="currentColor"/><path d="M19 6v12l-9.5-6z" fill="currentColor"/></svg>`;
const iconNext = `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="16.5" y="5" width="2.5" height="14" fill="currentColor"/><path d="M5 6v12l9.5-6z" fill="currentColor"/></svg>`;
const iconStop = `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg>`;
const iconVolume = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 10v4h4l5 5V5L7 10H3z" fill="currentColor"/><path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v8.06c1.5-.74 2.5-2.26 2.5-4.03z" fill="currentColor"/><path d="M14 4.02v2.06c2.89.86 5 3.54 5 6.92s-2.11 6.06-5 6.92v2.06c4.01-.91 7-4.49 7-8.98s-2.99-8.07-7-8.98z" fill="currentColor"/></svg>`;

export default {
    currentIndex: 0,

    render() {
        return `
            <div class="music-selector">
                <div class="track-carousel" id="track-carousel">
                    ${tracklist
                .map(
                    (track, index) => `
                        <div class="track-card" data-index="${index}">
                            <img src="${track.albumCover}" alt="${track.title}" />
                            <button class="track-play-overlay" aria-label="Play ${track.title}">
                                <svg viewBox="0 0 24 24" width="36" height="36"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
                            </button>
                            <div class="track-card-info">
                                <p class="track-card-title">${track.title}</p>
                            </div>
                        </div>
                    `
                )
                .join("")}
                </div>

                <div class="player-pill">
                    <div class="player-controls">
                        <button id="prev-btn" aria-label="Previous">${iconPrev}</button>
                        <button id="play-pause-btn" aria-label="Play">${iconPlay}</button>
                        <button id="next-btn" aria-label="Next">${iconNext}</button>
                        <button id="stop-btn" aria-label="Stop">${iconStop}</button>
                    </div>

                    <div class="player-track-info">
                        <img id="player-cover" src="${tracklist[0].albumCover}" alt="" />
                        <div class="player-track-text">
                            <p id="player-title">${tracklist[0].title}</p>
                            <div class="progress-bar">
                                <div class="progress-fill" id="progress-fill"></div>
                            </div>
                        </div>
                    </div>

                    <div class="volume-control">
                        ${iconVolume}
                        <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="0.2" aria-label="Volume" />
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        const audioEl = Visualizer.audioEl!;

        const carousel = document.getElementById("track-carousel")!;
        const cards = Array.from(carousel.querySelectorAll<HTMLElement>(".track-card"));
        const playPauseBtn = document.getElementById("play-pause-btn")!;
        const prevBtn = document.getElementById("prev-btn")!;
        const nextBtn = document.getElementById("next-btn")!;
        const stopBtn = document.getElementById("stop-btn")!;
        const volume = document.getElementById("volume-slider") as HTMLInputElement;
        const progressFill = document.getElementById("progress-fill") as HTMLElement;
        const progressBar = document.querySelector(".progress-bar") as HTMLElement;
        const playerCover = document.getElementById("player-cover") as HTMLImageElement;
        const playerTitle = document.getElementById("player-title")!;

        const total = tracklist.length;

        // shortest signed distance from the focused card, wrapping around the ends
        const distanceFrom = (index: number) => {
            let diff = index - this.currentIndex;

            if (diff > total / 2) diff -= total;
            if (diff < -total / 2) diff += total;

            return diff;
        };

        const layoutCarousel = () => {
            cards.forEach((card, index) => {
                const diff = distanceFrom(index);
                const abs = Math.abs(diff);
                const visible = abs <= 2;

                const scale = 1 - Math.min(abs, 2) * 0.18;
                const translateX = diff * 190;
                const rotateY = diff * -8;

                card.style.transform = `translate(-50%, -50%) translateX(${translateX}px) scale(${visible ? scale : 0.5}) rotateY(${rotateY}deg)`;
                card.style.opacity = visible ? `${1 - abs * 0.3}` : "0";
                card.style.zIndex = `${10 - abs}`;
                card.style.filter = diff === 0 ? "none" : `blur(${abs * 1.2}px) brightness(${1 - abs * 0.12})`;
                card.style.pointerEvents = visible ? "auto" : "none";
                card.classList.toggle("is-active", diff === 0);
            });
        };

        const focusTrack = (index: number) => {
            this.currentIndex = (index + total) % total;
            layoutCarousel();
        };

        const playFocusedTrack = () => {
            const track = tracklist[this.currentIndex];

            playerCover.src = track.albumCover;
            playerTitle.textContent = track.title;

            Visualizer.playTrack(this.currentIndex);
        };

        carousel.addEventListener("click", (e) => {
            const card = (e.target as HTMLElement).closest<HTMLElement>(".track-card");
            if (!card) return;

            const index = Number(card.dataset.index);

            if (index === this.currentIndex) playFocusedTrack();
            else {
                focusTrack(index);
                // update visualizer/player selection without autoplay
                Visualizer.selectTrack(this.currentIndex, !audioEl.paused);
                playerCover.src = tracklist[this.currentIndex].albumCover;
                playerTitle.textContent = tracklist[this.currentIndex].title;
            }
        });

        playPauseBtn.addEventListener("click", () => {
            if (!audioEl.paused) {
                audioEl.pause();
                return;
            }

            if (!audioEl.src) playFocusedTrack();
            else {
                Visualizer.audioCtx?.resume();
                audioEl.play();
            }
        });

        prevBtn.addEventListener("click", () => {
            focusTrack(this.currentIndex - 1);
            playerCover.src = tracklist[this.currentIndex].albumCover;
            playerTitle.textContent = tracklist[this.currentIndex].title;
            Visualizer.selectTrack(this.currentIndex, !audioEl.paused);
        });

        nextBtn.addEventListener("click", () => {
            focusTrack(this.currentIndex + 1);
            playerCover.src = tracklist[this.currentIndex].albumCover;
            playerTitle.textContent = tracklist[this.currentIndex].title;
            Visualizer.selectTrack(this.currentIndex, !audioEl.paused);
        });

        stopBtn.addEventListener("click", () => {
            audioEl.pause();
            audioEl.currentTime = 0;
        });

        audioEl.addEventListener("play", () => (playPauseBtn.innerHTML = iconPause));
        audioEl.addEventListener("pause", () => (playPauseBtn.innerHTML = iconPlay));

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
            const rect = progressBar.getBoundingClientRect();
            const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);

            if (audioEl.duration) audioEl.currentTime = pct * audioEl.duration;
        };

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

        progressBar.addEventListener("touchstart", (e) => {
            seekFromEvent(e.touches[0].clientX);
        });

        progressBar.addEventListener("touchmove", (e) => {
            seekFromEvent(e.touches[0].clientX);
        });

        layoutCarousel();
    }
};
