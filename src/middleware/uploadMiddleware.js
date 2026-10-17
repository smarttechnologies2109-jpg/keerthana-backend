
const multer = require("multer");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGION = process.env.AWS_REGION || "ap-south-1";
const BUCKET_NAME =
  process.env.S3_BUCKET_NAME || "keerthana-media-908209635187";

const s3 = new S3Client({ region: REGION });

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    audio: [
      "audio/mpeg",
      "audio/mp3",
      "audio/x-m4a",
      "audio/mp4",
    ],
    cover: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ],
  };

  const allowed = allowedTypes[file.fieldname];

  if (!allowed) {
    return cb(new Error(`Invalid upload field: ${file.fieldname}`));
  }

  if (!allowed.includes(file.mimetype)) {
    return cb(
      new Error(
        file.fieldname === "audio"
          ? "Only MP3 or M4A audio files are allowed."
          : "Only JPG, PNG, WebP or GIF images are allowed."
      )
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
});

const uploadToS3 = async (file, folder) => {
  if (!file) return null;

  const extension = file.originalname.includes(".")
    ? file.originalname.substring(file.originalname.lastIndexOf(".")).toLowerCase()
    : "";

  const originalName = file.originalname.replace(/\.[^/.]+$/, "");

  const cleanName =
    originalName
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "file";

  const filename = `${Date.now()}-${cleanName}${extension}`;
  const key = `${folder}/${filename}`;

  // Normalize the MIME type based on the file extension.
  const ext = extension.toLowerCase();

  let contentType = file.mimetype;

  if ([".mp3"].includes(ext)) {
    contentType = "audio/mpeg";
  } else if ([".m4a", ".mp4"].includes(ext)) {
    contentType = "audio/mp4";
  } else if ([".jpg", ".jpeg"].includes(ext)) {
    contentType = "image/jpeg";
  } else if (ext === ".png") {
    contentType = "image/png";
  } else if (ext === ".webp") {
    contentType = "image/webp";
  } else if (ext === ".gif") {
    contentType = "image/gif";
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: contentType,
    })
  );

  // Store the key in the database, not a temporary signed URL.
  return {
    key,
    filename,
    bucket: BUCKET_NAME,
    contentType,
  };
};

// Generate a temporary URL when the frontend needs to play private audio.
const getSignedAudioUrl = async (key, expiresIn = 3600) => {
  if (!key) {
    throw new Error("An S3 object key is required.");
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
    { expiresIn }
  );
};

module.exports = upload;
module.exports.uploadToS3 = uploadToS3;
module.exports.getSignedAudioUrl = getSignedAudioUrl;
