package backend

import (
	"testing"
)

func TestQuranProvider(t *testing.T) {
	err := InitQuran()
	if err != nil {
		t.Fatalf("Failed to initialize Quran provider: %v", err)
	}

	if GlobalQuran == nil {
		t.Fatalf("GlobalQuran is nil")
	}

	surahs := GlobalQuran.GetSurahsList()
	if len(surahs) != 114 {
		t.Errorf("Expected 114 Surahs, got %d", len(surahs))
	}

	// Verify Al-Fatihah
	fatihah, err := GlobalQuran.GetSurah(1)
	if err != nil {
		t.Fatalf("Failed to get Al-Fatihah: %v", err)
	}
	if fatihah.Name != "الفاتحة" {
		t.Errorf("Expected Surah name 'الفاتحة', got %q", fatihah.Name)
	}
	if fatihah.TotalVerses != 7 {
		t.Errorf("Expected 7 verses in Al-Fatihah, got %d", fatihah.TotalVerses)
	}

	// Verify Al-Baqarah 183 (كتب عليكم الصيام)
	baqarah183, err := GlobalQuran.GetAyahText(2, 183)
	if err != nil {
		t.Fatalf("Failed to get Al-Baqarah 183: %v", err)
	}
	expectedSubstring := "كتب عليكم الصيام"
	if !testing.Short() && !containsSubstring(baqarah183, expectedSubstring) {
		t.Errorf("Expected Al-Baqarah 183 to contain %q, got %q", expectedSubstring, baqarah183)
	}
}

func containsSubstring(s, sub string) bool {
	// Simple helper
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
