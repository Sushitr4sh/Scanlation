"use client";
import React, { useState, useRef } from "react";
import { Upload } from "lucide-react";

const MangaTranslator = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedRegions, setDetectedRegions] = useState([]);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  const detectAndTranslateText = async (imageUrl) => {
    try {
      setError(null);
      // First, detect text using Cloud Vision API
      const visionResponse = await fetch("/api/detect-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: imageUrl }),
      });

      const visionData = await visionResponse.json();

      if (!visionData.textAnnotations) {
        throw new Error("No text detected in the image");
      }

      // Process detected text blocks
      const textBlocks = visionData.textAnnotations.slice(1); // Skip the first entry which is the entire text
      const regions = textBlocks.map((block) => {
        const vertices = block.boundingPoly.vertices;
        const x = Math.min(...vertices.map((v) => v.x));
        const y = Math.min(...vertices.map((v) => v.y));
        const width = Math.max(...vertices.map((v) => v.x)) - x;
        const height = Math.max(...vertices.map((v) => v.y)) - y;

        return {
          x,
          y,
          width,
          height,
          text: block.description,
        };
      });

      // Translate detected text using Cloud Translation API
      const translations = await Promise.all(
        regions.map(async (region) => {
          const translateResponse = await fetch("/api/translate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: region.text,
              targetLanguage: "en",
              sourceLanguage: "ja",
            }),
          });

          const translateData = await translateResponse.json();
          return {
            ...region,
            translatedText: translateData.translatedText,
          };
        })
      );

      return translations;
    } catch (error) {
      console.error("Error in text detection and translation:", error);
      setError(error.message);
      throw error;
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target.result);
        const img = new Image();
        img.onload = () => {
          drawOriginalImage(img);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const drawOriginalImage = (img) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    setProcessedImage(canvas.toDataURL());
  };

  const translateText = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    try {
      const regions = await detectAndTranslateText(selectedImage);
      setDetectedRegions(regions);

      // Draw the original image
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);

        // Draw translated text
        regions.forEach((region) => {
          // Clear original region
          ctx.fillStyle = "white";
          ctx.fillRect(region.x, region.y, region.width, region.height);

          // Draw translated text
          ctx.fillStyle = "black";
          const fontSize = Math.min(16, region.height * 0.8);
          ctx.font = `${fontSize}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Word wrap and draw text
          const words = region.translatedText.split(" ");
          let line = "";
          let y = region.y + region.height / 2;
          const maxWidth = region.width * 0.9;

          words.forEach((word) => {
            const testLine = line + word + " ";
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && line !== "") {
              ctx.fillText(line, region.x + region.width / 2, y);
              line = word + " ";
              y += fontSize;
            } else {
              line = testLine;
            }
          });
          ctx.fillText(line, region.x + region.width / 2, y);
        });

        setProcessedImage(canvas.toDataURL());
      };
      img.src = selectedImage;
    } catch (error) {
      console.error("Error in translation:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
      <div className="space-y-6">
        <div className="flex flex-col items-center p-6 border-2 border-dashed rounded-lg border-gray-300 hover:border-gray-400 transition-colors">
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            id="manga-upload"
          />
          <label
            htmlFor="manga-upload"
            className="cursor-pointer text-blue-500 hover:text-blue-600"
          >
            Upload Manga Panel
          </label>
          <p className="text-sm text-gray-500 mt-2">
            Supports PNG, JPG up to 10MB
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {selectedImage && (
            <div className="space-y-2">
              <h3 className="font-medium">Original Image</h3>
              <div className="relative aspect-square w-full">
                <img
                  src={selectedImage}
                  alt="Original manga panel"
                  className="object-contain w-full h-full"
                />
              </div>
            </div>
          )}

          {processedImage && (
            <div className="space-y-2">
              <h3 className="font-medium">Processed Image</h3>
              <div className="relative aspect-square w-full">
                <img
                  src={processedImage}
                  alt="Processed manga panel"
                  className="object-contain w-full h-full"
                />
              </div>
            </div>
          )}
        </div>

        {detectedRegions.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-medium">Detected Text and Translations</h3>
            <div className="space-y-2">
              {detectedRegions.map((region, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4"
                >
                  <div>
                    <p className="text-sm text-gray-600">Japanese Text:</p>
                    <p className="font-medium">{region.text}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">
                      English Translation:
                    </p>
                    <p className="font-medium">{region.translatedText}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {selectedImage && (
          <div className="flex justify-end space-x-4">
            <button
              onClick={translateText}
              disabled={isProcessing}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Processing..." : "Translate Text"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MangaTranslator;
