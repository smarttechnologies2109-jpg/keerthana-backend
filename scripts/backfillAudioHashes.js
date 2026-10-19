
const crypto = require("crypto");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const pool = require("../src/config/db");

const REGION = process.env.AWS_REGION || "ap-south-1";
const BUCKET =
  process.env.S3_BUCKET_NAME || "keerthana-media-908209635187";

const s3 = new S3Client({ region: REGION });

/**
 * Extract the S3 object key from a supported S3 audio URL.
 */
function getS3Key(audioUrl) {
  const url = new URL(audioUrl);

  const allowedHosts = [
    `${BUCKET}.s3.${REGION}.amazonaws.com`,
    `${BUCKET}.s3.amazonaws.com`,
  ];

  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`Unexpected S3 audio URL: ${audioUrl}`);
  }

  return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
}

/**
 * Download an existing audio object from S3 and calculate SHA-256.
 * The audio file is streamed; it is not saved to disk.
 */
async function hashS3Audio(audioUrl) {
  const key = getS3Key(audioUrl);

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`No audio content returned for S3 key: ${key}`);
  }

  const hash = crypto.createHash("sha256");

  for await (const chunk of response.Body) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

/**
 * Process existing songs that do not yet have an audio hash.
 *
 * If identical audio bytes already have a saved hash, this script
 * reports the duplicate and does not save the hash to the duplicate row.
 */
async function main() {
  try {
    const result = await pool.query(`
      SELECT id, title, audio_url
      FROM songs
      WHERE audio_sha256 IS NULL
        AND audio_url IS NOT NULL
      ORDER BY id ASC
    `);

    console.log(`Songs to process: ${result.rows.length}`);

    for (const song of result.rows) {
      try {
        console.log(`Checking song ID ${song.id}: ${song.title}`);

        const hash = await hashS3Audio(song.audio_url);

        // Check whether another song already has the same audio hash.
        const duplicate = await pool.query(
          `SELECT id, title
           FROM songs
           WHERE audio_sha256 = $1
           LIMIT 1`,
          [hash]
        );

        if (duplicate.rows.length > 0) {
          console.log(
            `DUPLICATE AUDIO: Song ID ${song.id} matches ` +
              `song ID ${duplicate.rows[0].id}.`
          );

          console.log(
            "The duplicate row's hash was not saved."
          );

          continue;
        }

        // Save the hash only if this song's hash is still NULL.
        const updateResult = await pool.query(
          `UPDATE songs
           SET audio_sha256 = $1
           WHERE id = $2
             AND audio_sha256 IS NULL`,
          [hash, song.id]
        );

        if (updateResult.rowCount === 1) {
          console.log(`HASH SAVED: Song ID ${song.id}`);
        } else {
          console.log(
            `SKIPPED: Song ID ${song.id} was updated by another process.`
          );
        }
      } catch (error) {
        console.error(
          `FAILED: Song ID ${song.id}: ${error.message}`
        );
      }
    }

    console.log("Audio hash backfill finished.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
