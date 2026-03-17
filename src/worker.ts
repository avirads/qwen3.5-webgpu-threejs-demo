import {
    AutoTokenizer,
    AutoModelForCausalLM, // AutoModelForCausalLM should resolve to Qwen3_5ForCausalLM or similar
    TextStreamer,
    env,
} from "@huggingface/transformers";

// CONFIGURE TRANSFORMERS.JS TO USE LOCAL ASSETS
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/'; // Absolute path relative to URL root

const MODEL_ID = "qwen3.5-0.8b";

/** @type {AutoModelForCausalLM} */
let model: any = null;
/** @type {AutoTokenizer} */
let tokenizer: any = null;

const progressCallback = (data: any) => {
    self.postMessage({ type: "progress", ...data });
};

async function load() {
    try {
        console.log("Worker: Loading Qwen 3.5 from project models...");
        self.postMessage({ type: "progress", status: "init", message: "Loading local engine..." });

        if (!(navigator as any).gpu) {
            throw new Error("WebGPU is not supported by your browser in this context.");
        }

        console.log("Worker: Initializing tokenizer...");
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
            progress_callback: progressCallback,
        });

        console.log("Worker: Initializing model (WebGPU)...");
        // We use AutoModelForCausalLM which is usually what the community ONNX weights target
        model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
            device: "webgpu",
            dtype: "q4f16", 
            progress_callback: progressCallback,
        });

        console.log("Worker: Local Qwen 3.5 ready!");
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
            do_sample: false, // Greedy search for faster performance
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
