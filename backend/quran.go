package backend

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed ayat.json
var quranJSON []byte

type Verse struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

type Surah struct {
	ID              int     `json:"id"`
	Name            string  `json:"name"`
	Transliteration string  `json:"transliteration"`
	Type            string  `json:"type"`
	TotalVerses     int     `json:"total_verses"`
	Verses          []Verse `json:"verses"`
}

type QuranProvider struct {
	Surahs []Surah
}

var GlobalQuran *QuranProvider

func InitQuran() error {
	var surahs []Surah
	if err := json.Unmarshal(quranJSON, &surahs); err != nil {
		return fmt.Errorf("failed to parse embedded quran JSON: %w", err)
	}
	GlobalQuran = &QuranProvider{Surahs: surahs}
	return nil
}

func (q *QuranProvider) GetSurahsList() []Surah {
	// Returns a copy of the list of Surahs without the full verses list to save bandwidth in Wails bridge
	list := make([]Surah, len(q.Surahs))
	for i, s := range q.Surahs {
		list[i] = Surah{
			ID:              s.ID,
			Name:            s.Name,
			Transliteration: s.Transliteration,
			Type:            s.Type,
			TotalVerses:     s.TotalVerses,
			Verses:          nil, // Omit verses
		}
	}
	return list
}

func (q *QuranProvider) GetSurah(id int) (*Surah, error) {
	if id < 1 || id > 114 {
		return nil, fmt.Errorf("invalid surah number: %d", id)
	}
	return &q.Surahs[id-1], nil
}

func (q *QuranProvider) GetAyahText(surahNum, ayahNum int) (string, error) {
	s, err := q.GetSurah(surahNum)
	if err != nil {
		return "", err
	}
	if ayahNum < 1 || ayahNum > s.TotalVerses {
		return "", fmt.Errorf("invalid ayah number %d for surah %s", ayahNum, s.Name)
	}
	return s.Verses[ayahNum-1].Text, nil
}
