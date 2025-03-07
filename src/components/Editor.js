'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Dynamically import CodeMirror to avoid SSR issues
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror'),
  { ssr: false }
);

const INITIAL_CODE = `function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(220);
  ellipse(mouseX, mouseY, 50, 50);
}`;

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const getIframeContent = (userCode) => `
<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js"></script>
    <style>
      body { 
        margin: 0; 
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      main {
        display: block;
        margin: 0 auto;
      }
      .error {
        color: red;
        font-family: monospace;
        white-space: pre-wrap;
        padding: 10px;
      }
    </style>
  </head>
  <body>
    <script>
      // Error handling
      window.onerror = function(msg, url, lineNo, columnNo, error) {
        document.body.innerHTML = '<div class="error">Error: ' + msg + '</div>';
        return false;
      };

      window.console.error = function(...args) {
        document.body.innerHTML = '<div class="error">Error: ' + args.join(' ') + '</div>';
      };

      // Update message handler for screenshot
      window.addEventListener('message', function(event) {
        if (event.data.type === 'takeScreenshot') {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            window.parent.postMessage({ type: 'screenshot', data: dataUrl }, '*');
          }
        }
      });

      // User code
      ${userCode}
    </script>
  </body>
</html>
`;

export default function Editor() {
  const [code, setCode] = useState(INITIAL_CODE);
  const [prompt, setPrompt] = useState("");
  const iframeRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(400);
  const [isGenerating, setIsGenerating] = useState(false);
  const [temperature, setTemperature] = useState(1);
  const [autoSave, setAutoSave] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);

  // Add effect to update temperature when model changes
  useEffect(() => {
    setTemperature(selectedModel.includes('thinking') ? 0.7 : 1);
  }, [selectedModel]);

  const getTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-mm
  };

  const handleScreenshot = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage({ type: 'takeScreenshot' }, '*');
    }
  }, []);

  const handleSaveCode = useCallback(() => {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `p5js-sketch-${getTimestamp()}.js`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [code]);

  const updatePreview = useCallback(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      iframe.srcdoc = getIframeContent(code);
    }
  }, [code]);

  // Now generateCode can safely use the functions defined above
  const generateCode = useCallback(async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    try {
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        systemInstruction: "Respond only with p5.js JavaScript code. Do not add any additional commentary before or after the code.",
      });

      const chatSession = model.startChat({
        generationConfig: {
          ...generationConfig,
          temperature: parseFloat(temperature)
        },
        history: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      });

      const result = await chatSession.sendMessage(prompt);
      let generatedCode = result.response.text();
      
      if (generatedCode.includes('```')) {
        generatedCode = generatedCode
          .split('```')
          .filter((block, index) => index % 2 === 1)
          .join('\n')
          .replace(/^javascript\n/m, '')
          .trim();
      }

      setCode(generatedCode);

      if (autoGenerate) {
        // Wait a moment to let the preview update before generating again
        setTimeout(() => {
          generateCode();
        }, 500);
      }

    } catch (error) {
      console.error('Error generating code:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, selectedModel, temperature, prompt, autoGenerate]);

  // Update preview when code changes
  useEffect(() => {
    updatePreview();
    if (autoSave) {
      // Add small delay to ensure the sketch is rendered
      const timer = setTimeout(() => {
        handleScreenshot();
        handleSaveCode();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [code, updatePreview, autoSave, handleScreenshot, handleSaveCode]);

  // Update the message handler to be more specific
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'screenshot') {
        const link = document.createElement('a');
        link.download = `p5js-sketch-${getTimestamp()}.png`;
        link.href = event.data.data;
        link.click();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isGenerating) {
      generateCode();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="relative h-screen">
        <div className="flex h-full">
          <div className="w-1/2 border-r border-gray-700">
            <CodeMirror
              value={code}
              height="100vh"
              theme={vscodeDark}
              extensions={[javascript()]}
              onChange={(value) => setCode(value)}
            />
          </div>
          <div id="canvas-column" className="w-1/2 bg-white">
            <iframe
              ref={iframeRef}
              title="p5.js preview"
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
        <div className="absolute bottom-8 left-4 right-4 flex items-center gap-4 px-4 py-3 bg-[#1e1e1e] rounded-lg border border-gray-700 shadow-lg">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Write code for a clock using p5.js"
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-md border border-gray-600"
          />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-4 py-2 bg-gray-800 text-white rounded-md border border-gray-600"
          >
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            <option value="gemini-2.0-pro-exp-02-05">Gemini 2.0 Pro</option>
            <option value="gemini-2.0-flash-thinking-exp-01-21">Gemini 2.0 Flash Thinking</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="w-20 px-2 py-2 bg-gray-800 text-white rounded-md border border-gray-600"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <label className="text-white">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="mr-2"
                />
                Auto-save
              </label>
            </div>
            <button
              onClick={handleScreenshot}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Save Screenshot
            </button>
            <button
              onClick={handleSaveCode}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Save Code
            </button>
            <div className="flex items-center gap-2">
              <label className="text-white">
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(e) => setAutoGenerate(e.target.checked)}
                  className="mr-2"
                />
                Auto-generate
              </label>
            </div>
            <button
              onClick={generateCode}
              disabled={isGenerating}
              className={`px-6 py-2 ${
                isGenerating
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white rounded-md transition-colors`}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 