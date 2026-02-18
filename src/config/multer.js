const multer = require('multer');
const path = require('path');

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, 'src/uploads/images/');
    } else if (file.mimetype === 'application/pdf') {
      cb(null, 'src/uploads/documents/');
    } else if (
      file.mimetype.includes('excel') || 
      file.mimetype.includes('spreadsheetml') ||
      file.mimetype === 'text/csv'
    ) {
      cb(null, 'src/uploads/documents/');
    } else {
      cb(null, 'src/uploads/temp/');
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '')
    .split(',')
    .map(type => type.trim());

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Invalid file type: ${file.mimetype}`),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE)
  }
});

module.exports = upload;