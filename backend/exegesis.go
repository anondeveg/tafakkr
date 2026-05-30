package backend

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

//go:embed bridge.py
var bridgePy []byte

type ExegesisService struct {
	db         *Database
	bridgePath string
	mu         sync.Mutex
}

func NewExegesisService(db *Database) (*ExegesisService, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	appDir := filepath.Join(home, ".tafakkr")
	_ = os.MkdirAll(appDir, 0755)

	bridgePath := filepath.Join(appDir, "bridge.py")
	if err := os.WriteFile(bridgePath, bridgePy, 0755); err != nil {
		return nil, fmt.Errorf("failed to write bridge.py: %w", err)
	}

	return &ExegesisService{
		db:         db,
		bridgePath: bridgePath,
	}, nil
}

// runBridge runs the python bridge script and returns stdout
func (s *ExegesisService) runBridge(args ...string) ([]byte, error) {
	cmdArgs := append([]string{s.bridgePath}, args...)
	cmd := exec.Command("python3", cmdArgs...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("bridge run failed: %s (err: %w)", string(out), err)
	}
	return out, nil
}

// EnsureBookMetadata fetches and caches metadata if not cached
func (s *ExegesisService) EnsureBookMetadata(bookID string) (*BookMetadata, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, err := s.db.GetBookMetadata(bookID)
	if err != nil {
		return nil, err
	}
	if meta != nil {
		return meta, nil
	}

	// Fetch from bridge
	out, err := s.runBridge("metadata", bookID)
	if err != nil {
		return nil, err
	}

	var m BookMetadata
	if err := json.Unmarshal(out, &m); err != nil {
		return nil, fmt.Errorf("failed to parse metadata JSON: %w", err)
	}

	if err := s.db.CacheBookMetadata(m); err != nil {
		return nil, err
	}

	return &m, nil
}

// EnsureBookTOC fetches and caches chapters if not cached
func (s *ExegesisService) EnsureBookTOC(bookID string) ([]Chapter, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	chaps, err := s.db.GetChapters(bookID)
	if err != nil {
		return nil, err
	}
	if len(chaps) > 0 {
		return chaps, nil
	}

	// Fetch from bridge
	out, err := s.runBridge("toc", bookID)
	if err != nil {
		return nil, err
	}

	var c []Chapter
	if err := json.Unmarshal(out, &c); err != nil {
		return nil, fmt.Errorf("failed to parse TOC JSON: %w", err)
	}

	if err := s.db.CacheChapters(bookID, c); err != nil {
		return nil, err
	}

	return c, nil
}

// normalizeArabic text for search comparison
func normalizeArabic(text string) string {
	// Remove common diacritics
	r := regexp.MustCompile(`[\x{064B}-\x{0652}\x{0670}]`)
	text = r.ReplaceAllString(text, "")
	// Normalize Alifs
	text = strings.ReplaceAll(text, "أ", "ا")
	text = strings.ReplaceAll(text, "إ", "ا")
	text = strings.ReplaceAll(text, "آ", "ا")
	// Normalize Ta Marbuta
	text = strings.ReplaceAll(text, "ة", "ه")
	// Remove punctuation
	text = strings.ReplaceAll(text, "أ", "ا")
	return strings.TrimSpace(text)
}

// MapVerseToPage implements the interval search algorithm to find the correct exegesis page
func (s *ExegesisService) MapVerseToPage(bookID string, surahNum, ayahNum int) (int, error) {
	chapters, err := s.EnsureBookTOC(bookID)
	if err != nil {
		return 0, err
	}

	if len(chapters) == 0 {
		return 0, fmt.Errorf("empty table of contents for book %s", bookID)
	}

	surah, err := GlobalQuran.GetSurah(surahNum)
	if err != nil {
		return 0, err
	}
	surahName := normalizeArabic(surah.Name)

	// Step 1: Find the chapter index for the current Surah
	surahIndex := -1
	for i, ch := range chapters {
		titleNorm := normalizeArabic(ch.Title)
		// Match top-level chapter with Surah Name (e.g. contains "البقرة")
		if ch.Depth == 0 && (strings.Contains(titleNorm, surahName) || (surahNum == 1 && strings.Contains(titleNorm, "الفاتحه"))) {
			surahIndex = i
			break
		}
	}

	// Fallback to substring matching on any depth if not found at depth 0
	if surahIndex == -1 {
		for i, ch := range chapters {
			titleNorm := normalizeArabic(ch.Title)
			if strings.Contains(titleNorm, surahName) {
				surahIndex = i
				break
			}
		}
	}

	if surahIndex == -1 {
		// If Surah is not mentioned in TOC, fallback to page 1
		return 1, nil
	}

	// Step 2: Find the page range for this Surah
	startPage := chapters[surahIndex].PageNumber
	endPage := 999999 // Assume open ended by default

	// Find the next Surah chapter to close the range
	for i := surahIndex + 1; i < len(chapters); i++ {
		ch := chapters[i]
		if ch.Depth == 0 {
			endPage = ch.PageNumber
			break
		}
	}

	// Step 3: Inside the Surah's pages, look for sub-chapters matching our Ayah
	// Extract all sub-chapters inside the Surah's range
	var subChaps []Chapter
	for i := surahIndex + 1; i < len(chapters); i++ {
		ch := chapters[i]
		if ch.PageNumber >= endPage {
			break
		}
		subChaps = append(subChaps, ch)
	}

	// Helper to extract numbers from text (both Indic-Arabic and Western)
	arabicIndicToWestern := map[rune]rune{
		'٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
		'٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
	}
	
	extractNumbers := func(text string) []int {
		// Convert Indic to Western digits first
		var sb strings.Builder
		for _, r := range text {
			if w, ok := arabicIndicToWestern[r]; ok {
				sb.WriteRune(w)
			} else {
				sb.WriteRune(r)
			}
		}
		
		re := regexp.MustCompile(`\d+`)
		matches := re.FindAllString(sb.String(), -1)
		var nums []int
		for _, m := range matches {
			if n, err := strconv.Atoi(m); err == nil {
				nums = append(nums, n)
			}
		}
		return nums
	}

	// Scan for exact match of the Ayah number
	exactPage := -1
	for _, ch := range subChaps {
		nums := extractNumbers(ch.Title)
		for _, n := range nums {
			if n == ayahNum {
				exactPage = ch.PageNumber
				break
			}
		}
		if exactPage != -1 {
			break
		}
	}

	if exactPage != -1 {
		return exactPage, nil
	}

	// If no exact match, do interval search:
	// Find the sub-chapter that contains the largest Ayah number <= ayahNum
	bestPage := startPage
	bestAyah := 0

	for _, ch := range subChaps {
		nums := extractNumbers(ch.Title)
		for _, n := range nums {
			if n > bestAyah && n <= ayahNum {
				bestAyah = n
				bestPage = ch.PageNumber
			}
		}
	}

	return bestPage, nil
}

// GetExegesisPage retrieves exegesis page data for the given book and page number directly
func (s *ExegesisService) GetExegesisPage(bookID string, pageNumber int) (*PageData, error) {
	// First, fetch metadata to ensure the book details are cached
	_, err := s.EnsureBookMetadata(bookID)
	if err != nil {
		return nil, fmt.Errorf("failed to ensure book metadata: %w", err)
	}

	// Check if page is cached
	s.mu.Lock()
	page, err := s.db.GetCachedPage(bookID, pageNumber)
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if page != nil {
		return page, nil
	}

	// Fetch from bridge if not cached
	out, err := s.runBridge("page", bookID, fmt.Sprintf("%d", pageNumber))
	if err != nil {
		return nil, err
	}

	var p PageData
	if err := json.Unmarshal(out, &p); err != nil {
		return nil, fmt.Errorf("failed to parse page JSON: %w", err)
	}

	s.mu.Lock()
	_ = s.db.CachePage(p)
	s.mu.Unlock()

	return &p, nil
}

// GetExegesis retrieves exegesis page data for the given Surah and Ayah
func (s *ExegesisService) GetExegesis(bookID string, surahNum, ayahNum int) (*PageData, error) {
	// Map the verse to a specific exegesis page
	pageNumber, err := s.MapVerseToPage(bookID, surahNum, ayahNum)
	if err != nil {
		return nil, fmt.Errorf("failed to map verse to page: %w", err)
	}

	return s.GetExegesisPage(bookID, pageNumber)
}
