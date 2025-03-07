---
title: Gemini P5 Editor
emoji: 🎨
colorFrom: blue
colorTo: purple
sdk: docker
app_file: app.py
pinned: false
---

# Gemini P5 Editor

An interactive p5.js code editor powered by Google's Gemini AI model. Write and execute p5.js sketches with AI assistance.

## Deployment on Hugging Face Spaces

This application is configured to run on Hugging Face Spaces using Docker. To deploy:

1. Create a new Space on Hugging Face:
   - Go to huggingface.co/spaces
   - Click "Create new Space"
   - Choose a name for your space
   - Select "Docker" as the SDK
   - Choose "Blank" as the template
   - Set the hardware as "CPU basic"

2. Push your code to the Space:
   ```bash
   # Add the Hugging Face Space as a remote
   git remote add space https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME

   # Push your code to the Space
   git push space main
   ```

3. Environment Variables:
   - In your Space's settings, add the following environment variable:
     - GEMINI_API_KEY: Your Google AI API key

The application will automatically build and deploy. You can monitor the build process in the "Factory" tab of your Space.

## Local Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. 