import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = './public/test-images';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function createTestImage(width, height, backgroundColor, text, filename, format = 'jpeg') {
  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Add gradient overlay for more realistic look
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add text
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add text with stroke for better visibility
  ctx.strokeText(text, width/2, height/2);
  ctx.fillText(text, width/2, height/2);
  
  // Add subtitle with file info
  ctx.font = '24px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const subtitle = `${width}×${height} • ${format.toUpperCase()}`;
  ctx.fillText(subtitle, width/2, height/2 + 60);
  
  // Save to file
  const outputPath = path.join(OUTPUT_DIR, filename);
  const buffer = format === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', { quality: 0.8 });
  fs.writeFileSync(outputPath, buffer);
  
  const sizeKB = Math.round(buffer.length / 1024);
  console.log(`Created ${filename} - ${width}×${height} - ${sizeKB}KB`);
  
  return { filename, size: buffer.length, width, height };
}

function createNoisePattern(width, height, filename) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Create noise pattern
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random() * 255;
    data[i] = noise * 0.3 + 100;     // R
    data[i + 1] = noise * 0.6 + 50;  // G  
    data[i + 2] = noise * 0.9 + 20;  // B
    data[i + 3] = 255;               // A
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Add title
  ctx.fillStyle = 'white';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  ctx.strokeText('Abstract Noise', width/2, height/2);
  ctx.fillText('Abstract Noise', width/2, height/2);
  
  const outputPath = path.join(OUTPUT_DIR, filename);
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
  fs.writeFileSync(outputPath, buffer);
  
  const sizeKB = Math.round(buffer.length / 1024);
  console.log(`Created ${filename} - ${width}×${height} - ${sizeKB}KB`);
  
  return { filename, size: buffer.length, width, height };
}

function createTechnicalDiagram(width, height, filename) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  
  // Draw technical diagram elements
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  
  // Draw boxes
  ctx.strokeRect(50, 50, 150, 80);
  ctx.strokeRect(300, 50, 150, 80);
  ctx.strokeRect(175, 180, 150, 80);
  
  // Draw connecting lines
  ctx.beginPath();
  ctx.moveTo(200, 90);
  ctx.lineTo(300, 90);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(125, 130);
  ctx.lineTo(250, 180);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(375, 130);
  ctx.lineTo(250, 180);
  ctx.stroke();
  
  // Add labels
  ctx.fillStyle = '#333';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Component A', 125, 95);
  ctx.fillText('Component B', 375, 95);
  ctx.fillText('Output', 250, 225);
  
  // Add title
  ctx.font = 'bold 24px Arial';
  ctx.fillText('System Architecture', width/2, 30);
  
  const outputPath = path.join(OUTPUT_DIR, filename);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  
  const sizeKB = Math.round(buffer.length / 1024);
  console.log(`Created ${filename} - ${width}×${height} - ${sizeKB}KB`);
  
  return { filename, size: buffer.length, width, height };
}

// Generate test images
console.log('Generating test images...\n');

const images = [
  createTestImage(800, 600, '#4682B4', 'Mountain Landscape', 'landscape.jpg'),
  createTestImage(400, 600, '#DC143C', 'Portrait Style', 'portrait.jpg'),
  createNoisePattern(600, 400, 'abstract.jpg'),
  createTechnicalDiagram(500, 300, 'diagram.png'),
  createTestImage(300, 300, '#228B22', 'Small Photo', 'small.jpg'),
  createTestImage(1200, 800, '#8B4513', 'Large Panorama', 'large.jpg'),
];

console.log('\n--- Summary ---');
images.forEach(img => {
  console.log(`${img.filename}: ${img.width}×${img.height}, ${Math.round(img.size/1024)}KB`);
});

console.log(`\nAll images saved to: ${OUTPUT_DIR}`);
console.log('Total images created:', images.length);