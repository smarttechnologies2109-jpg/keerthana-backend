
const multer = require("multer");
const path = require("path");

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// =====================================================
// AWS CONFIGURATION
// =====================================================

const REGION = process.env.AWS_REGION || "ap-south-1";

const BUCKET_NAME =
  process.env.S3_BUCKET_NAME || "keerthana-media-908209635187";

const CLOUDFRONT_URL = (
  process.env.CLOUDFRONT_URL ||
  "https://d1aj7yf1pvtrkq.cloudfront.net"
).replace(/\/+$/, "");

const s3 = new S3Client({
  region: REGION,
});

// =====================================================
// MULTER MEMORY STORAGE
// =====================================================

const storage = multer.memoryStorage();

// =====================================================
// ALLOWED FILE TYPES
// =====================================================

const allowedTypes = {
  // Song audio
  audio: {
    mime: [
      "audio/mpeg",
      "audio/mp3",
      "audio/x-m4a",
      "audio/mp4",
    ],
    extensions: [".mp3", ".m4a", ".mp4"],
  },

  // Song cover images
  cover: {
    mime: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  },

  // Artist, category and ministry images
  image: {
    mime: [
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
  },

  // User profile images
  profile_image: {
    mime: [
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
  },
};

// =====================================================
// FILE FILTER
// =====================================================

const fileFilter = (req, file, cb) => {
  const rules = allowedTypes[file.fieldname];

  if (!rules) {
    return cb(
      new Error(`Invalid upload field: ${file.fieldname}`)
    );
  }

  const extension = path
    .extname(file.originalname || "")
    .toLowerCase();

  if (
    !rules.mime.includes(file.mimetype) ||
    !rules.extensions.includes(extension)
  ) {
    return cb(
      new Error(`Invalid file type for ${file.fieldname}`)
    );
  }

  cb(null, true);
};

// =====================================================
// GENERAL UPLOAD
// Audio, covers, artist, category and ministry images
// Maximum file size: 30 MB
// =====================================================

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 5,
  },
});

// =====================================================
// PROFILE IMAGE UPLOAD
// Maximum file size: 5 MB
// =====================================================

const profileUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

// =====================================================
// CONTENT TYPE
// =====================================================

const getContentType = (extension, fallback) => {
  const types = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",

    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };

  return types[extension] || fallback || "application/octet-stream";
};

// =====================================================
// CLOUDFRONT URL
// =====================================================

const makeCloudFrontUrl = (key) => {
  const safeKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${CLOUDFRONT_URL}/${safeKey}`;
};

// =====================================================
// UPLOAD FILE TO S3
// Allowed folders:
// audio, covers, profiles, artists, categories, ministries
// =====================================================

const uploadToS3 = async (file, folder) => {
  if (!file) {
    return null;
  }

  const allowedFolders = [
    "audio",
    "covers",
    "profiles",
    "artists",
    "categories",
    "ministries",
  ];

  if (!allowedFolders.includes(folder)) {
    throw new Error("Invalid S3 upload folder.");
  }

  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new Error("Uploaded file buffer is missing.");
  }

  const extension = path
    .extname(file.originalname || "")
    .toLowerCase();

  const originalName = path.basename(
    file.originalname || "file",
    extension
  );

  const cleanName =
    originalName
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "file";

  const filename = `${Date.now()}-${cleanName}${extension}`;

  const key = `${folder}/${filename}`;

  const contentType = getContentType(
    extension,
    file.mimetype
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: contentType,

      // Keep the S3 bucket private.
      // Do not add ACL: public-read.
    })
  );

  return {
    key,
    filename,
    bucket: BUCKET_NAME,
    contentType,
    cloudFrontUrl: makeCloudFrontUrl(key),
  };
};

// =====================================================
// EXTRACT PROFILE S3 KEY
// Only accepts profiles/ objects.
// =====================================================

const getProfileS3Key = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  let key = value.trim();

  try {
    if (/^https?:\/\//i.test(key)) {
      const url = new URL(key);

      if (
        url.hostname !== new URL(CLOUDFRONT_URL).hostname
      ) {
        return null;
      }

      key = url.pathname;
    }
  } catch {
    return null;
  }

  key = key.replace(/^\/+/, "");

  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }

  return key.startsWith("profiles/") ? key : null;
};

// =====================================================
// DELETE PROFILE S3 IMAGE
// Only accepts profiles/ objects.
// =====================================================

const deleteS3Object = async (value) => {
  const key = getProfileS3Key(value);

  if (!key) {
    return;
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
};

// =====================================================
// EXTRACT MANAGED IMAGE S3 KEY
// Only accepts:
// artists/
// categories/
// ministries/
// =====================================================

const getManagedS3Key = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  let key = value.trim();

  try {
    if (/^https?:\/\//i.test(key)) {
      const url = new URL(key);

      if (
        url.hostname !== new URL(CLOUDFRONT_URL).hostname
      ) {
        return null;
      }

      key = url.pathname;
    }
  } catch {
    return null;
  }

  key = key.replace(/^\/+/, "");

  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }

 
const allowedPrefixes = [
  "artists/",
  "covers/",
  "categories/",
  "ministries/",
];


  return allowedPrefixes.some((prefix) => key.startsWith(prefix))
    ? key
    : null;
};

// =====================================================
// DELETE ARTIST / CATEGORY / MINISTRY IMAGE
// =====================================================

const deleteManagedS3Object = async (value) => {
  const key = getManagedS3Key(value);

  if (!key) {
    return;
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
};

// =====================================================
// SIGNED AUDIO URL
// =====================================================

const getSignedAudioUrl = async (key, expiresIn = 3600) => {
  if (!key || typeof key !== "string") {
    throw new Error("An S3 object key is required.");
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
    {
      expiresIn,
    }
  );
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = upload;

module.exports.uploadToS3 = uploadToS3;

module.exports.profileUpload = profileUpload;

module.exports.deleteS3Object = deleteS3Object;

module.exports.deleteManagedS3Object = deleteManagedS3Object;

module.exports.getSignedAudioUrl = getSignedAudioUrl;

module.exports.getProfileS3Key = getProfileS3Key;

module.exports.getManagedS3Key = getManagedS3Key;

module.exports.CLOUDFRONT_URL = CLOUDFRONT_URL;
