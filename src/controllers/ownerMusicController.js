
const pool = require("../config/db");

/* =========================================================
   SUPPORTED LANGUAGES
========================================================= */

const SUPPORTED_LANGUAGES = [
  "Telugu",
  "Hindi",
  "English",
  "Malayalam",
  "Kannada",
  "Tamil",
];

const LANGUAGE_ALIASES = {
  te: "Telugu",
  "te-in": "Telugu",
  telugu: "Telugu",
  "తెలుగు": "Telugu",

  hi: "Hindi",
  "hi-in": "Hindi",
  hindi: "Hindi",

  en: "English",
  "en-in": "English",
  english: "English",

  ml: "Malayalam",
  "ml-in": "Malayalam",
  malayalam: "Malayalam",

  kn: "Kannada",
  "kn-in": "Kannada",
  kannada: "Kannada",

  ta: "Tamil",
  "ta-in": "Tamil",
  tamil: "Tamil",
};

const normalizeLanguage = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  return LANGUAGE_ALIASES[raw] || "";
};

const getLanguageFromQuery = (req, res) => {
  const raw = String(req.query.language || "").trim();

  if (!raw) {
    return { language: "", valid: true };
  }

  const language = normalizeLanguage(raw);

  if (!language || !SUPPORTED_LANGUAGES.includes(language)) {
    res.status(400).json({
      success: false,
      message:
        "Invalid language. Supported languages are Telugu, Hindi, English, Malayalam, Kannada and Tamil.",
    });

    return { language: "", valid: false };
  }

  return { language, valid: true };
};

/* =========================================================
   BILINGUAL NAME HELPERS

   Read optional bilingual fields safely using to_jsonb().
========================================================= */

const bilingualEnglish = (alias) => `
  COALESCE(
    NULLIF(BTRIM(to_jsonb(${alias})->>'name_english'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'english_name'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'name_en'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'englishName'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'artist_name_english'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'category_name_english'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'ministry_name_english'), ''),
    CASE
      WHEN COALESCE(to_jsonb(${alias})->>'name', '') !~ '[ఀ-౿]'
      THEN NULLIF(BTRIM(to_jsonb(${alias})->>'name'), '')
      ELSE NULL
    END,
    ''
  )
`;

const bilingualTelugu = (alias) => `
  COALESCE(
    NULLIF(BTRIM(to_jsonb(${alias})->>'name_telugu'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'telugu_name'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'name_te'), ''),
    NULLIF(BTRIM(to_jsonb(${alias})->>'teluguName'), ''),
    NULLIF(to_jsonb(${alias})->>'artist_name_telugu', ''),
    NULLIF(to_jsonb(${alias})->>'category_name_telugu', ''),
    NULLIF(to_jsonb(${alias})->>'ministry_name_telugu', ''),
    CASE
      WHEN COALESCE(to_jsonb(${alias})->>'name', '') ~ '[ఀ-౿]'
      THEN NULLIF(BTRIM(to_jsonb(${alias})->>'name'), '')
      ELSE NULL
    END,
    ''
  )
`;

/* =========================================================
   LANGUAGE NORMALIZATION SQL

   IMPORTANT:
   This helper receives the actual SQL expression to normalize.
   It does not assume that a CTE contains a column named language.
========================================================= */

const normalizedLanguageSql = (expression) => `
  CASE
    WHEN LOWER(BTRIM(COALESCE(${expression}, '')))
      IN ('te', 'te-in', 'telugu', 'తెలుగు')
      THEN 'Telugu'

    WHEN LOWER(BTRIM(COALESCE(${expression}, '')))
      IN ('hi', 'hi-in', 'hindi')
      THEN 'Hindi'

    WHEN LOWER(BTRIM(COALESCE(${expression}, '')))
      IN ('en', 'en-in', 'english')
      THEN 'English'

    WHEN LOWER(BTRIM(COALESCE(${expression}, '')))
      IN ('ml', 'ml-in', 'malayalam')
      THEN 'Malayalam'

    WHEN LOWER(BTRIM(COALESCE(${expression}, '')))
      IN ('kn', 'kn-in', 'kannada')
      THEN 'Kannada'

    WHEN LOWER(BTRIM(COALESCE(${expression}, '')))
      IN ('ta', 'ta-in', 'tamil')
      THEN 'Tamil'

    ELSE COALESCE(NULLIF(BTRIM(${expression}), ''), 'Telugu')
  END
`;

/* =========================================================
   GET OWNER SONGS
========================================================= */

const getOwnerSongs = async (req, res) => {
  try {
    const { language, valid } = getLanguageFromQuery(req, res);
    if (!valid) return;

    const values = [];
    let where = "";

    if (language) {
      values.push(language);
      where = `WHERE ${normalizedLanguageSql("s.language")} = $1`;
    }

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.title,
        s.title_english,
        s.language,
        s.lyrics,
        s.audio_url,
        s.cover_url,

        a.name AS artist_name,
        ${bilingualEnglish("a")} AS artist_name_english,
        ${bilingualTelugu("a")} AS artist_name_telugu,

        al.title AS album_title,
        to_jsonb(al)->>'title_english' AS album_title_english,
        to_jsonb(al)->>'title_telugu' AS album_title_telugu,

        c.name AS category_name,
        ${bilingualEnglish("c")} AS category_name_english,
        ${bilingualTelugu("c")} AS category_name_telugu,

        m.name AS ministry_name,
        ${bilingualEnglish("m")} AS ministry_name_english,
        ${bilingualTelugu("m")} AS ministry_name_telugu

      FROM public.songs s

      LEFT JOIN public.artists a
        ON a.id = s.artist_id

      LEFT JOIN public.albums al
        ON al.id = s.album_id

      LEFT JOIN public.categories c
        ON c.id = s.category_id

      LEFT JOIN public.ministries m
        ON m.id = s.ministry_id

      ${where}

      ORDER BY s.id DESC
      `,
      values
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      songs: result.rows,
    });
  } catch (error) {
    console.error("Owner songs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load owner songs.",
    });
  }
};

/* =========================================================
   GET OWNER ALBUMS
========================================================= */

const getOwnerAlbums = async (req, res) => {
  try {
    const { language, valid } = getLanguageFromQuery(req, res);
    if (!valid) return;

    const result = await pool.query(
      `
      WITH album_data AS (
        SELECT
          al.id,
          al.title,

          COALESCE(
            NULLIF(BTRIM(to_jsonb(al)->>'title_english'), ''),
            CASE
              WHEN COALESCE(al.title, '') !~ '[ఀ-౿]'
              THEN NULLIF(BTRIM(al.title), '')
              ELSE NULL
            END,
            ''
          ) AS title_english,

          COALESCE(
            NULLIF(BTRIM(to_jsonb(al)->>'title_telugu'), ''),
            CASE
              WHEN COALESCE(al.title, '') ~ '[ఀ-౿]'
              THEN NULLIF(BTRIM(al.title), '')
              ELSE NULL
            END,
            ''
          ) AS title_telugu,

          al.artist_id,
          al.cover_url,
          al.release_year,
          al.created_at,

          a.name AS artist_name,
          ${bilingualEnglish("a")} AS artist_name_english,
          ${bilingualTelugu("a")} AS artist_name_telugu,

          COALESCE(
            NULLIF(BTRIM(to_jsonb(al)->>'language'), ''),
            MAX(s.language),
            'Telugu'
          ) AS raw_language,

          COUNT(DISTINCT s.id)::integer AS song_count

        FROM public.albums al

        LEFT JOIN public.artists a
          ON a.id = al.artist_id

        LEFT JOIN public.songs s
          ON s.album_id = al.id

        GROUP BY
          al.id,
          a.id
      ),

      normalized_albums AS (
        SELECT
          *,
          ${normalizedLanguageSql("raw_language")} AS language
        FROM album_data
      )

      SELECT
        *,
        language AS album_language,

        title_english AS english_name,
        title_english AS name_english,

        title_telugu AS telugu_name,
        title_telugu AS name_telugu

      FROM normalized_albums

      WHERE $1::text = ''
        OR language = $1

      ORDER BY created_at DESC NULLS LAST, id DESC
      `,
      [language]
    );

    const albums = result.rows.map((album) => ({
      ...album,
      song_count: Number(album.song_count || 0),
    }));

    return res.status(200).json({
      success: true,
      count: albums.length,
      albums,
    });
  } catch (error) {
    console.error("Owner albums error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load owner albums.",
    });
  }
};

/* =========================================================
   GET OWNER ARTISTS
========================================================= */

const getOwnerArtists = async (req, res) => {
  try {
    const { language, valid } = getLanguageFromQuery(req, res);
    if (!valid) return;

    const result = await pool.query(
      `
      WITH artist_data AS (
        SELECT
          a.id,
          a.name,

          ${bilingualEnglish("a")} AS name_english,
          ${bilingualTelugu("a")} AS name_telugu,

          to_jsonb(a)->>'image_url' AS image_url,

          COALESCE(
            to_jsonb(a)->>'bio',
            to_jsonb(a)->>'description',
            ''
          ) AS bio,

          COALESCE(
            NULLIF(BTRIM(to_jsonb(a)->>'language'), ''),
            NULLIF(BTRIM(to_jsonb(a)->>'language_name'), ''),
            MAX(s.language),
            'Telugu'
          ) AS raw_language,

          COUNT(DISTINCT s.id)::integer AS song_count

        FROM public.artists a

        LEFT JOIN public.songs s
          ON s.artist_id = a.id

        GROUP BY a.id
      ),

      normalized_artists AS (
        SELECT
          *,
          ${normalizedLanguageSql("raw_language")} AS language
        FROM artist_data
      )

      SELECT
        *,
        name_english AS english_name,
        name_telugu AS telugu_name

      FROM normalized_artists

      WHERE $1::text = ''
        OR language = $1

      ORDER BY id DESC
      `,
      [language]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      artists: result.rows,
    });
  } catch (error) {
    console.error("Owner artists error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load owner artists.",
    });
  }
};

/* =========================================================
   GET OWNER CATEGORIES
========================================================= */

const getOwnerCategories = async (req, res) => {
  try {
    const { language, valid } = getLanguageFromQuery(req, res);
    if (!valid) return;

    const result = await pool.query(
      `
      WITH category_data AS (
        SELECT
          c.id,
          c.name,

          ${bilingualEnglish("c")} AS name_english,
          ${bilingualTelugu("c")} AS name_telugu,

          to_jsonb(c)->>'image_url' AS image_url,

          COALESCE(
            NULLIF(BTRIM(to_jsonb(c)->>'language'), ''),
            NULLIF(BTRIM(to_jsonb(c)->>'language_name'), ''),
            MAX(s.language),
            'Telugu'
          ) AS raw_language,

          COUNT(DISTINCT s.id)::integer AS song_count

        FROM public.categories c

        LEFT JOIN public.songs s
          ON s.category_id = c.id

        GROUP BY c.id
      ),

      normalized_categories AS (
        SELECT
          *,
          ${normalizedLanguageSql("raw_language")} AS language
        FROM category_data
      )

      SELECT
        *,
        name_english AS english_name,
        name_telugu AS telugu_name

      FROM normalized_categories

      WHERE $1::text = ''
        OR language = $1

      ORDER BY id DESC
      `,
      [language]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      categories: result.rows,
    });
  } catch (error) {
    console.error("Owner categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load owner categories.",
    });
  }
};

/* =========================================================
   GET OWNER MINISTRIES
========================================================= */

const getOwnerMinistries = async (req, res) => {
  try {
    const { language, valid } = getLanguageFromQuery(req, res);
    if (!valid) return;

    const result = await pool.query(
      `
      WITH ministry_data AS (
        SELECT
          m.id,
          m.name,

          ${bilingualEnglish("m")} AS name_english,
          ${bilingualTelugu("m")} AS name_telugu,

          to_jsonb(m)->>'image_url' AS image_url,

          COALESCE(
            to_jsonb(m)->>'description',
            ''
          ) AS description,

          COALESCE(
            NULLIF(BTRIM(to_jsonb(m)->>'language'), ''),
            NULLIF(BTRIM(to_jsonb(m)->>'language_name'), ''),
            MAX(s.language),
            'Telugu'
          ) AS raw_language,

          COUNT(DISTINCT s.id)::integer AS song_count

        FROM public.ministries m

        LEFT JOIN public.songs s
          ON s.ministry_id = m.id

        GROUP BY m.id
      ),

      normalized_ministries AS (
        SELECT
          *,
          ${normalizedLanguageSql("raw_language")} AS language
        FROM ministry_data
      )

      SELECT
        *,
        name_english AS english_name,
        name_telugu AS telugu_name

      FROM normalized_ministries

      WHERE $1::text = ''
        OR language = $1

      ORDER BY id DESC
      `,
      [language]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      ministries: result.rows,
    });
  } catch (error) {
    console.error("Owner ministries error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load owner ministries.",
    });
  }
};

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  getOwnerSongs,
  getOwnerAlbums,
  getOwnerArtists,
  getOwnerCategories,
  getOwnerMinistries,
};
