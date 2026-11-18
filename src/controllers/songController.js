
const getSongById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        s.*,

        /* ARTIST - ENGLISH */
        NULLIF(BTRIM(ar.name_english), '') AS artist_name_english,
        ar.image_url AS artist_image,

        /* ALBUM - ENGLISH */
        NULLIF(BTRIM(al.title_english), '') AS album_name_english,
        NULLIF(BTRIM(al.title_english), '') AS album_title_english,
        al.cover_url AS album_cover,

        /* MINISTRY - ENGLISH */
        NULLIF(BTRIM(m.name_english), '') AS ministry_name_english,
        NULLIF(BTRIM(m.name_english), '') AS ministry_name,

        /* CATEGORY - ENGLISH */
        NULLIF(BTRIM(c.name_english), '') AS category_name_english,
        NULLIF(BTRIM(c.name_english), '') AS category_name

      FROM songs s

      LEFT JOIN artists ar
        ON s.artist_id = ar.id

      LEFT JOIN albums al
        ON s.album_id = al.id

      LEFT JOIN ministries m
        ON s.ministry_id = m.id

      LEFT JOIN categories c
        ON s.category_id = c.id

      WHERE s.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Song not found",
      });
    }

    return res.status(200).json({
      success: true,
      song: transformSongMedia(result.rows[0]),
    });

  } catch (error) {
    console.error("Get song error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch song",
    });
  }
};
