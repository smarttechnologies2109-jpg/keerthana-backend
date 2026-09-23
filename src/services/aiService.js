const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY,
});

const MODEL = process.env.AI_MODEL || "gpt-5.6-luna";

const SYSTEM_PROMPT = `
You are Keerthana AI, the music assistant inside the
Keerthana music streaming application.

You help users:
- discover music
- find songs
- find artists
- choose music based on mood
- choose music based on language
- create playlists
- discover new music

Be friendly, concise and helpful.

If the application provides available songs, use those
songs when making music recommendations.

Never invent that a song exists in the Keerthana library
when it was not provided.
`;

async function askKeerthanaAI(message, songs = []) {
  if (!message || !message.trim()) {
    throw new Error("Message is required");
  }

  if (!process.env.AI_API_KEY) {
    throw new Error("AI_API_KEY is missing in .env");
  }

  const songContext =
    Array.isArray(songs) && songs.length > 0
      ? `
AVAILABLE KEERTHANA SONGS:

${songs
  .map(
    (song, index) =>
      `${index + 1}. ${song.title || "Unknown"} - ${
        song.artist || "Unknown Artist"
      }`
  )
  .join("\n")}
`
      : `
No song library was provided.
`;

  const response = await client.responses.create({
    model: MODEL,

    instructions: SYSTEM_PROMPT,

    input: `
USER REQUEST:

${message}

${songContext}
`,
  });

  const answer = response.output_text?.trim();

  if (!answer) {
    throw new Error("AI returned an empty response");
  }

  return answer;
}

module.exports = {
  askKeerthanaAI,
};