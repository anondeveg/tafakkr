package backend

import (
	"os"
	"testing"
)

func TestDatabaseOperations(t *testing.T) {
	// Create database in temporary file
	tmpFile, err := os.CreateTemp("", "tafakkr_test_*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	dbPath := tmpFile.Name()
	defer os.Remove(dbPath)
	tmpFile.Close()

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// 1. Verify default settings are inserted
	qFontSize := db.GetSetting("quran_font_size", "")
	if qFontSize != "32px" {
		t.Errorf("Expected default quran_font_size '32px', got %q", qFontSize)
	}

	// 2. Test saving and reading settings
	err = db.SaveSetting("note_font_size", "20px")
	if err != nil {
		t.Errorf("Failed to save setting: %v", err)
	}
	noteFontSize := db.GetSetting("note_font_size", "")
	if noteFontSize != "20px" {
		t.Errorf("Expected note_font_size '20px', got %q", noteFontSize)
	}

	// 3. Test note CRUD and mappings
	noteID := "test-note-1"
	title := "تأملات في آية الصيام"
	content := "هذه الآية الكريمة تبين فرضية الصيام..."
	boundVerses := [][2]int{
		{2, 183},
		{2, 184},
	}

	err = db.CreateNote(noteID, title, content, boundVerses)
	if err != nil {
		t.Fatalf("Failed to create note: %v", err)
	}

	// Read notes for ayah
	notes, err := db.GetNotesForAyah(2, 183)
	if err != nil {
		t.Fatalf("Failed to query notes for ayah: %v", err)
	}
	if len(notes) != 1 {
		t.Errorf("Expected 1 note, got %d", len(notes))
	} else {
		n := notes[0]
		if n.ID != noteID || n.Title != title || n.Content != content {
			t.Errorf("Note contents mismatch. Got: %+v", n)
		}
		if len(n.BoundVerses) != 2 {
			t.Errorf("Expected 2 bound verses, got %d", len(n.BoundVerses))
		}
	}

	// Update note
	updatedTitle := "تأملات جديدة في آية الصيام"
	updatedVerses := [][2]int{
		{2, 183},
	}
	err = db.UpdateNote(noteID, updatedTitle, content, updatedVerses)
	if err != nil {
		t.Fatalf("Failed to update note: %v", err)
	}

	// Check notes for ayah 184 (should be empty now)
	notes184, err := db.GetNotesForAyah(2, 184)
	if err != nil {
		t.Fatalf("Failed to query notes for ayah 184: %v", err)
	}
	if len(notes184) != 0 {
		t.Errorf("Expected 0 notes for ayah 184, got %d", len(notes184))
	}

	// Delete note
	err = db.DeleteNote(noteID)
	if err != nil {
		t.Fatalf("Failed to delete note: %v", err)
	}

	allNotes, err := db.GetAllNotes()
	if err != nil {
		t.Fatalf("Failed to query all notes: %v", err)
	}
	if len(allNotes) != 0 {
		t.Errorf("Expected 0 notes total after deletion, got %d", len(allNotes))
	}
}
