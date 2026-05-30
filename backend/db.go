package backend

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Database struct {
	Conn *sql.DB
}

type Note struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NoteWithVerses struct {
	Note
	BoundVerses [][2]int `json:"bound_verses"` // Each entry is [surah, ayah]
}

type BookMetadata struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	AuthorName      string `json:"author_name"`
	AuthorPage      string `json:"author_page"`
	Publisher       string `json:"publisher"`
	BookPrint       string `json:"book_print"`
	Volumes         int    `json:"volumes"`
	IsEqualToPrint  bool   `json:"is_equal_to_print"`
	BookDescription string `json:"book_description"`
}

type Chapter struct {
	BookID     string `json:"book_id"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	PageNumber int    `json:"page_number"`
	Depth      int    `json:"depth"`
}

type Footnote struct {
	Number  string `json:"number"`
	Content string `json:"content"`
}

type PageData struct {
	BookID      string              `json:"book_id"`
	PageNumber  int                 `json:"page_number"`
	PartNumber  string              `json:"part_number"`
	Headings    []string            `json:"headings"`
	Paragraphs  []string            `json:"paragraphs"`
	Footnotes   []Footnote          `json:"footnotes"`
	Citations   []string            `json:"citations"`
	Departments map[string][]string `json:"departments"`
}

// GetDefaultDBPath returns the standard ~/.tafakkr/tafakkr.db path
func GetDefaultDBPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	dbDir := filepath.Join(home, ".tafakkr")
	_ = os.MkdirAll(dbDir, 0755)
	return filepath.Join(dbDir, "tafakkr.db")
}

// NewDatabase initializes a database connection
func NewDatabase(dbPath string) (*Database, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable WAL mode and foreign keys
	_, _ = db.Exec("PRAGMA journal_mode=WAL;")
	_, _ = db.Exec("PRAGMA foreign_keys=ON;")

	d := &Database{Conn: db}
	if err := d.initSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return d, nil
}

func (d *Database) Close() error {
	if d.Conn != nil {
		return d.Conn.Close()
	}
	return nil
}

func (d *Database) initSchema() error {
	schema := []string{
		`CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS notes (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS note_ayah_mappings (
			note_id TEXT,
			surah_number INTEGER,
			ayah_number INTEGER,
			PRIMARY KEY (note_id, surah_number, ayah_number),
			FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
		);`,

		`CREATE TABLE IF NOT EXISTS books (
			id TEXT PRIMARY KEY,
			title TEXT,
			author_name TEXT,
			author_page TEXT,
			publisher TEXT,
			book_print TEXT,
			volumes INTEGER,
			is_equal_to_print INTEGER,
			book_description TEXT
		);`,

		`CREATE TABLE IF NOT EXISTS chapters (
			book_id TEXT,
			title TEXT,
			url TEXT,
			page_number INTEGER,
			depth INTEGER
		);`,

		`CREATE TABLE IF NOT EXISTS pages (
			book_id TEXT,
			page_number INTEGER,
			part_number TEXT,
			headings TEXT,
			paragraphs TEXT,
			footnotes TEXT,
			citations TEXT,
			departments TEXT,
			PRIMARY KEY (book_id, page_number)
		);`,
	}

	for _, query := range schema {
		if _, err := d.Conn.Exec(query); err != nil {
			return fmt.Errorf("failed to execute query %q: %w", query, err)
		}
	}

	// Insert default settings if they do not exist
	defaultSettings := map[string]string{
		"quran_font_family": "Amiri",
		"quran_font_size":   "32px",
		"note_font_family":  "Geist",
		"note_font_size":    "16px",
		"backup_enabled":    "false",
		"backup_interval":   "24h", // 24 hours
		"gdrive_client_id":  "",
		"gdrive_secret":     "",
	}

	for k, v := range defaultSettings {
		_, _ = d.Conn.Exec("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", k, v)
	}

	return nil
}

// --- App Settings Operations ---

func (d *Database) SaveSetting(key, value string) error {
	_, err := d.Conn.Exec("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", key, value)
	return err
}

func (d *Database) GetSetting(key, defaultValue string) string {
	var val string
	err := d.Conn.QueryRow("SELECT value FROM app_settings WHERE key = ?", key).Scan(&val)
	if err != nil {
		return defaultValue
	}
	return val
}

func (d *Database) GetAllSettings() (map[string]string, error) {
	rows, err := d.Conn.Query("SELECT key, value FROM app_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		settings[k] = v
	}
	return settings, nil
}

// --- Notes & Mapping Operations ---

func (d *Database) CreateNote(id, title, content string, boundVerses [][2]int) error {
	tx, err := d.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	_, err = tx.Exec("INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		id, title, content, now, now)
	if err != nil {
		return err
	}

	for _, verse := range boundVerses {
		_, err = tx.Exec("INSERT INTO note_ayah_mappings (note_id, surah_number, ayah_number) VALUES (?, ?, ?)",
			id, verse[0], verse[1])
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *Database) UpdateNote(id, title, content string, boundVerses [][2]int) error {
	tx, err := d.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	_, err = tx.Exec("UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?",
		title, content, now, id)
	if err != nil {
		return err
	}

	// Refresh mappings
	_, err = tx.Exec("DELETE FROM note_ayah_mappings WHERE note_id = ?", id)
	if err != nil {
		return err
	}

	for _, verse := range boundVerses {
		_, err = tx.Exec("INSERT INTO note_ayah_mappings (note_id, surah_number, ayah_number) VALUES (?, ?, ?)",
			id, verse[0], verse[1])
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *Database) DeleteNote(id string) error {
	_, err := d.Conn.Exec("DELETE FROM notes WHERE id = ?", id)
	return err
}

func (d *Database) GetNotesForAyah(surah, ayah int) ([]NoteWithVerses, error) {
	// Find all notes mapped to this specific Surah and Ayah
	rows, err := d.Conn.Query(`
		SELECT n.id, n.title, n.content, n.created_at, n.updated_at 
		FROM notes n
		JOIN note_ayah_mappings m ON n.id = m.note_id
		WHERE m.surah_number = ? AND m.ayah_number = ?
		ORDER BY n.updated_at DESC`, surah, ayah)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []NoteWithVerses
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.Title, &n.Content, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}

		// Query all bound verses for this note
		verses, err := d.GetBoundVersesForNote(n.ID)
		if err != nil {
			return nil, err
		}

		notes = append(notes, NoteWithVerses{
			Note:        n,
			BoundVerses: verses,
		})
	}
	return notes, nil
}

func (d *Database) GetBoundVersesForNote(noteID string) ([][2]int, error) {
	rows, err := d.Conn.Query("SELECT surah_number, ayah_number FROM note_ayah_mappings WHERE note_id = ?", noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var verses [][2]int
	for rows.Next() {
		var surah, ayah int
		if err := rows.Scan(&surah, &ayah); err != nil {
			return nil, err
		}
		verses = append(verses, [2]int{surah, ayah})
	}
	return verses, nil
}

func (d *Database) GetAllNotes() ([]NoteWithVerses, error) {
	rows, err := d.Conn.Query("SELECT id, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []NoteWithVerses
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.Title, &n.Content, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}

		verses, err := d.GetBoundVersesForNote(n.ID)
		if err != nil {
			return nil, err
		}

		notes = append(notes, NoteWithVerses{
			Note:        n,
			BoundVerses: verses,
		})
	}
	return notes, nil
}

// --- Tafsir Caching Operations ---

func (d *Database) CacheBookMetadata(book BookMetadata) error {
	isEqualPrint := 0
	if book.IsEqualToPrint {
		isEqualPrint = 1
	}

	_, err := d.Conn.Exec(`
		INSERT OR REPLACE INTO books (
			id, title, author_name, author_page, publisher, book_print, volumes, is_equal_to_print, book_description
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		book.ID, book.Title, book.AuthorName, book.AuthorPage, book.Publisher, book.BookPrint, book.Volumes, isEqualPrint, book.BookDescription)
	return err
}

func (d *Database) GetBookMetadata(bookID string) (*BookMetadata, error) {
	var b BookMetadata
	var isEqualPrint int
	err := d.Conn.QueryRow("SELECT id, title, author_name, author_page, publisher, book_print, volumes, is_equal_to_print, book_description FROM books WHERE id = ?", bookID).
		Scan(&b.ID, &b.Title, &b.AuthorName, &b.AuthorPage, &b.Publisher, &b.BookPrint, &b.Volumes, &isEqualPrint, &b.BookDescription)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	b.IsEqualToPrint = isEqualPrint == 1
	return &b, nil
}

func (d *Database) CacheChapters(bookID string, chapters []Chapter) error {
	tx, err := d.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec("DELETE FROM chapters WHERE book_id = ?", bookID)
	if err != nil {
		return err
	}

	for _, ch := range chapters {
		_, err = tx.Exec("INSERT INTO chapters (book_id, title, url, page_number, depth) VALUES (?, ?, ?, ?, ?)",
			bookID, ch.Title, ch.URL, ch.PageNumber, ch.Depth)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *Database) GetChapters(bookID string) ([]Chapter, error) {
	rows, err := d.Conn.Query("SELECT title, url, page_number, depth FROM chapters WHERE book_id = ? ORDER BY rowid ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chapters []Chapter
	for rows.Next() {
		var ch Chapter
		ch.BookID = bookID
		if err := rows.Scan(&ch.Title, &ch.URL, &ch.PageNumber, &ch.Depth); err != nil {
			return nil, err
		}
		chapters = append(chapters, ch)
	}
	return chapters, nil
}

func (d *Database) CachePage(page PageData) error {
	headingsJSON, _ := json.Marshal(page.Headings)
	paragraphsJSON, _ := json.Marshal(page.Paragraphs)
	footnotesJSON, _ := json.Marshal(page.Footnotes)
	citationsJSON, _ := json.Marshal(page.Citations)
	departmentsJSON, _ := json.Marshal(page.Departments)

	_, err := d.Conn.Exec(`
		INSERT OR REPLACE INTO pages (
			book_id, page_number, part_number, headings, paragraphs, footnotes, citations, departments
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		page.BookID, page.PageNumber, page.PartNumber, string(headingsJSON), string(paragraphsJSON), string(footnotesJSON), string(citationsJSON), string(departmentsJSON))
	return err
}

func (d *Database) GetCachedPage(bookID string, pageNumber int) (*PageData, error) {
	var headingsStr, paragraphsStr, footnotesStr, citationsStr, departmentsStr string
	var p PageData
	p.BookID = bookID
	p.PageNumber = pageNumber

	err := d.Conn.QueryRow(`
		SELECT part_number, headings, paragraphs, footnotes, citations, departments 
		FROM pages 
		WHERE book_id = ? AND page_number = ?`, bookID, pageNumber).
		Scan(&p.PartNumber, &headingsStr, &paragraphsStr, &footnotesStr, &citationsStr, &departmentsStr)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	_ = json.Unmarshal([]byte(headingsStr), &p.Headings)
	_ = json.Unmarshal([]byte(paragraphsStr), &p.Paragraphs)
	_ = json.Unmarshal([]byte(footnotesStr), &p.Footnotes)
	_ = json.Unmarshal([]byte(citationsStr), &p.Citations)
	_ = json.Unmarshal([]byte(departmentsStr), &p.Departments)

	return &p, nil
}

func (d *Database) GetAllBooks() ([]BookMetadata, error) {
	rows, err := d.Conn.Query("SELECT id, title, author_name, author_page, publisher, book_print, volumes, is_equal_to_print, book_description FROM books ORDER BY title ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var books []BookMetadata
	for rows.Next() {
		var b BookMetadata
		var isEqualPrint int
		err := rows.Scan(&b.ID, &b.Title, &b.AuthorName, &b.AuthorPage, &b.Publisher, &b.BookPrint, &b.Volumes, &isEqualPrint, &b.BookDescription)
		if err != nil {
			return nil, err
		}
		b.IsEqualToPrint = isEqualPrint == 1
		books = append(books, b)
	}
	return books, nil
}

func (d *Database) DeleteBook(bookID string) error {
	tx, err := d.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec("DELETE FROM books WHERE id = ?", bookID)
	if err != nil {
		return err
	}
	_, err = tx.Exec("DELETE FROM chapters WHERE book_id = ?", bookID)
	if err != nil {
		return err
	}
	_, err = tx.Exec("DELETE FROM pages WHERE book_id = ?", bookID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
