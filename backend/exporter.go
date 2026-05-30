package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GenerateYAMLFrontmatter formats note details into standard YAML frontmatter
func GenerateYAMLFrontmatter(title string, verses [][2]int, createdAt time.Time) string {
	var sb strings.Builder
	sb.WriteString("---\n")
	sb.WriteString(fmt.Sprintf("title: %q\n", title))

	// Group by Surah to find associated ayat
	if len(verses) > 0 {
		sb.WriteString(fmt.Sprintf("surah: %d\n", verses[0][0]))
		sb.WriteString("ayat: [")
		var ayat []string
		for _, v := range verses {
			ayat = append(ayat, fmt.Sprintf("%d", v[1]))
		}
		sb.WriteString(strings.Join(ayat, ", "))
		sb.WriteString("]\n")
	} else {
		sb.WriteString("surah: null\n")
		sb.WriteString("ayat: []\n")
	}

	sb.WriteString(fmt.Sprintf("created_at: %s\n", createdAt.Format(time.RFC3339)))
	sb.WriteString("---\n\n")
	return sb.String()
}

// ExportNoteToMarkdown writes a single note file
func ExportNoteToMarkdown(note NoteWithVerses, targetPath string) error {
	frontmatter := GenerateYAMLFrontmatter(note.Title, note.BoundVerses, note.CreatedAt)
	content := frontmatter + note.Content

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create export directory: %w", err)
	}

	return os.WriteFile(targetPath, []byte(content), 0644)
}

// ExportVaultToMarkdown exports all notes into a nested Quran directory tree
func ExportVaultToMarkdown(notes []NoteWithVerses, quran *QuranProvider, targetDir string) error {
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create vault directory: %w", err)
	}

	for _, note := range notes {
		if len(note.BoundVerses) == 0 {
			// Save in root or general notes directory if not bound to any verse
			filename := sanitizeFilename(note.Title) + ".md"
			path := filepath.Join(targetDir, "عام", filename)
			if err := ExportNoteToMarkdown(note, path); err != nil {
				return err
			}
			continue
		}

		// Write the note to each bound verse folder
		for _, verse := range note.BoundVerses {
			surahNum := verse[0]
			ayahNum := verse[1]

			surah, err := quran.GetSurah(surahNum)
			var surahDirName string
			if err != nil {
				surahDirName = fmt.Sprintf("%03d - سورة %d", surahNum, surahNum)
			} else {
				surahDirName = fmt.Sprintf("%03d - %s", surahNum, surah.Name)
			}

			ayahDirName := fmt.Sprintf("الآية %d", ayahNum)
			filename := sanitizeFilename(note.Title) + ".md"

			path := filepath.Join(targetDir, surahDirName, ayahDirName, filename)
			if err := ExportNoteToMarkdown(note, path); err != nil {
				return err
			}
		}
	}

	return nil
}

func sanitizeFilename(name string) string {
	// Replaces characters that are not safe for filenames
	badChars := []string{"/", "\\", "?", "%", "*", ":", "|", "\"", "<", ">", "."}
	sanitized := name
	for _, char := range badChars {
		sanitized = strings.ReplaceAll(sanitized, char, "")
	}
	sanitized = strings.TrimSpace(sanitized)
	if sanitized == "" {
		sanitized = "ملاحظة_بدون_عنوان"
	}
	return sanitized
}
