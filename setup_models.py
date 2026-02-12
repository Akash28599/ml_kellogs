import os
import requests
import sys

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

MODELS = {
    "inswapper_128.onnx": "https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx",
    "w600k_r50.onnx": "https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/w600k_r50.onnx"
}

def download_file(url, filepath):
    if os.path.exists(filepath):
        print(f"✅ {os.path.basename(filepath)} already exists.")
        return

    print(f"⬇️ Downloading {os.path.basename(filepath)}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        total_size = int(response.headers.get('content-length', 0))
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        print(f"✅ Downloaded {os.path.basename(filepath)}")
    except Exception as e:
        print(f"❌ Failed to download {os.path.basename(filepath)}: {e}")
        if os.path.exists(filepath):
            os.remove(filepath)

if __name__ == "__main__":
    if not os.path.exists(MODELS_DIR):
        os.makedirs(MODELS_DIR)

    print("🚀 Setting up AI Models...")
    for name, url in MODELS.items():
        download_file(url, os.path.join(MODELS_DIR, name))
    print("✨ Model setup complete.")
