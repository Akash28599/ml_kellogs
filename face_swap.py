"""
InsightFace InSwapper Face Swap
================================

High-quality face swap using:
- InsightFace (buffalo_l) for detection + embeddings
- InSwapper 128 ONNX model for identity transfer

Usage:
    python face_swap_inswapper.py \
        --source selfie.jpg \
        --target template.jpg \
        --output result.png

Requirements:
    pip install insightface==0.7.3
    pip install onnxruntime-gpu   # if GPU
    OR
    pip install onnxruntime       # if CPU
    pip install opencv-python
"""

import os
import sys
import cv2
import argparse
import insightface
from insightface.app import FaceAnalysis
from insightface.model_zoo import get_model


class FaceSwapPipeline:
    def __init__(self, use_gpu=True):
        print("===========================================")
        print("  InsightFace InSwapper - Initializing")
        print("===========================================")

        ctx_id = 0 if use_gpu else -1

        # Load detection + recognition model
        self.app = FaceAnalysis(name='buffalo_l')
        self.app.prepare(ctx_id=ctx_id, det_size=(640, 640))

        # Load InSwapper model
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'inswapper_128.onnx')
        self.swapper = get_model(
            model_path,
            download=False,
            download_zip=False
        )

        print("Models loaded successfully.\n")

    def swap(self, source_path, target_path, output_path):
        print("Reading images...")

        src_img = cv2.imread(source_path)
        tgt_img = cv2.imread(target_path)

        if src_img is None:
            print("Cannot load source image.")
            return False

        if tgt_img is None:
            print("Cannot load target image.")
            return False

        print("Detecting faces...")

        src_faces = self.app.get(src_img)
        tgt_faces = self.app.get(tgt_img)

        if len(src_faces) == 0:
            print("No face detected in source image.")
            return False

        if len(tgt_faces) == 0:
            print("No face detected in target image.")
            return False

        print(f"Source faces detected: {len(src_faces)}")
        print(f"Target faces detected: {len(tgt_faces)}")

        # Use first source face
        src_face = src_faces[0]

        result = tgt_img.copy()

        # Swap onto all detected faces in target
        for i, tgt_face in enumerate(tgt_faces):
            print(f"Swapping face {i + 1}...")
            result = self.swapper.get(
                result,
                tgt_face,
                src_face,
                paste_back=True
            )

        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        cv2.imwrite(output_path, result)

        print("\nSUCCESS")
        print(f"Saved to: {output_path}")
        print("===========================================\n")

        return True


def main():
    parser = argparse.ArgumentParser(description="InsightFace InSwapper Face Swap")
    parser.add_argument("--source", required=True, help="Path to source face image")
    parser.add_argument("--target", required=True, help="Path to target template image")
    parser.add_argument("--output", required=True, help="Path to save result image")
    parser.add_argument("--cpu", action="store_true", help="Force CPU mode")
    args = parser.parse_args()

    use_gpu = not args.cpu

    pipeline = FaceSwapPipeline(use_gpu=use_gpu)

    success = pipeline.swap(args.source, args.target, args.output)

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
