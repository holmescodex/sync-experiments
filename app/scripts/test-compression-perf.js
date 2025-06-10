import fs from 'fs';

async function testCompression() {
  console.time('Total test');
  
  try {
    // Import the module properly
    const module = await import('./src/utils/ImageCompressor.ts');
    const { ImageCompressor } = module;
    
    console.time('Load file');
    const buffer = fs.readFileSync('/home/hwilson/sync-experiments/PXL_20250527_034640179.jpg');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    console.timeEnd('Load file');
    
    console.log('File size:', arrayBuffer.byteLength, 'bytes');
    console.log('Above threshold?', arrayBuffer.byteLength > 200 * 1024);
    
    console.time('Compression');
    const result = await ImageCompressor.compressJpeg(arrayBuffer);
    console.timeEnd('Compression');
    
    console.log('Results:');
    console.log('- Original size:', result.originalSize);
    console.log('- Compressed size:', result.compressedSize);
    console.log('- Compression ratio:', result.compressionRatio.toFixed(3));
    console.log('- Was compressed:', result.wasCompressed);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  
  console.timeEnd('Total test');
}

testCompression();