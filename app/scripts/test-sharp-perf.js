import fs from 'fs';
import sharp from 'sharp';

async function testCompression() {
  console.time('Total test');
  
  try {
    console.time('Load file');
    const buffer = fs.readFileSync('/home/hwilson/sync-experiments/PXL_20250527_034640179.jpg');
    console.timeEnd('Load file');
    
    console.log('File size:', buffer.length, 'bytes');
    
    console.time('Create sharp instance');
    const image = sharp(buffer);
    const metadata = await image.metadata();
    console.timeEnd('Create sharp instance');
    
    console.log('Image dimensions:', metadata.width, 'x', metadata.height);
    
    const qualities = [50, 30, 20, 15, 10, 5];
    
    for (const quality of qualities) {
      console.time(`Compress q${quality}`);
      const compressed = await image.clone().jpeg({ quality }).toBuffer();
      console.timeEnd(`Compress q${quality}`);
      
      const compressedSize = compressed.length;
      const ratio = (compressedSize / buffer.length * 100).toFixed(1);
      console.log(`Quality ${quality}: ${compressedSize} bytes (${ratio}%)`);
      
      if (compressedSize <= 200 * 1024) {
        console.log('✅ Target achieved at quality', quality);
        break;
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.timeEnd('Total test');
}

testCompression();