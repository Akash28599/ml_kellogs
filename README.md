# Kellogg's Mother's Day Campaign - Backend

A Node.js/Express backend API for the Mother's Day superhero face-swap campaign.

## 🚀 Quick Start

### 1. Install Node.js dependencies
```bash
npm install
```

### 2. Install Python dependencies (for face swap)
```bash
pip install -r requirements.txt
```

Or for basic functionality:
```bash
pip install opencv-python pillow numpy
```

### 3. Add Template Images ⚠️ IMPORTANT
Copy your superhero template images to the `templates/` folder:

| Filename | Theme |
|----------|-------|
| `captain_early_riser.png` | Time Champion |
| `juggling_genius.png` | Multi-Tasker |
| `kitchen_commander.png` | MasterChef |
| `professor_patience.png` | Homework Hero |
| `dream_defender.png` | Bedtime Guardian |

**Note**: Template images should have a clear, visible face area for face swapping to work properly.

### 4. Run the Server
```bash
npm run dev
```

Server runs on: `http://localhost:5000`

## 📁 Project Structure

```
├── server.js          # Main Express server
├── face_swap.py       # Python face swap script
├── requirements.txt   # Python dependencies
├── .env               # Environment configuration
├── templates/         # Superhero template images ← ADD IMAGES HERE
├── uploads/           # User uploaded photos
├── results/           # Generated result images
└── models/            # AI models (auto-downloaded)
```

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/themes` | GET | Get all available themes |
| `/api/upload` | POST | Upload a photo |
| `/api/face-swap` | POST | Perform face swap |
| `/api/download/:file` | GET | Download result image |
| `/api/health` | GET | Server health check |

## 🖼️ Face Swap Methods

The system supports multiple face swap methods:

1. **InsightFace (Best Quality)**: Uses AI-powered face swapping
   - Requires: `pip install insightface onnxruntime`
   - Automatically downloads AI model on first use

2. **Composite (Fallback)**: Basic face overlay
   - Requires: `pip install opencv-python pillow`
   - Works without AI models

3. **Demo Mode**: If Python isn't available
   - Returns the template image as a placeholder
   - Good for UI testing

## ⚙️ Configuration

Edit `.env` file:
```env
PORT=5000
FRONTEND_URL=http://localhost:5173
PYTHON_PATH=python
```

## 📝 Notes

- **Local Storage**: All files are stored locally in `uploads/` and `results/`
- **No API Keys Needed**: Face swap runs entirely locally
- **Python Required**: For face swapping, Python 3.8+ is required
- **GPU Acceleration**: Install `onnxruntime-gpu` for faster processing

## 🐛 Troubleshooting

**"No face detected"**: Ensure the uploaded photo has a clear, front-facing face.

**"Template not found"**: Add template images to the `templates/` folder.

**Python not found**: Set `PYTHON_PATH` in `.env` to your Python executable path.

## License

Proprietary - Kellogg's internal use only
