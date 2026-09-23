const { askKeerthanaAI } = require("../services/aiService");

const askAI = async (req, res) => {
  try {
    const { message, songs } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const answer = await askKeerthanaAI(
      message,
      Array.isArray(songs) ? songs : []
    );

    return res.status(200).json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error("=================================");
    console.error("KEERTHANA AI ERROR");
    console.error("=================================");
    console.error(error);

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Keerthana AI request failed",
    });
  }
};

module.exports = {
  askAI,
};