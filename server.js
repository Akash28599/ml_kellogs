
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/results', express.static(path.join(__dirname, 'results')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// Ensure directories exist
const dirs = ['uploads', 'results', 'templates', 'models'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

// DYNAMIC THEME LOADER
// Scan templates folder for images and generate themes on the fly
app.get('/api/themes', (req, res) => {
  const templatesDir = path.join(__dirname, 'templates');

  // Default fallback if folder missing
  const defaultThemes = [{
    id: 'captain_early_riser',
    title: 'Captain Early Riser',
    subtitle: 'Hero of Morning Routines',
    template: 'captain_early_riser.png'
  }];

  if (!fs.existsSync(templatesDir)) {
    return res.json({ success: true, themes: defaultThemes });
  }

  // Read all files in templates directory
  fs.readdir(templatesDir, (err, files) => {
    if (err) {
      console.error("Error reading templates:", err);
      return res.json({ success: true, themes: defaultThemes });
    }

    // Filter for images (jpg, jpeg, png)
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));

    if (imageFiles.length === 0) {
      return res.json({ success: true, themes: defaultThemes });
    }

    // Generate dynamic themes from filenames
    const dynamicThemes = imageFiles.map((file) => {
      // Remove extension
      const nameWithoutExt = file.replace(/\.(jpg|jpeg|png)$/i, '');

      // Convert "The_Cheerleader-in-Chief" -> "The Cheerleader in Chief"
      // Replace underscores/hyphens with spaces
      let title = nameWithoutExt.replace(/[_-]/g, ' ');

      // Capitalize Words (Simple implementation)
      function capitalize(str) {
        return str.replace(/\b\w/g, l => l.toUpperCase());
      }
      title = capitalize(title);

      // Create flexible ID
      const id = nameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, '-');

      return {
        id: id,
        name: title,
        title: title,
        subtitle: 'Super Mom Power',
        description: 'Celebrating the amazing strength of mothers everywhere.',
        template: file,
        color: '#E41E26', // Kellogg's Red default
        templateUrl: `/templates/${file}`,
        templateExists: true
      };
    });

    res.json({ success: true, themes: dynamicThemes });
  });
});

// Get single theme
app.get('/api/themes/:id', (req, res) => {
  const themeId = req.params.id;

  // Construct filenames to check
  const pngPath = path.join(__dirname, 'templates', `${themeId}.png`);
  const jpgPath = path.join(__dirname, 'templates', `${themeId}.jpg`);

  let chosenFile = null;
  // Try to find the file based on ID
  // IF ID is "captian-early-riser", look for "captian_early_riser.png" (fuzzy match needed?)
  // Actually, let's keep it simple: assume ID matches filename roughly. But since we sanitize ID, we might lose info.

  // Better approach: Scan dir for matching sanitized ID again!
  try {
    const templatesDir = path.join(__dirname, 'templates');
    const files = fs.readdirSync(templatesDir);
    const match = files.find(f => {
      const idFromF = f.replace(/\.(jpg|jpeg|png)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
      return idFromF === themeId;
    });

    if (match) chosenFile = match;
  } catch (e) {
    console.error(e);
  }

  if (!chosenFile) {
    return res.status(404).json({ success: false, message: 'Theme not found' });
  }

  res.json({
    success: true,
    theme: {
      id: themeId,
      template: chosenFile,
      templateUrl: `/templates/${chosenFile}`,
      templateExists: true
    }
  });
});

// Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        path: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
});

// Python Availability Check
let PYTHON_AVAILABLE = false;

const checkPythonAvailability = () => {
  const pythonPath = process.env.PYTHON_PATH || 'python';
  // Check if python exists and has insightface (our core requirement)
  const { exec } = require('child_process');

  // Specifically check Python 3.10 environment
  exec('py -3.10 -c "import insightface; print(\'ok\')"', (error, stdout, stderr) => {
    if (error) {
      console.log('⚠️ Python or OpenCV not found. Face swap will run in DEMO MODE (Instant Fallback).');
      console.log('   Error:', error.message);
      PYTHON_AVAILABLE = false;
    } else {
      console.log('✅ Python and OpenCV detected. AI Face Swap is ENABLED.');
      PYTHON_AVAILABLE = true;
    }
  });
};

// Check on startup
checkPythonAvailability();

// Face swap endpoint using local Python script
app.post('/api/face-swap', async (req, res) => {
  try {
    const { sourceImage, themeId, theme: themeName } = req.body;

    const targetThemeId = themeId || themeName;

    if (!sourceImage || !targetThemeId) {
      return res.status(400).json({
        success: false,
        message: 'Source image and theme ID are required'
      });
    }

    // DYNAMIC FILE LOOKUP
    // We cannot use 'themes.find' because 'themes' only has the default 5 hardcoded ones.
    // We must scan the directory to find the file that corresponds to 'targetThemeId'.

    let templateFilename = null;
    const templatesDir = path.join(__dirname, 'templates');
    const DEFAULT_TEMPLATE = 'captain_early_riser.png';

    // 1. Try to find match in directory
    try {
      if (fs.existsSync(templatesDir)) {
        const files = fs.readdirSync(templatesDir);
        // Match logic: sanitized filename (no ext) === targetThemeId
        const match = files.find(f => {
          const idFromF = f.replace(/\.(jpg|jpeg|png)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
          return idFromF === targetThemeId;
        });
        if (match) templateFilename = match;
      }
    } catch (e) {
      console.error("Error searching templates dir:", e);
    }

    // 2. Fallback to hardcoded list if not found in dir (legacy support)
    if (!templateFilename) {
      const found = themes.find(t => t.id === targetThemeId);
      if (found) templateFilename = found.template;
    }

    // 3. Ultimate Fallback
    if (!templateFilename) {
      console.log(`Theme ${targetThemeId} not found. Using default.`);
      templateFilename = DEFAULT_TEMPLATE;
    }

    let templatePath = path.join(__dirname, 'templates', templateFilename);

    // Final sanity check
    if (!fs.existsSync(templatePath)) {
      console.log(`Template file ${templateFilename} missing! Using emergency fallback.`);
      templatePath = path.join(__dirname, 'templates', DEFAULT_TEMPLATE);
      templateFilename = DEFAULT_TEMPLATE;
    }

    // Mock a 'theme' object for response
    const theme = {
      id: targetThemeId,
      template: templateFilename
    };

    // Get full paths
    const sourceImagePath = path.join(__dirname, sourceImage.replace(/^\//, ''));

    const resultFileName = `result_${uuidv4()}.png`;
    const resultPath = path.join(__dirname, 'results', resultFileName);

    // Check if files exist
    if (!fs.existsSync(sourceImagePath)) {
      return res.status(404).json({ success: false, message: 'Source image not found' });
    }

    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({
        success: false,
        message: `No template images found. Please add ${DEFAULT_TEMPLATE} to the templates folder.`
      });
    }

    // FAST PATH: If Python is not available, return fallback immediately
    if (!PYTHON_AVAILABLE) {
      console.log('Python not available. Skipping script for instant fallback.');
      try {
        fs.copyFileSync(templatePath, resultPath);
        return res.json({
          success: true,
          message: 'Face swap completed (Demo Mode - No AI)',
          result: {
            imageUrl: `/results/${resultFileName}`,
            theme: theme
          },
          demo: true,
          note: 'Running in instant demo mode because Python/OpenCV is not installed.'
        });
      } catch (err) {
        return res.status(500).json({ success: false, message: 'Fallback failed.' });
      }
    }

    console.log('Starting face swap...');
    console.log('Source:', sourceImagePath);
    console.log('Template:', templatePath);
    console.log('Output:', resultPath);

    // Run Python face swap script
    // Run Python face swap script
    const pythonCommand = 'py';
    const scriptPath = path.join(__dirname, 'face_swap.py');
    console.log('🚀 Spawning Pro Face Swap Pipeline (InsightFace)...');

    const args = [
      '-3.10',
      scriptPath,
      '--source', sourceImagePath,
      '--target', templatePath,
      '--output', resultPath,
      '--cpu'
    ];

    const pythonProcess = spawn(pythonCommand, args);

    // Timeout handling
    const pythonTimeout = setTimeout(() => {
      console.log('Python script timed out (90s). Killing process...');
      pythonProcess.kill();
    }, 90000);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      const s = data.toString();
      stdoutData += s;
      console.log('[Python]:', s);
    });

    pythonProcess.stderr.on('data', (data) => {
      const s = data.toString();
      stderrData += s;
      console.error('[Python Error]:', s);
    });

    pythonProcess.on('close', (code, signal) => {
      clearTimeout(pythonTimeout);
      console.log('Python process exited with code:', code, 'signal:', signal);

      if (code === 0 && fs.existsSync(resultPath)) {
        res.json({
          success: true,
          message: 'Face swap completed successfully',
          result: {
            imageUrl: `/results/${resultFileName}`,
            theme: { id: targetThemeId }
          }
        });
      } else {
        // Fallback logic
        console.log('Python script failed. Using emergency template fallback.');
        try {
          if (!fs.existsSync(resultPath)) {
            fs.copyFileSync(templatePath, resultPath);
          }
          res.json({
            success: true,
            message: 'Face swap completed (Demo Mode - AI Failed)',
            result: {
              imageUrl: `/results/${resultFileName}`,
              theme: { id: targetThemeId }
            },
            note: 'AI processing failed. Showing template only.'
          });
        } catch (e) {
          if (!res.headersSent) res.status(500).json({ success: false, message: 'Server error' });
        }
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(pythonTimeout);
      console.error('Failed to spawn python:', err);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to start subprocess' });
    });

  } catch (error) {
    console.error('Face swap error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Download result
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'results', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    templatesAvailable: themes.map(t => ({
      id: t.id,
      exists: fs.existsSync(path.join(__dirname, 'templates', t.template))
    }))
  });
});

// List uploaded files
app.get('/api/uploads', (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir).map(file => ({
      name: file,
      url: `/uploads/${file}`
    }));
    res.json({ success: true, files });
  } catch (error) {
    res.json({ success: true, files: [] });
  }
});

// List result files
app.get('/api/results', (req, res) => {
  try {
    const resultsDir = path.join(__dirname, 'results');
    const files = fs.readdirSync(resultsDir).map(file => ({
      name: file,
      url: `/results/${file}`
    }));
    res.json({ success: true, files });
  } catch (error) {
    res.json({ success: true, files: [] });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: error.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Mother's Day Campaign Server running on port ${PORT}`);
  console.log(`📁 Templates directory: ${path.join(__dirname, 'templates')}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`📁 Results directory: ${path.join(__dirname, 'results')}`);
  // Scan templates folder for status
  const templatesDir = path.join(__dirname, 'templates');
  if (fs.existsSync(templatesDir)) {
    console.log('\n📋 Detected Templates:');
    const files = fs.readdirSync(templatesDir);
    files.forEach(file => {
      if (/\.(jpg|jpeg|png)$/i.test(file)) {
        console.log(`   ✅ ${file}`);
      }
    });
  }
  console.log('\n💡 To add templates, place PNG images in the templates folder.');
});
