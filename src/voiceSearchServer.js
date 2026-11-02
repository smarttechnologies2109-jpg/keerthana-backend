const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");

const { WebSocketServer, WebSocket } = require("ws");

const AWS_REGION =
  process.env.AWS_REGION || "ap-south-1";

const LANGUAGE_OPTIONS = [
  "te-IN",
  "ml-IN",
  "hi-IN",
  "kn-IN",
  "ta-IN",
  "en-IN",
];

const STREAM_PATH = "/api/voice-search/stream";
const MAX_STREAM_MS = 20000;
const MAX_AUDIO_BYTES = 16000 * 2 * 20;
const MAX_CONNECTIONS_PER_IP = 2;
const MAX_STARTS_PER_MINUTE = 6;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://keerthana.co",
  "https://www.keerthana.co",
  "https://main.d2g46r2zbmr5co.amplifyapp.com",
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
]);

class AsyncAudioQueue {
  constructor() {
    this.values = [];
    this.waiters = [];
    this.ended = false;
  }

  push(value) {
    if (this.ended) return;

    const waiter = this.waiters.shift();

    if (waiter) {
      waiter({ value, done: false });
    } else {
      this.values.push(value);
    }
  }

  end() {
    if (this.ended) return;

    this.ended = true;

    while (this.waiters.length) {
      this.waiters.shift()({
        value: undefined,
        done: true,
      });
    }
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next() {
    if (this.values.length) {
      return Promise.resolve({
        value: this.values.shift(),
        done: false,
      });
    }

    if (this.ended) {
      return Promise.resolve({
        value: undefined,
        done: true,
      });
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function getClientIp(request) {
  return request.socket.remoteAddress || "unknown";
}

function createRateLimiter() {
  const startsByIp = new Map();
  const activeByIp = new Map();

  return {
    canStart(ip) {
      const now = Date.now();

      const recent = (startsByIp.get(ip) || [])
        .filter((timestamp) => now - timestamp < 60000);

      if (recent.length >= MAX_STARTS_PER_MINUTE) {
        startsByIp.set(ip, recent);
        return false;
      }

      startsByIp.set(ip, [...recent, now]);
      return true;
    },

    canConnect(ip) {
      return (
        (activeByIp.get(ip) || 0) <
        MAX_CONNECTIONS_PER_IP
      );
    },

    connected(ip) {
      activeByIp.set(
        ip,
        (activeByIp.get(ip) || 0) + 1
      );
    },

    disconnected(ip) {
      const count = activeByIp.get(ip) || 0;

      if (count <= 1) {
        activeByIp.delete(ip);
      } else {
        activeByIp.set(ip, count - 1);
      }
    },
  };
}

function getSafeAwsErrorMessage(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");

  if (
    name === "AccessDeniedException" ||
    name === "UnrecognizedClientException" ||
    /not authorized|access denied|permission/i.test(message)
  ) {
    return (
      "Voice search is waiting for AWS ECS Transcribe permission. " +
      "Please try again after the backend permission is enabled."
    );
  }

  if (
    name === "BadRequestException" ||
    name === "InvalidParameterException"
  ) {
    return (
      "AWS voice-search configuration is invalid. " +
      "Please contact support."
    );
  }

  return "Voice recognition failed. Please try again.";
}

function attachVoiceSearch(httpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });

  const limiter = createRateLimiter();

  const transcribeClient =
    new TranscribeStreamingClient({
      region: AWS_REGION,
    });

  httpServer.on("upgrade", (request, socket, head) => {
    let pathname;

    try {
      pathname = new URL(
        request.url,
        "http://localhost"
      ).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== STREAM_PATH) {
      // Do not interfere with other WebSocket endpoints.
      return;
    }

    const origin = request.headers.origin;

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      socket.write(
        "HTTP/1.1 403 Forbidden\r\n\r\n"
      );
      socket.destroy();
      return;
    }

    const ip = getClientIp(request);

    if (
      !limiter.canConnect(ip) ||
      !limiter.canStart(ip)
    ) {
      socket.write(
        "HTTP/1.1 429 Too Many Requests\r\n\r\n"
      );
      socket.destroy();
      return;
    }

    wss.handleUpgrade(
      request,
      socket,
      head,
      (ws) => {
        wss.emit("connection", ws, request, ip);
      }
    );
  });

  wss.on("connection", async (socket, request, ip) => {
    limiter.connected(ip);

    const audioQueue = new AsyncAudioQueue();

    let totalAudioBytes = 0;
    let acceptingAudio = true;
    let disconnected = false;
    let streamTimer = null;
    let limiterReleased = false;

    const releaseLimiter = () => {
      if (limiterReleased) return;
      limiterReleased = true;
      limiter.disconnected(ip);
    };

    const finishInput = () => {
      if (!acceptingAudio) return;

      acceptingAudio = false;
      audioQueue.end();
    };

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        if (!acceptingAudio) return;

       console.log("KEERTHANA audio received:", {
  bytes: chunk.length,
  totalBytes: totalAudioBytes + chunk.length,
});
        totalAudioBytes += chunk.length;

        if (totalAudioBytes > MAX_AUDIO_BYTES) {
          safeSend(socket, {
            type: "limit",
            message: "Voice search reached its 20-second limit.",
          });

          finishInput();
          return;
        }

        audioQueue.push(chunk);
        return;
      }

      let message;

      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === "stop") {
        finishInput();
      }
    });

    socket.on("close", () => {
      disconnected = true;
      finishInput();

      if (streamTimer) {
        clearTimeout(streamTimer);
      }

      releaseLimiter();
    });

    socket.on("error", (error) => {
      console.error(
        "Voice WebSocket error:",
        error.message
      );

      finishInput();
    });

    streamTimer = setTimeout(() => {
      safeSend(socket, {
        type: "limit",
        message: "Voice search is limited to 20 seconds.",
      });

      finishInput();
    }, MAX_STREAM_MS);

    try {
      const audioStream = (async function* () {
        for await (const chunk of audioQueue) {
          yield {
            AudioEvent: {
              AudioChunk: chunk,
            },
          };
        }
      })();

      const command =
        new StartStreamTranscriptionCommand({
          IdentifyLanguage: true,
          LanguageOptions: LANGUAGE_OPTIONS,
          MediaEncoding: "pcm",
          MediaSampleRateHertz: 16000,
          AudioStream: audioStream,
        });

      const response =
        await transcribeClient.send(command);

      let detectedLanguage =
        response.LanguageCode || null;

      if (response.TranscriptResultStream) {
        for await (
          const event of response.TranscriptResultStream
        ) {
          if (disconnected) break;

          const results =
            event.TranscriptEvent
              ?.Transcript
              ?.Results || [];

          for (const result of results) {
            const text =
              result.Alternatives?.[0]?.Transcript || "";

            if (!text.trim()) continue;

            if (result.LanguageCode) {
              detectedLanguage = result.LanguageCode;
            }

            safeSend(socket, {
              type: "transcript",
              text,
              isPartial: Boolean(result.IsPartial),
              languageCode:
                result.LanguageCode || detectedLanguage,
            });
          }
        }
      }

      if (!disconnected) {
        safeSend(socket, {
          type: "complete",
          languageCode: detectedLanguage,
        });

        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000, "Transcription complete");
        }
      }
    } catch (error) {
      console.error(
        "AWS Transcribe voice search error:",
        error
      );

      safeSend(socket, {
        type: "error",
        message: getSafeAwsErrorMessage(error),
      });

      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1011, "Transcription failed");
      }
    } finally {
      finishInput();

      if (streamTimer) {
        clearTimeout(streamTimer);
      }

      if (disconnected) {
        releaseLimiter();
      }
    }
  });

  console.log(
    `KEERTHANA voice-search WebSocket attached: ${STREAM_PATH}`
  );

  return wss;
}

module.exports = attachVoiceSearch;