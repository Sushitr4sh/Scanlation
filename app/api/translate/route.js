import { v2 } from "@google-cloud/translate";
const { Translate } = v2;

export async function POST(req) {
  try {
    const { text, targetLanguage, sourceLanguage } = await req.json();

    // Creates a client with credentials
    const translate = new Translate({
      keyFilename:
        "C:/Users/Mario Imanuel/Downloads/astute-catcher-439016-d5-806566661c6c.json",
    });

    // Translates the text
    const [translation] = await translate.translate(text, {
      from: sourceLanguage,
      to: targetLanguage,
    });

    return Response.json({ translatedText: translation });
  } catch (error) {
    console.error("Error in translation:", error);
    return Response.json(
      {
        error: error.message,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      {
        status: 500,
      }
    );
  }
}
