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

  const mergeNearbyRegions = (textBlocks) => {
    if (!textBlocks.length) return [];

    // Helper function to get block dimensions and center
    const getBlockGeometry = (block) => {
      const vertices = block.boundingPoly.vertices;
      const x = Math.min(...vertices.map((v) => v.x));
      const y = Math.min(...vertices.map((v) => v.y));
      const maxX = Math.max(...vertices.map((v) => v.x));
      const maxY = Math.max(...vertices.map((v) => v.y));
      const width = maxX - x;
      const height = maxY - y;
      const centerX = x + width / 2;
      const centerY = y + height / 2;

      return { x, y, maxX, maxY, width, height, centerX, centerY };
    };

    // First, group blocks into speech bubbles
    const bubbleGroups = [];
    const visited = new Set();

    // Find overlapping or nearby blocks that form speech bubbles
    for (let i = 0; i < textBlocks.length; i++) {
      if (visited.has(i)) continue;

      const currentGroup = [textBlocks[i]];
      visited.add(i);

      const baseGeom = getBlockGeometry(textBlocks[i]);
      const expandedBounds = {
        minX: baseGeom.x - baseGeom.width * 2,
        maxX: baseGeom.maxX + baseGeom.width * 2,
        minY: baseGeom.y - baseGeom.height * 2,
        maxY: baseGeom.maxY + baseGeom.height * 2,
      };

      for (let j = 0; j < textBlocks.length; j++) {
        if (i === j || visited.has(j)) continue;

        const testGeom = getBlockGeometry(textBlocks[j]);

        // Check if block is within expanded bounds
        if (
          testGeom.centerX >= expandedBounds.minX &&
          testGeom.centerX <= expandedBounds.maxX &&
          testGeom.centerY >= expandedBounds.minY &&
          testGeom.centerY <= expandedBounds.maxY
        ) {
          currentGroup.push(textBlocks[j]);
          visited.add(j);
        }
      }

      bubbleGroups.push(currentGroup);
    }

    // Process each bubble group
    return bubbleGroups.map((group) => {
      const blockGeometries = group.map((block, index) => ({
        ...getBlockGeometry(block),
        text: block.description,
        index,
        originalBlock: block,
      }));

      // Calculate the median block width for this group
      const medianWidth = blockGeometries
        .map((g) => g.width)
        .sort((a, b) => a - b)[Math.floor(blockGeometries.length / 2)];

      // Identify vertical columns with stricter alignment
      const columnThreshold = medianWidth * 0.8; // More strict threshold
      const columns = [];
      const processedBlocks = new Set();

      // Sort blocks by x-coordinate (right to left)
      const sortedByX = [...blockGeometries].sort(
        (a, b) => b.centerX - a.centerX
      );

      // Group blocks into columns with stricter vertical alignment
      while (sortedByX.length > 0) {
        const currentBlock = sortedByX[0];
        if (!processedBlocks.has(currentBlock.index)) {
          const currentColumn = [currentBlock];
          processedBlocks.add(currentBlock.index);

          // Find blocks that align vertically with the current block
          for (let i = 1; i < sortedByX.length; i++) {
            const testBlock = sortedByX[i];
            if (!processedBlocks.has(testBlock.index)) {
              // Check for strict vertical alignment
              const xDiff = Math.abs(currentBlock.centerX - testBlock.centerX);
              const verticalOverlap = !(
                testBlock.maxY < currentBlock.y ||
                testBlock.y > currentBlock.maxY
              );

              if (xDiff <= columnThreshold && verticalOverlap) {
                currentColumn.push(testBlock);
                processedBlocks.add(testBlock.index);
              }
            }
          }

          // Sort blocks in column strictly by y-coordinate (top to bottom)
          currentColumn.sort((a, b) => a.centerY - b.centerY);
          columns.push(currentColumn);
        }

        // Remove processed blocks from sortedByX
        sortedByX.splice(0, 1);
      }

      // Calculate bounding box for the entire bubble
      const allBlocks = blockGeometries;
      const bubbleX = Math.min(...allBlocks.map((b) => b.x));
      const bubbleY = Math.min(...allBlocks.map((b) => b.y));
      const bubbleMaxX = Math.max(...allBlocks.map((b) => b.maxX));
      const bubbleMaxY = Math.max(...allBlocks.map((b) => b.maxY));

      // Sort columns right to left based on their rightmost block
      columns.sort((a, b) => {
        const aMaxX = Math.max(...a.map((block) => block.maxX));
        const bMaxX = Math.max(...b.map((block) => block.maxX));
        return bMaxX - aMaxX;
      });

      // Debug info for visualization
      const debugInfo = columns.map((column, colIndex) => ({
        columnIndex: colIndex,
        blocks: column.map((block, blockIndex) => ({
          text: block.text,
          order: blockIndex,
          geometry: {
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
          },
        })),
      }));

      // Combine text in proper reading order
      const text = columns
        .map(
          (column) => column.map((block) => block.text).join("") // No spaces within columns for Japanese text
        )
        .join(" "); // Space between columns

      return {
        x: bubbleX,
        y: bubbleY,
        width: bubbleMaxX - bubbleX,
        height: bubbleMaxY - bubbleY,
        text,
        debugInfo, // Include debug info for visualization
        originalBox: {
          x: bubbleX,
          y: bubbleY,
          width: bubbleMaxX - bubbleX,
          height: bubbleMaxY - bubbleY,
        },
      };
    });
  };

  // Modify drawDetectionRegions to show column information
  const drawDetectionRegions = (ctx, regions, textBlocks) => {
    // Draw original detected blocks in red
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;

    textBlocks.forEach((block, index) => {
      const vertices = block.boundingPoly.vertices;

      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      // Add block index
      ctx.fillStyle = "red";
      ctx.font = "10px Arial";
      ctx.fillText(index.toString(), vertices[0].x, vertices[0].y - 2);
    });

    // Draw merged regions and their columns
    regions.forEach((region, regionIndex) => {
      // Draw bubble boundary in blue
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(region.x, region.y, region.width, region.height);
      ctx.stroke();

      // Draw columns in different colors
      region.debugInfo.forEach((column, columnIndex) => {
        const hue = (120 + columnIndex * 60) % 360; // Different color for each column
        ctx.strokeStyle = `hsl(${hue}, 70%, 50%)`;
        ctx.lineWidth = 2;

        // Draw boxes around each block in the column
        column.blocks.forEach((block, blockIndex) => {
          const { x, y, width, height } = block.geometry;
          ctx.beginPath();
          ctx.rect(x, y, width, height);
          ctx.stroke();

          // Add column and block order information
          ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
          ctx.font = "12px Arial";
          ctx.fillText(`C${columnIndex}:${blockIndex}`, x, y - 2);
        });
      });
    });
  };

  const fitTextInBubble = (ctx, text, maxWidth, maxHeight) => {
    let fontSize = maxHeight * 0.8; // Start with a large font size
    const minFontSize = 8; // Minimum readable font size

    // Binary search for the best font size
    while (fontSize > minFontSize) {
      ctx.font = `${fontSize}px Arial`;
      const words = text.split(" ");
      let lines = [];
      let currentLine = words[0];

      // Try to fit words into lines
      for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + " " + words[i];
        const metrics = ctx.measureText(testLine);

        if (metrics.width <= maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = words[i];
        }
      }
      lines.push(currentLine);

      // Check if text fits within height
      const totalTextHeight = lines.length * (fontSize * 1.2); // 1.2 for line spacing

      if (
        totalTextHeight <= maxHeight &&
        lines.every((line) => ctx.measureText(line).width <= maxWidth)
      ) {
        return { fontSize, lines };
      }

      fontSize -= 1;
    }

    // If we get here, use minimum font size
    ctx.font = `${minFontSize}px Arial`;
    return { fontSize: minFontSize, lines: [text] };
  };

  const drawTranslatedText = (ctx, region, translatedText) => {
    // Clear the original region with white
    ctx.fillStyle = "white";
    ctx.fillRect(region.x, region.y, region.width, region.height);

    // Set up text drawing
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Fit text in bubble
    const { fontSize, lines } = fitTextInBubble(
      ctx,
      translatedText,
      region.width * 0.9, // 90% of bubble width
      region.height * 0.9 // 90% of bubble height
    );

    // Draw each line
    ctx.font = `${fontSize}px Arial`;
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = region.y + (region.height - totalHeight) / 2 + fontSize / 2;

    lines.forEach((line, index) => {
      ctx.fillText(
        line,
        region.x + region.width / 2,
        startY + index * lineHeight
      );
    });
  };

  const detectAndTranslateText = async (imageUrl) => {
    try {
      setError(null);
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

      // Merge nearby text regions that are likely in the same speech bubble
      const textBlocks = visionData.textAnnotations.slice(1);
      const mergedRegions = mergeNearbyRegions(textBlocks);

      // Sort regions top to bottom (manga reading order)
      const sortedRegions = mergedRegions.sort((a, b) => a.y - b.y);

      // Translate merged regions
      const translations = await Promise.all(
        sortedRegions.map(async (region) => {
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
      // First, draw the original image
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          resolve();
        };
        img.src = selectedImage;
      });

      // Detect text
      const visionResponse = await fetch("/api/detect-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: selectedImage }),
      });

      const visionData = await visionResponse.json();

      if (!visionData.textAnnotations) {
        throw new Error("No text detected in the image");
      }

      // Get text blocks (skip the first one which is the entire text)
      const textBlocks = visionData.textAnnotations.slice(1);

      // Merge regions
      const mergedRegions = mergeNearbyRegions(textBlocks);

      // Draw detection visualization
      drawDetectionRegions(ctx, mergedRegions, textBlocks);

      // Store the visualization
      setProcessedImage(canvas.toDataURL());

      // Translate the detected text
      const translations = await Promise.all(
        mergedRegions.map(async (region) => {
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

      setDetectedRegions(translations);

      // Create final translated image
      ctx.drawImage(img, 0, 0);
      translations.forEach((region) => {
        drawTranslatedText(ctx, region, region.translatedText);
      });
    } catch (error) {
      console.error("Error in translation:", error);
      setError(error.message);
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
          <p className="text-sm text-red-500 mt-2">
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
                  className="p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4 mb-4"
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
