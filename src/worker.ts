import {
    AutoTokenizer,
    AutoModelForCausalLM,
    TextStreamer,
    env,
} from "@huggingface/transformers";

// Detection of built/production environment
// @ts-ignore - Vite will replace this at build time
const IS_PROD = import.meta.env.MODE === 'production';

// In production (GitHub Pages), we fetch from Hugging Face Hub directly
// In development, we use the local files served from /models/
const MODEL_ID = IS_PROD ? "onnx-community/Qwen3.5-0.8B-ONNX" : "qwen3.5-0.8b";

// CONFIGURE TRANSFORMERS.JS
if (IS_PROD) {
    env.allowRemoteModels = true;
    env.allowLocalModels = false; // Prevents looking in the 'dist' folder for weights on GitHub Pages
} else {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = '/models/'; // Path relative to public root in dev
}

/** @type {AutoModelForCausalLM} */
let model: any = null;
/** @type {AutoTokenizer} */
let tokenizer: any = null;

const progressCallback = (data: any) => {
    self.postMessage({ type: "progress", ...data });
};

async function load() {
    try {
        console.log(`Worker: Loading Qwen 3.5 (${IS_PROD ? 'Hub' : 'Local'})...`);
        self.postMessage({ 
            type: "progress", 
            status: "init", 
            message: IS_PROD ? "Fetching model from Cloud..." : "Loading project engine..." 
        });

        if (!(navigator as any).gpu) {
            throw new Error("WebGPU is not supported by your browser in this context.");
        }

        console.log("Worker: Initializing tokenizer...");
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
            progress_callback: progressCallback,
        });

        console.log("Worker: Initializing model (WebGPU)...");
        model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
            device: "webgpu",
            dtype: "q4f16", 
            progress_callback: progressCallback,
        });

        console.log("Worker: Qwen 3.5 ready!");
        self.postMessage({ type: "ready" });
    } catch (error: any) {
        console.error("Worker Error details:", error);
        self.postMessage({ 
            type: "progress", 
            status: "error", 
            message: `Engine Error: ${error.message || "Unknown error occurred"}` 
        });
    }
}

async function generate(messages: any[]) {
    try {
        if (!model || !tokenizer) {
            throw new Error("Model not ready");
        }

        const input_ids = await tokenizer.apply_chat_template(messages, {
            add_generation_prompt: true,
            return_tensor: true,
        });

        let startTime: number;
        let numTokens = 0;

        const streamer = new TextStreamer(tokenizer, {
            skip_prompt: true,
            callback_function: (text: string) => {
                if (numTokens === 0) {
                    startTime = performance.now();
                }
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

    switch (type) {
        case "load":
            await load();
            break;
        case "generate":
            await generate(data);
            break;
    }
};
