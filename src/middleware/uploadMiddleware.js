const multer = require("multer");

/* =========================================================
   AWS S3
========================================================= */

const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

/* =========================================================
   S3 CONFIG
========================================================= */

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
});

const BUCKET_NAME =
  process.env.S3_BUCKET_NAME ||
  "keerthana-media-908209635187";

/* =========================================================
   MEMORY STORAGE
   Files are kept in memory temporarily and uploaded to S3.
========================================================= */

const storage = multer.memoryStorage();

/* =========================================================
   FILE FILTER
========================================================= */

const fileFilter = (req, file, cb) => {

  /* -------------------------------------------------------
     AUDIO
  ------------------------------------------------------- */

  if (file.fieldname === "audio") {

    const allowedAudioTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/x-m4a",
      "audio/mp4",
    ];

    if (
      allowedAudioTypes.includes(
        file.mimetype
      )
    ) {
      return cb(null, true);
    }

    return cb(
      new Error(
        "Only MP3 or M4A audio files are allowed."
      )
    );
  }

  /* -------------------------------------------------------
     COVER
  ------------------------------------------------------- */

  if (file.fieldname === "cover") {

    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (
      allowedImageTypes.includes(
        file.mimetype
      )
    ) {
      return cb(null, true);
    }

    return cb(
      new Error(
        "Only JPG, PNG, WebP or GIF images are allowed."
      )
    );
  }

  return cb(
    new Error(
      `Invalid upload field: ${file.fieldname}`
    )
  );
};

/* =========================================================
   MULTER
========================================================= */

const upload = multer({

  storage,

  fileFilter,

  limits: {
    fileSize:
      30 * 1024 * 1024,
  },

});

/* =========================================================
   UPLOAD FILE TO S3
========================================================= */

const uploadToS3 = async (file, folder) => {

  if (!file) {
    return null;
  }

  const extension =
    file.originalname
      .includes(".")
      ? file.originalname
          .substring(
            file.originalname
              .lastIndexOf(".")
          )
          .toLowerCase()
      : "";

  const originalName =
    file.originalname
      .replace(
        /\.[^/.]+$/,
        ""
      );

  let cleanName =
    originalName
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .toLowerCase();

  if (!cleanName) {
    cleanName = "file";
  }

  const filename =
    `${Date.now()}-${cleanName}${extension}`;

  const key =
    `${folder}/${filename}`;

  const command =
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

  await s3.send(command);

  return {
    key,
    filename,
    bucket: BUCKET_NAME,
  };
};

/* =========================================================
   EXPORT
========================================================= */

module.exports = upload;

module.exports.uploadToS3 =
  uploadToS3;