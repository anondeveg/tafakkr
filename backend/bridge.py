import sys
import os
import asyncio
import json

# Add standard library paths if needed, or add local python path
sys.path.insert(0, "/home/anondev/go/pkg/mod/github.com/anondeveg/shamla@v0.0.0-20260529223432-ef4b861c93b8/src")

try:
    import shamla as sh
except ImportError as e:
    print(json.dumps({"error": f"Failed to import shamla library: {e}"}))
    sys.exit(1)

# Default base directory for offline downloads
HOME_DIR = os.path.expanduser("~")
BASE_DOWNLOAD_DIR = os.path.join(HOME_DIR, ".tafakkr", "downloads")
os.makedirs(BASE_DOWNLOAD_DIR, exist_ok=True)

async def get_metadata(book_id: str):
    downloader = sh.BookDownloader(base_dir=BASE_DOWNLOAD_DIR)
    # Ensure metadata.html is downloaded
    await downloader.download_book(book_id, max_pages=0)
    
    scraper = sh.LocalScraper(base_dir=BASE_DOWNLOAD_DIR)
    meta = await scraper.get_book_metadata(book_id)
    
    result = {
        "id": meta.book_id,
        "title": meta.title,
        "author_name": meta.author_name,
        "author_page": meta.author_page,
        "publisher": meta.publisher or "",
        "book_print": meta.book_print or "",
        "volumes": meta.volumes,
        "is_equal_to_print": meta.is_equal_to_print,
        "book_description": meta.book_description or ""
    }
    print(json.dumps(result, ensure_ascii=False))

async def get_toc(book_id: str):
    downloader = sh.BookDownloader(base_dir=BASE_DOWNLOAD_DIR)
    # Ensure metadata.html is downloaded
    await downloader.download_book(book_id, max_pages=0)
    
    scraper = sh.LocalScraper(base_dir=BASE_DOWNLOAD_DIR)
    toc = await scraper.get_book_toc(book_id)
    
    chapters = []
    for ch in toc:
        chapters.append({
            "book_id": book_id,
            "title": ch.title,
            "url": ch.url,
            "page_number": ch.page_number,
            "depth": ch.depth
        })
    print(json.dumps(chapters, ensure_ascii=False))

async def get_page(book_id: str, page_number: int):
    # Download page if it doesn't exist
    downloader = sh.BookDownloader(base_dir=BASE_DOWNLOAD_DIR)
    # We download specifically up to that page
    # Since BookDownloader downloads sequentially, let's write a small helper to download a single page directly if needed,
    # or just use BookDownloader with max_pages = page_number.
    # Wait, downloading all pages sequentially up to page_number might be slow.
    # Can we just fetch the single page directly using urllib? Yes!
    page_dir = os.path.join(BASE_DOWNLOAD_DIR, book_id, "pages")
    os.makedirs(page_dir, exist_ok=True)
    page_file = os.path.join(page_dir, f"{page_number}.html")
    
    if not os.path.exists(page_file):
        # Use BookDownloader's fetch method to download this specific page
        dl = sh.BookDownloader(base_dir=BASE_DOWNLOAD_DIR)
        page_url = f"https://shamela.ws/book/{book_id}/{page_number}"
        try:
            content, final_url = dl._fetch_url(page_url)
            with open(page_file, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            print(json.dumps({"error": f"Failed to download page {page_number}: {e}"}))
            return

    scraper = sh.LocalScraper(base_dir=BASE_DOWNLOAD_DIR)
    page_data = await scraper.get_book_page(book_id, page_number)
    
    footnotes = []
    for fn in page_data.footnotes:
        footnotes.append({
            "number": fn.number,
            "content": fn.content
        })
        
    result = {
        "book_id": page_data.book_id,
        "page_number": page_data.page_number,
        "part_number": page_data.part_number or "",
        "headings": page_data.headings,
        "paragraphs": page_data.paragraphs,
        "footnotes": footnotes,
        "citations": page_data.citations,
        "departments": page_data.departments or {}
    }
    print(json.dumps(result, ensure_ascii=False))

async def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python bridge.py <cmd> <book_id> [args...]"}))
        sys.exit(1)
        
    cmd = sys.argv[1]
    book_id = sys.argv[2]
    
    try:
        if cmd == "metadata":
            await get_metadata(book_id)
        elif cmd == "toc":
            await get_toc(book_id)
        elif cmd == "page":
            if len(sys.argv) < 4:
                print(json.dumps({"error": "Missing page number"}))
                sys.exit(1)
            page_number = int(sys.argv[3])
            await get_page(book_id, page_number)
        else:
            print(json.dumps({"error": f"Unknown command: {cmd}"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Exception raised: {e}"}))
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
