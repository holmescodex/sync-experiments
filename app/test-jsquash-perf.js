import fs from 'fs';
import { decode as decodeJpeg, encode as encodeJpeg } from '@jsquash/jpeg';

async function testCompression() {
  console.time('Total test');
  
  try {
    console.time('Load file');
    const buffer = fs.readFileSync('/home/hwilson/sync-experiments/PXL_20250527_034640179.jpg');
    console.timeEnd('Load file');
    
    console.log('File size:', buffer.length, 'bytes');
    
    console.time('Decode JPEG');
    const imageData = await decodeJpeg(new Uint8Array(buffer));
    console.timeEnd('Decode JPEG');
    
    console.log('Image dimensions:', imageData.width, 'x', imageData.height);
    
    const qualities = [50, 30, 20, 15, 10, 5];
    
    for (const quality of qualities) {
      console.time(`Encode q${quality}`);
      const compressed = await encodeJpeg(imageData, { quality });
      console.timeEnd(`Encode q${quality}`);
      
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