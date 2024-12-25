import { NextResponse } from "next/server";
import { Translate } from "@google-cloud/translate/build/src/v2";

export async function POST(request) {
  try {
    const { text } = await request.json();

    const translate = new Translate({
      projectId: "",
      keyFilename: "",
    });

    const [translation] = await translate.translate(text, {
      from: "ja",
      to: "en",
    });

    return NextResponse.json({ translation });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
