import { ImageAnnotatorClient } from "@google-cloud/vision";

export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    // Create a client
    const client = new ImageAnnotatorClient({
      keyFilename:
        "C:/Users/Mario Imanuel/Downloads/astute-catcher-439016-d5-806566661c6c.json",
    });

    // Remove the data URL prefix if present
    const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

    // Convert base64 image to buffer
    const imageBuffer = Buffer.from(base64Image, "base64");

    // Perform text detection
    const [result] = await client.textDetection({
      image: {
        content: imageBuffer,
      },
    });

    if (
      !result ||
      !result.textAnnotations ||
      result.textAnnotations.length === 0
    ) {
      return Response.json(
        { error: "No text detected in image" },
        { status: 404 }
      );
    }

    return Response.json({
      textAnnotations: result.textAnnotations,
      fullTextAnnotation: result.fullTextAnnotation,
    });
  } catch (error) {
    console.error("Error in text detection:", error);
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
