package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"tafakkr/backend"
	"time"
)

// App struct
type App struct {
	ctx      context.Context
	db       *backend.Database
	exegesis *backend.ExegesisService
	backup   *backend.BackupService
	dbPath   string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 1. Initialize DB Path
	a.dbPath = backend.GetDefaultDBPath()

	// 2. Initialize database
	db, err := backend.NewDatabase(a.dbPath)
	if err != nil {
		fmt.Printf("Error initializing database: %v\n", err)
		return
	}
	a.db = db

	// 3. Initialize Quran Text Provider
	if err := backend.InitQuran(); err != nil {
		fmt.Printf("Error initializing Quran provider: %v\n", err)
	}

	// 4. Initialize exegesis service
	exegesis, err := backend.NewExegesisService(db)
	if err != nil {
		fmt.Printf("Error initializing exegesis service: %v\n", err)
	}
	a.exegesis = exegesis

	// 5. Initialize backup service and launch daemon
	a.backup = backend.NewBackupService(db, backend.GlobalQuran, a.dbPath)
	go a.backup.StartBackupDaemon(a.ctx)
}

// --- Wails Exposed Bindings ---

// GetQuranStructure returns 114 Surahs with metadata (without full verse texts)
func (a *App) GetQuranStructure() []backend.Surah {
	if backend.GlobalQuran == nil {
		return []backend.Surah{}
	}
	return backend.GlobalQuran.GetSurahsList()
}

// GetAyahText returns the text of a specific ayah
func (a *App) GetAyahText(surah, ayah int) string {
	if backend.GlobalQuran == nil {
		return ""
	}
	text, err := backend.GlobalQuran.GetAyahText(surah, ayah)
	if err != nil {
		return ""
	}
	return text
}

// GetNotesForAyah retrieves notes mapped to a given verse
func (a *App) GetNotesForAyah(surah, ayah int) []backend.NoteWithVerses {
	if a.db == nil {
		return []backend.NoteWithVerses{}
	}
	notes, err := a.db.GetNotesForAyah(surah, ayah)
	if err != nil {
		return []backend.NoteWithVerses{}
	}
	if notes == nil {
		return []backend.NoteWithVerses{}
	}
	return notes
}

// GetAllNotes retrieves all notes stored in the database
func (a *App) GetAllNotes() []backend.NoteWithVerses {
	if a.db == nil {
		return []backend.NoteWithVerses{}
	}
	notes, err := a.db.GetAllNotes()
	if err != nil {
		return []backend.NoteWithVerses{}
	}
	if notes == nil {
		return []backend.NoteWithVerses{}
	}
	return notes
}

// CreateNote creates a new note in the database
func (a *App) CreateNote(id, title, content string, boundVerses [][2]int) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}
	return a.db.CreateNote(id, title, content, boundVerses)
}

// SaveNote updates an existing note
func (a *App) SaveNote(id, title, content string, boundVerses [][2]int) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}
	return a.db.UpdateNote(id, title, content, boundVerses)
}

// DeleteNote removes a note from the database
func (a *App) DeleteNote(id string) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}
	return a.db.DeleteNote(id)
}

// GetExegesis maps a verse to page number and retrieves exegesis paragraphs
func (a *App) GetExegesis(bookID string, surah, ayah int) (*backend.PageData, error) {
	if a.exegesis == nil {
		return nil, fmt.Errorf("exegesis service not ready")
	}
	return a.exegesis.GetExegesis(bookID, surah, ayah)
}

// GetExegesisPage retrieves exegesis page data for the given book and page number directly
func (a *App) GetExegesisPage(bookID string, pageNum int) (*backend.PageData, error) {
	if a.exegesis == nil {
		return nil, fmt.Errorf("exegesis service not ready")
	}
	return a.exegesis.GetExegesisPage(bookID, pageNum)
}

// GetSettings retrieves typography and backup settings
func (a *App) GetSettings() map[string]string {
	if a.db == nil {
		return map[string]string{}
	}
	settings, err := a.db.GetAllSettings()
	if err != nil {
		return map[string]string{}
	}
	return settings
}

// SaveSettings updates multiple settings
func (a *App) SaveSettings(settings map[string]string) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}
	for k, v := range settings {
		if err := a.db.SaveSetting(k, v); err != nil {
			return err
		}
	}
	return nil
}

// ExportNoteToMarkdown exports a single note as a markdown file
func (a *App) ExportNoteToMarkdown(noteID string, targetPath string) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}

	notes, err := a.db.GetAllNotes()
	if err != nil {
		return err
	}

	for _, n := range notes {
		if n.ID == noteID {
			return backend.ExportNoteToMarkdown(n, targetPath)
		}
	}

	return fmt.Errorf("note with ID %s not found", noteID)
}

// ExportVaultToMarkdown exports the database content as a directory tree structure
func (a *App) ExportVaultToMarkdown(targetDir string) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}

	if targetDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}
		targetDir = filepathJoin(home, "Documents", "Taffakr_Vault")
	}

	notes, err := a.db.GetAllNotes()
	if err != nil {
		return err
	}

	return backend.ExportVaultToMarkdown(notes, backend.GlobalQuran, targetDir)
}

// StartGoogleDriveAuth opens callback server and returns Google authentication redirect url
func (a *App) StartGoogleDriveAuth() (string, error) {
	if a.backup == nil {
		return "", fmt.Errorf("backup service not ready")
	}
	return a.backup.StartAuthFlow()
}

// CompleteGoogleDriveAuth blocks until the callback server receives OAuth code and exchanges it
func (a *App) CompleteGoogleDriveAuth() error {
	if a.backup == nil {
		return fmt.Errorf("backup service not ready")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	return a.backup.CompleteAuthFlow(ctx)
}

// GetBooks returns the list of added books from the database
func (a *App) GetBooks() []backend.BookMetadata {
	if a.db == nil {
		return []backend.BookMetadata{}
	}
	books, err := a.db.GetAllBooks()
	if err != nil {
		return []backend.BookMetadata{}
	}
	if books == nil {
		return []backend.BookMetadata{}
	}
	return books
}

// AddBook extracts the book ID from URL/string, downloads its metadata & TOC, caches them, and returns the book metadata
func (a *App) AddBook(input string) (*backend.BookMetadata, error) {
	if a.db == nil || a.exegesis == nil {
		return nil, fmt.Errorf("database or exegesis service not ready")
	}

	// Extract book ID from URL (e.g., https://shamela.ws/book/7798 or just 7798)
	bookID := input
	if strings.Contains(input, "shamela.ws/book/") {
		parts := strings.Split(input, "shamela.ws/book/")
		if len(parts) > 1 {
			subParts := strings.Split(parts[1], "/")
			bookID = subParts[0]
		}
	}
	bookID = strings.TrimSpace(bookID)
	if bookID == "" {
		return nil, fmt.Errorf("invalid Shamela URL or Book ID")
	}

	// Fetch metadata (which caches it in the database)
	meta, err := a.exegesis.EnsureBookMetadata(bookID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch book metadata from Shamela: %w", err)
	}

	// Fetch TOC (which caches it in the database)
	_, err = a.exegesis.EnsureBookTOC(bookID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch book table of contents: %w", err)
	}

	return meta, nil
}

// DeleteBook removes a book and all its chapters and pages from the database
func (a *App) DeleteBook(bookID string) error {
	if a.db == nil {
		return fmt.Errorf("database connection closed")
	}
	return a.db.DeleteBook(bookID)
}

// helper function equivalent to filepath.Join for fallback
func filepathJoin(elem ...string) string {
	var path string
	for i, e := range elem {
		if i == 0 {
			path = e
		} else {
			if strings.HasSuffix(path, "/") || strings.HasSuffix(path, "\\") {
				path += e
			} else {
				path += string(os.PathSeparator) + e
			}
		}
	}
	return path
}


