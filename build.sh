#!/bin/bash

# Auto Bot 78Win - Build Script
echo "🚀 Starting Auto Bot 78Win build process..."

# Check if electron-builder is installed
if ! command -v electron-builder &> /dev/null; then
    echo "📦 Installing electron-builder..."
    npm install --save-dev electron-builder
fi

# Create default icon if it doesn't exist
if [ ! -f "assets/icon.png" ]; then
    echo "🎨 Creating default icon..."
    # Create a simple 256x256 icon using Node.js (will be replaced with proper icon)
    node -e "
    const fs = require('fs');
    const path = require('path');
    
    // Create a simple SVG icon
    const svgIcon = \`<svg width='256' height='256' xmlns='http://www.w3.org/2000/svg'>
      <rect width='256' height='256' fill='#0078d7'/>
      <text x='128' y='140' text-anchor='middle' fill='white' font-size='48' font-family='Arial'>🎰</text>
      <text x='128' y='190' text-anchor='middle' fill='white' font-size='20' font-family='Arial'>Auto Bot</text>
      <text x='128' y='215' text-anchor='middle' fill='white' font-size='16' font-family='Arial'>78Win</text>
    </svg>\`;
    
    fs.writeFileSync('assets/icon.svg', svgIcon);
    console.log('✅ Default icon created');
    "
fi

# Build for Windows portable
echo "🔨 Building Windows portable executable..."
npm run build-win

echo "✅ Build completed!"
echo "📁 Check the 'dist' folder for your portable executable"
echo "🎯 Look for: AutoBot-78Win-Portable-1.0.0.exe"
