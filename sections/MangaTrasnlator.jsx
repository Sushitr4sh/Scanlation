"use client";
import React, { useState, useRef, useEffect } from "react";
import { Upload } from "lucide-react";
import { createWorker } from "tesseract.js";

const MangaTranslator = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedRegions, setDetectedRegions] = useState([]);
  const [opencv, setOpencv] = useState(null);
  const canvasRef = useRef(null);
  const [ocrWorker, setOcrWorker] = useState(null);

  useEffect(() => {
    // Initialize OpenCV
    if (typeof window !== "undefined") {
      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.8.0/opencv.js";
      script.async = true;
      script.onload = () => {
        console.log("OpenCV.js loaded");
        setOpencv(window.cv);
      };
      document.body.appendChild(script);
    }

    // Initialize Tesseract with improved Japanese settings
    const initWorker = async () => {
      try {
        const worker = await createWorker();
        await worker.loadLanguage("jpn+jpn_vert"); // Load both horizontal and vertical Japanese
        await worker.initialize("jpn+jpn_vert");
        // Set parameters for better Japanese recognition
        await worker.setParameters({
          preserve_interword_spaces: "1",
          textord_tabfind_vertical_text: "1",
          textord_tabfind_vertical_horizontal_mix: "1",
        });
        setOcrWorker(worker);
      } catch (error) {
        console.error("Error initializing OCR worker:", error);
      }
    };

    initWorker();

    return () => {
      if (ocrWorker) {
        ocrWorker.terminate();
      }
    };
  }, []);

  const detectTextRegions = async (imageElement) => {
    if (!opencv) {
      console.error("OpenCV not loaded");
      return [];
    }

    try {
      console.log("Starting text detection...");
      const src = opencv.imread(imageElement);

      // Convert to grayscale
      const gray = new opencv.Mat();
      opencv.cvtColor(src, gray, opencv.COLOR_RGBA2GRAY);

      // Apply bilateral filter to preserve text edges while reducing noise
      const filtered = new opencv.Mat();
      opencv.bilateralFilter(gray, filtered, 9, 75, 75);

      // Apply OTSU threshold with increased sensitivity
      const thresh = new opencv.Mat();
      opencv.threshold(
        filtered,
        thresh,
        0,
        255,
        opencv.THRESH_OTSU | opencv.THRESH_BINARY_INV
      );

      // Create rectangular kernel optimized for Japanese text
      const rectKernel = opencv.getStructuringElement(
        opencv.MORPH_RECT,
        new opencv.Size(5, 15) // Adjusted for typical Japanese character aspect ratio
      );

      // Apply dilation
      const dilation = new opencv.Mat();
      opencv.dilate(thresh, dilation, rectKernel, new opencv.Point(-1, -1), 1);

      // Find contours
      const contours = new opencv.MatVector();
      const hierarchy = new opencv.Mat();
      opencv.findContours(
        dilation,
        contours,
        hierarchy,
        opencv.RETR_EXTERNAL,
        opencv.CHAIN_APPROX_SIMPLE
      );

      // Process contours
      const regions = [];
      const minArea = 200; // Minimum area to be considered text
      const maxArea = src.rows * src.cols * 0.3; // Maximum area (30% of image)

      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = opencv.contourArea(contour);

        if (area > minArea && area < maxArea) {
          const rect = opencv.boundingRect(contour);
          const aspectRatio = rect.width / rect.height;

          // Adjust aspect ratio range for Japanese text (both vertical and horizontal)
          if (
            aspectRatio > 0.1 &&
            aspectRatio < 10 &&
            rect.width > 15 &&
            rect.height > 15
          ) {
            // Expand region slightly to ensure full text capture
            const padding = 5;
            const x = Math.max(0, rect.x - padding);
            const y = Math.max(0, rect.y - padding);
            const width = Math.min(src.cols - x, rect.width + padding * 2);
            const height = Math.min(src.rows - y, rect.height + padding * 2);

            const roi = src.roi(new opencv.Rect(x, y, width, height));
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = width;
            tempCanvas.height = height;
            opencv.imshow(tempCanvas, roi);

            regions.push({
              x,
              y,
              width,
              height,
              canvas: tempCanvas,
            });

            roi.delete();
          }
        }
        contour.delete();
      }

      // Cleanup
      src.delete();
      gray.delete();
      filtered.delete();
      thresh.delete();
      dilation.delete();
      rectKernel.delete();
      contours.delete();
      hierarchy.delete();

      console.log("Detection completed. Found", regions.length, "regions");
      return regions;
    } catch (error) {
      console.error("Error detecting text regions:", error);
      return [];
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target.result);
        const img = new Image();
        img.onload = async () => {
          const regions = await detectTextRegions(img);
          setDetectedRegions(regions);
          drawDetectedRegions(img, regions);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const drawDetectedRegions = (img, regions) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = img.width;
    canvas.height = img.height;

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Draw detected regions
    ctx.strokeStyle = "green";
    ctx.lineWidth = 2;
    regions.forEach((region) => {
      ctx.strokeRect(region.x, region.y, region.width, region.height);
    });

    setProcessedImage(canvas.toDataURL());
  };

  const translateText = async () => {
    if (!ocrWorker || detectedRegions.length === 0) return;

    setIsProcessing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    try {
      for (const region of detectedRegions) {
        // Try both vertical and horizontal recognition
        const result = await ocrWorker.recognize(region.canvas.toDataURL(), {
          tessedit_pageseg_mode: "5", // Assume vertical text
        });
        let detectedText = result.data.text.trim();

        // If no text detected, try horizontal
        if (!detectedText) {
          const horizontalResult = await ocrWorker.recognize(
            region.canvas.toDataURL(),
            {
              tessedit_pageseg_mode: "3", // Assume horizontal text
            }
          );
          detectedText = horizontalResult.data.text.trim();
        }

        if (detectedText) {
          const translatedText = await mockTranslate(detectedText);

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
          const words = translatedText.split(" ");
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
        }
      }
    } catch (error) {
      console.error("Error in translation:", error);
    } finally {
      setProcessedImage(canvas.toDataURL());
      setIsProcessing(false);
    }
  };

  const mockTranslate = async (text) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockTranslations = {
          こんにちは: "Hello",
          さようなら: "Goodbye",
          ありがとう: "Thank you",
          おはよう: "Good morning",
          かわいい: "Cute",
          すごい: "Amazing",
          よろしく: "Nice to meet you",
          がんばって: "Good luck",
          // Add more translations as needed
        };
        resolve(mockTranslations[text] || "[Translation not found]");
      }, 500);
    });
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
