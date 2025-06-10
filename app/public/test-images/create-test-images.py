#!/usr/bin/env python3
"""
Generate test images for file attachment UI testing.
Creates simple colored images with text overlays.
"""

from PIL import Image, ImageDraw, ImageFont
import io
import base64

def create_test_image(width, height, color, text, filename):
    """Create a test image with solid color and text overlay."""
    # Create image with solid color
    img = Image.new('RGB', (width, height), color)
    draw = ImageDraw.Draw(img)
    
    # Try to use a default font, fallback to basic if needed
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 48)
        except:
            font = ImageFont.load_default()
    
    # Calculate text position (centered)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    # Draw text with white color
    draw.text((x, y), text, fill='white', font=font)
    
    # Save image
    img.save(filename, 'JPEG', quality=85, optimize=True)
    print(f"Created {filename} ({width}x{height})")

def create_png_image(width, height, color, text, filename):
    """Create a PNG test image with transparency."""
    img = Image.new('RGBA', (width, height), color + (255,))
    draw = ImageDraw.Draw(img)
    
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
    except:
        font = ImageFont.load_default()
    
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    
    img.save(filename, 'PNG', optimize=True)
    print(f"Created {filename} ({width}x{height})")

if __name__ == "__main__":
    # Create various test images
    create_test_image(800, 600, (70, 130, 180), "Test Landscape", "landscape.jpg")
    create_test_image(400, 600, (220, 20, 60), "Portrait Photo", "portrait.jpg") 
    create_test_image(600, 400, (75, 0, 130), "Abstract Art", "abstract.jpg")
    create_png_image(500, 300, (50, 50, 50), "Technical Diagram", "diagram.png")
    create_test_image(300, 300, (34, 139, 34), "Small Image", "small.jpg")
    
    print("All test images created successfully!")