import './style.css';
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

// --- UI Elements ---
const canvas = document.querySelector('#three-canvas') as HTMLCanvasElement;
const cssContainer = document.querySelector('#css3d-container') as HTMLDivElement;
const loadingScreen = document.querySelector('#loading-screen') as HTMLDivElement;
const progressFill = document.querySelector('#progress-fill') as HTMLDivElement;
const loadingText = document.querySelector('#loading-text') as HTMLParagraphElement;
const loadingPercentage = document.querySelector('#loading-percentage') as HTMLDivElement;
const interfaceTemplate = document.querySelector('#interface-template') as HTMLDivElement;

// --- State ---
let isGenerating = false;
let currentAIMessage: HTMLDivElement | null = null;
let currentThoughtEl: HTMLDivElement | null = null;
let currentContentEl: HTMLDivElement | null = null;
let fullResponse = "";
let isThinking = false;

// --- Three.js Setup ---
const scene = new THREE.Scene();
const cssScene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 800;

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// CSS3D Renderer
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssContainer.appendChild(cssRenderer.domElement);

// --- 3D Interface Elements ---
const clone = interfaceTemplate.firstElementChild!.cloneNode(true) as HTMLDivElement;
const cssObject = new CSS3DObject(clone);
cssObject.position.set(0, 0, 0);
cssScene.add(cssObject);

// Reference elements in the clone
const statusEl = clone.querySelector('#status') as HTMLDivElement;
const messagesEl = clone.querySelector('#messages') as HTMLDivElement;
const inputEl = clone.querySelector('#prompt-input') as HTMLTextAreaElement;
const sendBtn = clone.querySelector('#send-btn') as HTMLButtonElement;

// --- Background Particles ---
const particlesCount = 3000;
const positions = new Float32Array(particlesCount * 3);
const colors = new Float32Array(particlesCount * 3);

for (let i = 0; i < particlesCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;

    const mixedColor = new THREE.Color().setHSL(0.5 + Math.random() * 0.2, 0.8, 0.5);
    colors[i * 3] = mixedColor.r;
    colors[i * 3 + 1] = mixedColor.g;
    colors[i * 3 + 2] = mixedColor.b;
}

const particlesGeometry = new THREE.BufferGeometry();
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const particlesMaterial = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles);

// --- Animation ---
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) - 0.5;
    mouse.y = (e.clientY / window.innerHeight) - 0.5;
});

function animate(time: number) {
    requestAnimationFrame(animate);

    // Subtle parallax and rotation
    particles.rotation.y = time * 0.00005;

    const targetX = mouse.x * 100;
    const targetY = -mouse.y * 100;

    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    // CSS Object rotation for depth feel
    cssObject.rotation.y = mouse.x * 0.1;
    cssObject.rotation.x = -mouse.y * 0.1;

    // Pulse effect when generating
    if (isGenerating) {
        particlesMaterial.size = 4 + Math.sin(time * 0.01) * 2;
        cssObject.position.z = Math.sin(time * 0.005) * 20;
    } else {
        particlesMaterial.size = 4;
        cssObject.position.z = 0;
    }

    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
}
animate(0);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Worker Communication ---
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = (e) => {
    const { type, status, message, progress, text, tps } = e.data;

    switch (type) {
        case 'progress':
            if (status === 'progress' && progress !== undefined) {
                const p = Math.round(progress);
                progressFill.style.width = `${p}%`;
                loadingPercentage.innerText = `${p}%`;
                loadingText.innerText = `Loading from project folder...`;
            } else if (status === 'init' || status === 'initiate') {
                loadingText.innerText = message || "Initializing engine...";
            } else if (status === 'error') {
                loadingText.innerText = message;
            }
            break;

        case 'ready':
            loadingScreen.style.opacity = '0';
            setTimeout(() => loadingScreen.style.display = 'none', 800);
            statusEl.innerText = 'System Online';
            sendBtn.disabled = false;
            break;

        case 'delta':
            appendToken(text, tps);
            break;

        case 'done':
            finalizeGeneration();
            break;
    }
};

// --- Chat Logic ---
const chatHistory: any[] = [];

async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isGenerating) return;

    appendMessage('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';

    isGenerating = true;
    sendBtn.disabled = true;
    statusEl.innerText = 'Analyzing...';

    chatHistory.push({ role: 'user', content: text });
    createAIMessagePlaceholder();
    worker.postMessage({ type: 'generate', data: chatHistory });
}

function createAIMessagePlaceholder() {
    currentAIMessage = document.createElement('div');
    currentAIMessage.className = 'message ai';

    currentThoughtEl = document.createElement('div');
    currentThoughtEl.className = 'thought';
    currentThoughtEl.style.display = 'none';

    currentContentEl = document.createElement('div');
    currentContentEl.className = 'content';

    const tpsEl = document.createElement('div');
    tpsEl.className = 'tps-counter';
    tpsEl.id = 'tps-display';

    currentAIMessage.appendChild(currentThoughtEl);
    currentAIMessage.appendChild(currentContentEl);
    currentAIMessage.appendChild(tpsEl);

    messagesEl.appendChild(currentAIMessage);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    fullResponse = "";
    isThinking = false;
}

function appendToken(token: string, tps: number) {
    fullResponse += token;

    const tpsDisplay = currentAIMessage?.querySelector('#tps-display');
    if (tpsDisplay) {
        tpsDisplay.textContent = `${tps.toFixed(1)} tokens/sec`;
    }

    if (fullResponse.includes('<think>') && !isThinking) {
        isThinking = true;
        if (currentThoughtEl) currentThoughtEl.style.display = 'block';
    }

    if (fullResponse.includes('</think>') && isThinking) {
        isThinking = false;
    }

    if (isThinking) {
        let thoughtText = fullResponse.split('<think>')[1] || "";
        thoughtText = thoughtText.split('</think>')[0];
        if (currentThoughtEl) currentThoughtEl.innerText = thoughtText;
    } else {
        let contentText = fullResponse;
        if (fullResponse.includes('</think>')) {
            contentText = fullResponse.split('</think>')[1];
        } else if (fullResponse.includes('<think>')) {
            contentText = "";
        }
        if (currentContentEl) currentContentEl.innerText = contentText.trimStart();
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalizeGeneration() {
    isGenerating = false;
    sendBtn.disabled = false;
    statusEl.innerText = 'Ready';
    chatHistory.push({ role: 'assistant', content: fullResponse });
    currentAIMessage = null;
    currentThoughtEl = null;
    currentContentEl = null;
}

function appendMessage(role: string, text: string) {
    const msg = document.createElement('div');
    msg.className = `message ${role}`;
    msg.innerText = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = inputEl.scrollHeight + 'px';
});

// Initialize model load
worker.postMessage({ type: 'load' });
