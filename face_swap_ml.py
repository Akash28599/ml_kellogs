
import cv2
import numpy as np
import onnxruntime
import sys
import os
import argparse

# --------------------------------------------------------------------------------
# RE-IMPLEMENTATION OF ROOP / INSIGHTFACE CORE LOGIC (Raw ONNX Runtime)
# --------------------------------------------------------------------------------

# Standard reference 5 points for 112x112 (ArcFace)
# Source: https://github.com/deepinsight/insightface/blob/master/python-package/insightface/utils/face_align.py
ARC_FACE_DST = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041]
], dtype=np.float32)

# Using MediaPipe for robustness since InsightFace detector is hard to install
try:
    import mediapipe as mp
except ImportError:
    print("MediaPipe required. pip install mediapipe")
    sys.exit(1)

class RoopCore:
    def __init__(self, use_gpu=False):
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if use_gpu else ['CPUExecutionProvider']
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        self.arcface_path = os.path.join(script_dir, "models", "w600k_r50.onnx")
        self.inswapper_path = os.path.join(script_dir, "models", "inswapper_128.onnx")

        # Load models
        print("Loading ArcFace (Analysis)...")
        self.arcface = onnxruntime.InferenceSession(self.arcface_path, providers=providers)
        print("Loading Inswapper (Swap)...")
        self.inswapper = onnxruntime.InferenceSession(self.inswapper_path, providers=providers)

        # MediaPipe Detection Setup
        base_options = mp.tasks.BaseOptions(model_asset_path=os.path.join(script_dir, "models", "face_landmarker.task"))
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1
        )
        self.detector = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def get_landmarks(self, img_bgr):
        """Standard MediaPipe to 5-point conversion."""
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result = self.detector.detect(mp_image)
        
        if not result.face_landmarks:
            return None
        
        lm = result.face_landmarks[0]
        h, w = img_bgr.shape[:2]
        
        # Consistent mapping: Left Eye, Right Eye, Nose, Left Mouth, Right Mouth
        # (Approximate mesh indices)
        indices = [468, 473, 1, 61, 291] 
        kps = np.array([[lm[i].x * w, lm[i].y * h] for i in indices], dtype=np.float32)
        return kps

    def norm_crop(self, img, landmark, image_size=112):
        """Standard InsightFace alignment transformation."""
        M = cv2.estimateAffinePartial2D(landmark, ARC_FACE_DST, method=cv2.LMEDS)[0]
        warped = cv2.warpAffine(img, M, (image_size, image_size), borderValue=0.0)
        return warped, M

    def get_embedding(self, face_img):
        """Get 512-D embedding from 112x112 face."""
        # Preprocess: Transpose, Expand, Normalize (-1 to 1)
        img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
        img = np.transpose(img, (2, 0, 1))
        img = np.expand_dims(img, axis=0)
        img = (img.astype(np.float32) - 127.5) / 128.0
        
        embed = self.arcface.run(None, {self.arcface.get_inputs()[0].name: img})[0]
        return embed / np.linalg.norm(embed) # Normalize

    def color_transfer(self, source, target):
        """Match source face color to target face color using LAB statistics."""
        # Convert to LAB
        s_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
        t_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
        
        # Compute stats
        s_mean, s_std = cv2.meanStdDev(s_lab)
        t_mean, t_std = cv2.meanStdDev(t_lab)
        
        s_mean = s_mean.flatten()
        s_std = s_std.flatten()
        t_mean = t_mean.flatten()
        t_std = t_std.flatten()
        
        # Avoid zero division
        s_std = np.clip(s_std, 1e-5, None)
        
        # Transfer
        for k in range(3):
            s_lab[:,:,k] = (s_lab[:,:,k] - s_mean[k]) * (t_std[k] / s_std[k]) + t_mean[k]
            
        s_lab = np.clip(s_lab, 0, 255).astype(np.uint8)
        return cv2.cvtColor(s_lab, cv2.COLOR_LAB2BGR)

    def apply_sharpening(self, img):
        """Apply unsharp mask to enhance details."""
        gaussian = cv2.GaussianBlur(img, (0, 0), 2.0)
        unsharp = cv2.addWeighted(img, 1.5, gaussian, -0.5, 0)
        return np.clip(unsharp, 0, 255).astype(np.uint8)

    def swap(self, source_path, target_path, output_path):
        source_img = cv2.imread(source_path)
        target_img = cv2.imread(target_path)
        
        # 1. Source Embedding
        src_kps = self.get_landmarks(source_img)
        if src_kps is None: return False
        
        align_src, _ = self.norm_crop(source_img, src_kps, 112)
        source_embed = self.get_embedding(align_src)
        
        # 2. Target Alignment (Roop style uses 128x128 for inswapper)
        tgt_kps = self.get_landmarks(target_img)
        if tgt_kps is None: return False
        
        # Scale affine matrix for 128x128
        dst_128 = ARC_FACE_DST * (128.0 / 112.0)
        M_128 = cv2.estimateAffinePartial2D(tgt_kps, dst_128, method=cv2.LMEDS)[0]
        
        align_tgt = cv2.warpAffine(target_img, M_128, (128, 128), borderValue=0.0)
        
        # 3. Predict Swap
        blob = cv2.cvtColor(align_tgt, cv2.COLOR_BGR2RGB)
        blob = np.transpose(blob, (2, 0, 1))
        blob = np.expand_dims(blob, axis=0).astype(np.float32) / 255.0
        
        # Inswapper inputs
        feed = {
            self.inswapper.get_inputs()[0].name: blob,
            self.inswapper.get_inputs()[1].name: source_embed
        }
        res_blob = self.inswapper.run(None, feed)[0]
        
        swapped = np.transpose(res_blob[0], (1, 2, 0)) * 255.0
        swapped = np.clip(swapped, 0, 255).astype(np.uint8)
        swapped = cv2.cvtColor(swapped, cv2.COLOR_RGB2BGR)
        
        # --- ENHANCEMENTS ---
        # 1. Color Transfer (Match Target Skin Tone)
        swapped = self.color_transfer(swapped, align_tgt)
        
        # 2. Sharpening (Compensate for 128x128 blur)
        swapped = self.apply_sharpening(swapped)
        
        # 4. Paste Back with Soft Mask (simulating InsightFace internal pasting)
        h, w = target_img.shape[:2]
        inv_M = cv2.invertAffineTransform(M_128)
        
        # Standard Square Mask logic (InsightFace native)
        mask = np.full((128, 128), 255, dtype=np.uint8)
        cv2.rectangle(mask, (0, 0), (128, 128), 0, 10) # Black border to remove artifacts
        mask = cv2.GaussianBlur(mask, (15, 15), 0)
        
        warped_face = cv2.warpAffine(swapped, inv_M, (w, h))
        warped_mask = cv2.warpAffine(mask, inv_M, (w, h))
        
        # Blend
        mask_f = warped_mask.astype(np.float32) / 255.0
        mask_f = np.expand_dims(mask_f, axis=2)
        
        final = (warped_face * mask_f + target_img * (1.0 - mask_f)).astype(np.uint8)
        
        cv2.imwrite(output_path, final)
        print(f"Saved: {output_path}")
        return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    
    roop = RoopCore()
    roop.swap(args.source, args.target, args.output)
