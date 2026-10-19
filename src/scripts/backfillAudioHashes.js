
const crypto = require("crypto");
const {
  S3Client,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const pool = require("../src/config/db");

const REGION = process.env.AWS_REGION || "ap-south-1";
const BUCKET =
  process.env.S3_BUCKET_NAME || "keerthana-media-908209635187";

const s3 = new S3Client({ region: REGION });

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

async function hashS3Audio(audioUrl) {
  const key = getS3Key(audioUrl);

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`No audio content returned for ${key}`);
  }

  const hash = crypto.createHash("sha256");

  for await (const chunk of response.Body) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

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
        const hash = await hashS3Audio(song.audio_url);

        const duplicate = await pool.query(
          `
          SELECT id, title
          FROM songs
          WHERE audio_sha256 = $1
          LIMIT 1
          `,
          [hash]
        );

        if (duplicate.rows.length > 0) {
          console.log(
            `DUPLICATE: Song ${song.id} matches song ${duplicate.rows[0].id}. ` +
            "Its hash was not saved."
          );
          continue;
        }

        const updateResult = await pool.query(
          `
          UPDATE songs
          SET audio_sha256 = $1
          WHERE id = $2
            AND audio_sha256 IS NULL
          `,
          [hash, song.id]
        );

        if (updateResult.rowCount === 1) {
          console.log(`Hashed song ${song.id}: ${song.title}`);
        }
      } catch (error) {
        console.error(
          `Failed song ${song.id}: ${error.message}`
        );
      }
    }

    console.log("Backfill completed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
