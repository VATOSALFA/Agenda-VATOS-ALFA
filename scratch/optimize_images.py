import os
from PIL import Image

public_dir = "public"

def optimize_images():
    print("Optimizing images...")
    
    # 1. logo-vatos-wa.png -> Resize to 128x128 and convert to WebP
    wa_png_path = os.path.join(public_dir, "logo-vatos-wa.png")
    wa_webp_path = os.path.join(public_dir, "logo-vatos-wa.webp")
    if os.path.exists(wa_png_path):
        print(f"Resizing and converting {wa_png_path}...")
        img = Image.open(wa_png_path)
        img = img.resize((128, 128), Image.Resampling.LANCZOS)
        img.save(wa_webp_path, "WEBP", quality=85)
        print(f"Saved optimized logo to {wa_webp_path} (Size: {os.path.getsize(wa_webp_path)} bytes)")

    # 2. logo-vatos-alfa.png -> Convert to WebP
    alfa_png_path = os.path.join(public_dir, "logo-vatos-alfa.png")
    alfa_webp_path = os.path.join(public_dir, "logo-vatos-alfa.webp")
    if os.path.exists(alfa_png_path):
        print(f"Converting {alfa_png_path} to WebP...")
        img = Image.open(alfa_png_path)
        img.save(alfa_webp_path, "WEBP", quality=85)
        print(f"Saved optimized logo to {alfa_webp_path} (Size: {os.path.getsize(alfa_webp_path)} bytes)")

    # 3. logo-header-blanco.png -> Convert to WebP
    blanco_png_path = os.path.join(public_dir, "logo-header-blanco.png")
    blanco_webp_path = os.path.join(public_dir, "logo-header-blanco.webp")
    if os.path.exists(blanco_png_path):
        print(f"Converting {blanco_png_path} to WebP...")
        img = Image.open(blanco_png_path)
        img.save(blanco_webp_path, "WEBP", quality=85)
        print(f"Saved optimized logo to {blanco_webp_path} (Size: {os.path.getsize(blanco_webp_path)} bytes)")

if __name__ == "__main__":
    optimize_images()
