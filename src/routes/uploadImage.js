const express = require('express');
const upload = require("../config/multer");
const { authenticate, authorize } = require("../middleware/auth");
const { uploadSingle } = require("../middleware/upload");
const router = express.Router();

router.post(
  '/upload-Image',
  authenticate,
  upload.single('image'),
  uploadSingle('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
      }

      // ✅ Build full base URL dynamically
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      console.log("baseUrl::", baseUrl)
      // Normalize slashes
      let imagePath = req.file.path.replace(/\\/g, '/');

      // Remove "src/" from beginning if exists
      imagePath = imagePath.replace(/^src\//, '');
      console.log("imagePath::", imagePath)
      return res.status(200).json({
        message: 'Image uploaded successfully',
        imagePath: `${baseUrl}/${imagePath}`  // ✅ Full URL
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
