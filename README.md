# Qwen 3.5 WebGPU + Three.js

A premium 3D chat interface powered by **Qwen 3.5-0.8B** running entirely in your browser via **WebGPU**.

![Interface Demo](https://raw.githubusercontent.com/avirads/qwen3.5-webgpu-threejs-demo/main/public/screenshot.png)

## ✨ Features
- **GPU Accelerated**: Runs locally on your hardware using Transformers.js v4 + WebGPU.
- **3D Visualization**: Floating holographic chat panel rendered with Three.js `CSS3DRenderer`.
- **Dynamic Background**: Interactive particle system that reacts to token generation.
- **Local Serving**: Designed to load model weights from the project folder for offline-ready performance.
- **Detailed Progress**: Real-time download/load percentage and TPS (Tokens Per Second) indicator.

## 🚀 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/avirads/qwen3.5-webgpu-threejs-demo.git
cd qwen3.5-webgpu-threejs-demo
npm install
```

### 2. Download Model Weights
Run the included PowerShell script to download the ONNX weights locally to `public/models/`.
```powershell
./download_model.ps1
```

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in a WebGPU-enabled browser (Chrome/Edge 113+).

## 🛠️ Tech Stack
- **Vite** + **TypeScript**
- **Three.js** (CSS3DRenderer & Particle System)
- **@huggingface/transformers** (v4/next)
- **Qwen 3.5 0.8B ONNX** (Quantized q4f16)

## 📦 Distributable
To create a standalone ZIP for sharing:
```bash
npm run build
# The 'dist' folder will contain the portable app
```

## 📜 License
MIT
