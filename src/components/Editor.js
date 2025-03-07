'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

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

const normalizeCode = (code) => {
  // Remove all comments (both single line and multi-line)
  const noComments = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  // Remove all non-syntactic whitespace and newlines
  return noComments.replace(/\s+/g, ' ').trim();
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
  const [normalizedCode, setNormalizedCode] = useState(normalizeCode(INITIAL_CODE));
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
    const newNormalizedCode = normalizeCode(code);
    if (newNormalizedCode !== normalizedCode) {
      setNormalizedCode(newNormalizedCode);
      if (iframeRef.current) {
        const iframe = iframeRef.current;
        iframe.srcdoc = getIframeContent(code);
      }
    }
  }, [code, normalizedCode]);

  // Now generateCode can safely use the functions defined above
  const generateCode = useCallback(async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          modelName: selectedModel,
          temperature: parseFloat(temperature)
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setCode(data.code);

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

  // Initial load effect
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = getIframeContent(code);
    }
  }, []);

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
              onChange={(value) => {
                setCode(value);
                updatePreview();
              }}
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
        <div className="absolute bottom-8 left-4 right-4 flex items-center gap-6 px-6 py-4 bottom-controls">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Write code for a clock using p5.js"
            className="flex-1 px-4 py-2 rounded-md control-input"
          />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-4 py-2 rounded-md control-input"
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
              className="w-20 px-2 py-2 rounded-md control-input"
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setAutoSave(!autoSave)}
              className={`px-4 py-2 ${
                autoSave ? 'active' : 'bg-gray-600'
              } text-white rounded-md control-button`}
            >
              Auto-save
            </button>
            <button
              onClick={handleScreenshot}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md control-button"
            >
              Save Screenshot
            </button>
            <button
              onClick={handleSaveCode}
              className="px-4 py-2 bg-purple-600 text-white rounded-md control-button"
            >
              Save Code
            </button>
            <button
              onClick={() => setAutoGenerate(!autoGenerate)}
              className={`px-4 py-2 ${
                autoGenerate ? 'active' : 'bg-gray-600'
              } text-white rounded-md control-button`}
            >
              Auto-generate
            </button>
            <button
              onClick={generateCode}
              disabled={isGenerating}
              className={`px-6 py-2 ${
                isGenerating
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600'
              } text-white rounded-md control-button`}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 