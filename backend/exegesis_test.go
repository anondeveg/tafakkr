package backend

import (
	"os"
	"testing"
)

func TestExegesisService(t *testing.T) {
	// Initialize Quran provider
	err := InitQuran()
	if err != nil {
		t.Fatalf("Failed to init Quran: %v", err)
	}

	// Create a temp database
	tmpFile, err := os.CreateTemp("", "tafakkr_exegesis_test_*.db")
	if err != nil {
		t.Fatalf("Failed to create temp db file: %v", err)
	}
	dbPath := tmpFile.Name()
	defer os.Remove(dbPath)
	tmpFile.Close()

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to open DB: %v", err)
	}
	defer db.Close()

	// Initialize exegesis service
	service, err := NewExegesisService(db)
	if err != nil {
		t.Fatalf("Failed to create exegesis service: %v", err)
	}

	// Test GetExegesis for Tafsir Al-Durr Al-Manthur (12884)
	// Surah 1 Ayah 1 (maps to page 12)
	t.Log("Calling GetExegesis for book 12884, Surah 1, Ayah 1...")
	page, err := service.GetExegesis("12884", 1, 1)
	if err != nil {
		t.Fatalf("GetExegesis failed: %v", err)
	}

	if page == nil {
		t.Fatalf("Returned page is nil")
	}

	t.Logf("Successfully fetched page %d with %d paragraphs", page.PageNumber, len(page.Paragraphs))
	if len(page.Paragraphs) == 0 {
		t.Errorf("Expected paragraphs, got 0")
	}
}

func TestAddBookByUrl(t *testing.T) {
	// Initialize Quran provider
	err := InitQuran()
	if err != nil {
		t.Fatalf("Failed to init Quran: %v", err)
	}

	// Create a temp database
	tmpFile, err := os.CreateTemp("", "tafakkr_add_book_test_*.db")
	if err != nil {
		t.Fatalf("Failed to create temp db file: %v", err)
	}
	dbPath := tmpFile.Name()
	defer os.Remove(dbPath)
	tmpFile.Close()

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to open DB: %v", err)
	}
	defer db.Close()

	// Initialize exegesis service
	service, err := NewExegesisService(db)
	if err != nil {
		t.Fatalf("Failed to create exegesis service: %v", err)
	}

	// Test fetching metadata for a book that is not already cached, e.g., Tafsir Ibn Kathir (43)
	bookID := "43"
	t.Logf("Calling EnsureBookMetadata for book %s...", bookID)
	meta, err := service.EnsureBookMetadata(bookID)
	if err != nil {
		t.Fatalf("EnsureBookMetadata failed: %v", err)
	}
	t.Logf("Fetched book title: %s", meta.Title)
	if meta.Title == "" {
		t.Errorf("Expected non-empty book title")
	}

	t.Logf("Calling EnsureBookTOC for book %s...", bookID)
	toc, err := service.EnsureBookTOC(bookID)
	if err != nil {
		t.Fatalf("EnsureBookTOC failed: %v", err)
	}
	t.Logf("Fetched TOC chapters: %d", len(toc))
	if len(toc) == 0 {
		t.Errorf("Expected non-empty TOC")
	}

	// Test deleting the book
	t.Logf("Calling DeleteBook for book %s...", bookID)
	err = db.DeleteBook(bookID)
	if err != nil {
		t.Fatalf("DeleteBook failed: %v", err)
	}

	// Verify metadata is gone
	metaCheck, err := db.GetBookMetadata(bookID)
	if err != nil {
		t.Fatalf("GetBookMetadata after delete failed: %v", err)
	}
	if metaCheck != nil {
		t.Errorf("Expected metadata to be deleted, but it was found")
	}

	// Verify TOC is gone
	tocCheck, err := db.GetChapters(bookID)
	if err != nil {
		t.Fatalf("GetChapters after delete failed: %v", err)
	}
	if len(tocCheck) > 0 {
		t.Errorf("Expected TOC to be deleted, but found %d chapters", len(tocCheck))
	}
}

func TestGetExegesisPage(t *testing.T) {
	// Initialize Quran provider
	err := InitQuran()
	if err != nil {
		t.Fatalf("Failed to init Quran: %v", err)
	}

	// Create a temp database
	tmpFile, err := os.CreateTemp("", "tafakkr_page_test_*.db")
	if err != nil {
		t.Fatalf("Failed to create temp db file: %v", err)
	}
	dbPath := tmpFile.Name()
	defer os.Remove(dbPath)
	tmpFile.Close()

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to open DB: %v", err)
	}
	defer db.Close()

	// Initialize exegesis service
	service, err := NewExegesisService(db)
	if err != nil {
		t.Fatalf("Failed to create exegesis service: %v", err)
	}

	// Test GetExegesisPage directly
	// Fetch page 12 of book 12884
	t.Log("Calling GetExegesisPage for book 12884, page 12...")
	page, err := service.GetExegesisPage("12884", 12)
	if err != nil {
		t.Fatalf("GetExegesisPage failed: %v", err)
	}

	if page == nil {
		t.Fatalf("Returned page is nil")
	}

	t.Logf("Successfully fetched page %d with %d paragraphs", page.PageNumber, len(page.Paragraphs))
	if page.PageNumber != 12 {
		t.Errorf("Expected page number 12, got %d", page.PageNumber)
	}
	if len(page.Paragraphs) == 0 {
		t.Errorf("Expected paragraphs, got 0")
	}
}
