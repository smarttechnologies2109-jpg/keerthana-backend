const multer = require("multer");
const path = require("path");
const fs = require("fs");


/* =========================================================
   UPLOAD DIRECTORIES
========================================================= */

const audioDirectory = path.resolve(
  __dirname,
  "../../public/audio"
);

const imageDirectory = path.resolve(
  __dirname,
  "../../public/images"
);


/* =========================================================
   CREATE DIRECTORIES IF THEY DON'T EXIST
========================================================= */

fs.mkdirSync(audioDirectory, {
  recursive: true,
});

fs.mkdirSync(imageDirectory, {
  recursive: true,
});


/* =========================================================
   STORAGE
========================================================= */

const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    /* =====================================================
       AUDIO
    ===================================================== */

    if (file.fieldname === "audio") {

      return cb(
        null,
        audioDirectory
      );

    }


    /* =====================================================
       COVER / ARTIST IMAGE / ALBUM COVER
    ===================================================== */

    if (file.fieldname === "cover") {

      return cb(
        null,
        imageDirectory
      );

    }


    /* =====================================================
       INVALID FIELD
    ===================================================== */

    return cb(
      new Error(
        `Invalid upload field: ${file.fieldname}`
      )
    );

  },


  filename: (req, file, cb) => {

    const extension =
      path.extname(
        file.originalname
      ).toLowerCase();


    const originalName =
      path.basename(
        file.originalname,
        extension
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


    const uniqueName =
      `${Date.now()}-${cleanName}${extension}`;


    cb(
      null,
      uniqueName
    );

  },

});


/* =========================================================
   FILE FILTER
========================================================= */

const fileFilter = (
  req,
  file,
  cb
) => {

  /* =======================================================
     AUDIO
  ======================================================= */

  if (
    file.fieldname === "audio"
  ) {

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

      return cb(
        null,
        true
      );

    }


    return cb(
      new Error(
        "Only MP3 or M4A audio files are allowed."
      )
    );

  }


  /* =======================================================
     COVER / ARTIST IMAGE / ALBUM COVER
  ======================================================= */

  if (
    file.fieldname === "cover"
  ) {

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

      return cb(
        null,
        true
      );

    }


    return cb(
      new Error(
        "Only JPG, PNG, WebP or GIF images are allowed."
      )
    );

  }


  /* =======================================================
     INVALID FIELD
  ======================================================= */

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

    /*
      30 MB allows songs.

      This also means album/artist images can be
      uploaded, but your frontend should continue
      enforcing the 5 MB image limit.
    */

    fileSize:
      30 * 1024 * 1024,

  },

});


/* =========================================================
   EXPORT
========================================================= */

module.exports = upload;