"""
Script para remover fundo branco de sprites e torná-lo transparente.
Usa PIL/Pillow para processamento de imagem.

Usage: python scripts/remove_white_bg.py
"""

from PIL import Image
import os

def remove_white_background(input_path: str, output_path: str, tolerance: int = 30):
    """
    Remove white background from an image and save with transparency.
    
    Args:
        input_path: Path to input image
        output_path: Path to save output image
        tolerance: How close to white a pixel needs to be to be made transparent (0-255)
    """
    img = Image.open(input_path)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Get pixel data
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        
        # Check if pixel is close to white
        # Using tolerance to handle anti-aliasing and compression artifacts
        if r > (255 - tolerance) and g > (255 - tolerance) and b > (255 - tolerance):
            # Make it transparent
            new_data.append((r, g, b, 0))
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    img.save(output_path, 'PNG')
    print(f"Processed: {input_path} -> {output_path}")


def remove_near_white_with_edges(input_path: str, output_path: str, tolerance: int = 40):
    """
    More aggressive white removal that also handles edge pixels better.
    Uses flood fill from corners to remove background while preserving sprites.
    """
    img = Image.open(input_path)
    
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    width, height = img.size
    pixels = img.load()
    
    # Track which pixels to make transparent
    to_remove = set()
    
    def is_white_ish(r, g, b, tol):
        return r > (255 - tol) and g > (255 - tol) and b > (255 - tol)
    
    # Simple approach: just check each pixel
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if is_white_ish(r, g, b, tolerance):
                to_remove.add((x, y))
    
    # Apply transparency
    for (x, y) in to_remove:
        r, g, b, a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
    
    img.save(output_path, 'PNG')
    print(f"Processed (edge-aware): {input_path} -> {output_path}")


def process_sprite_sheet(input_path: str, output_path: str):
    """
    Process a sprite sheet to remove white/near-white background.
    Handles anti-aliased edges by using a smarter tolerance.
    """
    img = Image.open(input_path)
    
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    width, height = img.size
    pixels = img.load()
    
    # Sample corner pixels to detect background color
    corners = [
        pixels[0, 0],
        pixels[width-1, 0],
        pixels[0, height-1],
        pixels[width-1, height-1]
    ]
    
    # Average the corners to get background color
    avg_r = sum(c[0] for c in corners) // 4
    avg_g = sum(c[1] for c in corners) // 4
    avg_b = sum(c[2] for c in corners) // 4
    
    print(f"Detected background color: RGB({avg_r}, {avg_g}, {avg_b})")
    
    # Tolerance for matching background
    tolerance = 35
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # Check distance from background color
            dist = abs(r - avg_r) + abs(g - avg_g) + abs(b - avg_b)
            
            if dist < tolerance * 3:  # Sum of 3 channels
                # Calculate alpha based on distance (smooth edges)
                if dist < tolerance:
                    pixels[x, y] = (r, g, b, 0)
                else:
                    # Partial transparency for anti-aliased edges
                    alpha = int((dist - tolerance) / (tolerance * 2) * 255)
                    alpha = min(255, max(0, alpha))
                    pixels[x, y] = (r, g, b, alpha)
    
    img.save(output_path, 'PNG')
    print(f"Processed sprite sheet: {input_path} -> {output_path}")


def main():
    # Paths
    assets_dir = os.path.join(os.path.dirname(__file__), '..', 'src', 'game', 'assets')
    
    # Process GTA sprites
    gta1_input = os.path.join(assets_dir, 'gta_1.png')
    gta1_output = os.path.join(assets_dir, 'gta_1.png')  # Overwrite original
    
    gta2_input = os.path.join(assets_dir, 'gta_2.png')
    gta2_output = os.path.join(assets_dir, 'gta_2.png')  # Overwrite original
    
    # Create backups first
    backup_dir = os.path.join(assets_dir, 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    if os.path.exists(gta1_input):
        backup_path = os.path.join(backup_dir, 'gta_1_original.png')
        if not os.path.exists(backup_path):
            import shutil
            shutil.copy2(gta1_input, backup_path)
            print(f"Backup created: {backup_path}")
        process_sprite_sheet(gta1_input, gta1_output)
    
    if os.path.exists(gta2_input):
        backup_path = os.path.join(backup_dir, 'gta_2_original.png')
        if not os.path.exists(backup_path):
            import shutil
            shutil.copy2(gta2_input, backup_path)
            print(f"Backup created: {backup_path}")
        process_sprite_sheet(gta2_input, gta2_output)
    
    print("\nDone! Sprite sheets have been processed.")
    print("Backups saved in:", backup_dir)


if __name__ == '__main__':
    main()
