const sharp = require('sharp');
const path = require('path');
const fs = require('fs')


exports.uploadSingle = (fieldName) => {
  return async (req, res, next) => {
    try {
      if (!req.file) return next();

      if (!req.file.mimetype.startsWith('image/')) {
        return next();
      }

      const inputPath = req.file.path;
      const ext = path.extname(inputPath);
      const outputPath = inputPath.replace(ext, `-optimized${ext}`);

      await sharp(inputPath)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .toFile(outputPath);

      // Replace original file
      fs.unlinkSync(inputPath);
      fs.renameSync(outputPath, inputPath);

      // Normalize path for DB
      req.file.path = inputPath.replace(/\\/g, '/');

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Multiple files upload with image optimization
exports.uploadMultiple = (fieldName, maxCount = 10) => {
  return async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return next();
      }

      const optimizationPromises = req.files.map(async (file) => {
        if (file.mimetype.startsWith('image/')) {
          const filepath = path.join(file.destination, file.filename);
          
          await sharp(filepath)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .png({ quality: 80 })
            .toFile(filepath);
        }
        file.path = file.path.replace(/\\/g, '/');
        return file;
      });

      await Promise.all(optimizationPromises);
      next();
    } catch (error) {
      next(error);
    }
  };
};

// File cleaner middleware (remove temp files on error)
exports.cleanupFiles = async (req, res, next) => {
  try {
    const files = req.file ? [req.file] : (req.files || []);
    
    if (req.errorOccurred && files.length > 0) {
      const deletePromises = files.map(file => 
        fs.unlink(file.path).catch(() => {})
      );
      await Promise.all(deletePromises);
    }
    next();
  } catch (error) {
    next(error);
  }
};