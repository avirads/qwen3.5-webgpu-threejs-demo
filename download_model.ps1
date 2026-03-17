$baseUrl = "https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX/resolve/main"
$destDir = "public/models/qwen3.5-0.8b"

$files = @(
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json"
)

$onnxFiles = @(
    "decoder_model_merged_q4f16.onnx",
    "decoder_model_merged_q4f16.onnx_data",
    "embed_tokens_q4f16.onnx",
    "embed_tokens_q4f16.onnx_data"
)

foreach ($file in $files) {
    echo "Downloading $file..."
    Invoke-WebRequest -Uri "$baseUrl/$file" -OutFile "$destDir/$file"
}

foreach ($file in $onnxFiles) {
    echo "Downloading onnx/$file..."
    Invoke-WebRequest -Uri "$baseUrl/onnx/$file" -OutFile "$destDir/onnx/$file"
}

echo "All downloads complete!"
