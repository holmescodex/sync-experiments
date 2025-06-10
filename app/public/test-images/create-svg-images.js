// Create SVG test images that can be used as placeholders
import fs from 'fs';

function createSVG(width, height, color, text, filename) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${color}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
        text-anchor="middle" dominant-baseline="middle" fill="white">${text}</text>
</svg>`;
  
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename} (${width}x${height})`);
}

// Create test images
createSVG(800, 600, '#4682B4', 'Test Landscape', 'landscape.svg');
createSVG(400, 600, '#DC143C', 'Portrait Photo', 'portrait.svg');
createSVG(600, 400, '#4B0082', 'Abstract Art', 'abstract.svg');
createSVG(500, 300, '#323232', 'Technical Diagram', 'diagram.svg');
createSVG(300, 300, '#228B22', 'Small Image', 'small.svg');

console.log('All SVG test images created!');