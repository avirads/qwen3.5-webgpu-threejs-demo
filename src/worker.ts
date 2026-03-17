import {
    AutoTokenizer,
    AutoModelForCausalLM,
    TextStreamer,
    env,
} from "@huggingface/transformers";

// --- CONFIGURATION ---
// Always use the full repository ID as the key for consistent caching
const MODEL_ID = "onnx-community/Qwen3.5-0.8B-ONNX";

// Enable browser-side persistent caching (Cache API)
env.useBrowserCache = true;

// Detection of environment
const IS_PROD = import.meta.env.MODE === 'production';

/**
 * Configure Transformers.js to prioritize local files if available, 
 * but allow remote download for the first-time setup.
 */
if (IS_PROD) {
    // In Production (GitHub Pages/Dist):
    // We allow remote models so it can download from HF Hub the 1st time.
    // Subsequent visits will load from the browser's Cache API automatically.
    env.allowRemoteModels = true;
    env.allowLocalModels = false; 
} else {
    // In Development:
    // We prefer the local /public/models/ folder for speed and offline dev.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = '/models/'; 
}

let model: any = null;
let tokenizer: any = null;

const progressCallback = (data: any) => {
    // Only send progress if it's actually downloading or loading
    self.postMessage({ type: "progress", ...data });
};

async function load() {
    try {
        const source = IS_PROD ? "Browser Cache / Cloud" : "Local Project Files";
        console.log(`Worker: Initializing Qwen 3.5 (Source: ${source})...`);
        
        self.postMessage({ 
            type: "progress", 
            status: "init", 
            message: "Verifying local engine cache..." 
        });

        if (!(navigator as any).gpu) {
            throw new Error("WebGPU is not supported by your browser in this context.");
        }

        // Initialize Tokenizer
        // Transformers.js will automatically check the browser's Cache API first.
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
            progress_callback: progressCallback,
        });

        // Initialize Model (WebGPU)
        // If the 600MB+ files are already in indexedDB/Cache, this will be nearly instant.
        model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
            device: "webgpu",
            dtype: "q4f16", 
            progress_callback: progressCallback,
        });

        console.log("Worker: Engine operational.");
        self.postMessage({ type: "ready" });
    } catch (error: any) {
        console.error("Worker Error:", error);
        self.postMessage({ 
            type: "progress", 
            status: "error", 
            message: `Engine Error: ${error.message}` 
        });
    }
}

async function generate(messages: any[]) {
    try {
        if (!model || !tokenizer) throw new Error("Model not ready");

        const input_ids = await tokenizer.apply_chat_template(messages, {
            add_generation_prompt: true,
            return_tensor: true,
        });

        let startTime: number;
        let numTokens = 0;

        const streamer = new TextStreamer(tokenizer, {
            skip_prompt: true,
            callback_function: (text: string) => {
                if (numTokens === 0) startTime = performance.now();
                numTokens++;
                const tps = numTokens / ((performance.now() - startTime) / 1000);
                self.postMessage({ type: "delta", text, tps });
            },
        });

        await model.generate({
            ...input_ids,
            streamer,
            max_new_tokens: 1024,
            do_sample: false,
        });

        self.postMessage({ type: "done" });
    } catch (error: any) {
        console.error("Worker Generation Error:", error);
        self.postMessage({ type: "done", error: error.message });
    }
}

self.onmessage = async (e) => {
    const { type, data } = e.data;
    if (type === "load") await load();
    if (type === "generate") await generate(data);
};
