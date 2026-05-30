package backend

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

type BackupService struct {
	db     *Database
	quran  *QuranProvider
	dbPath string
	srv    *http.Server
	authCh chan string
}

func NewBackupService(db *Database, quran *QuranProvider, dbPath string) *BackupService {
	return &BackupService{
		db:     db,
		quran:  quran,
		dbPath: dbPath,
		authCh: make(chan string, 1),
	}
}

// GetOAuthConfig retrieves the OAuth2 configuration based on user-configured settings
func (s *BackupService) GetOAuthConfig() (*oauth2.Config, error) {
	clientID := s.db.GetSetting("gdrive_client_id", "")
	clientSecret := s.db.GetSetting("gdrive_secret", "")

	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("Google Drive Client ID and Client Secret must be configured in settings")
	}

	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		RedirectURL:  "http://localhost:8085/oauth/callback",
		Scopes:       []string{drive.DriveFileScope},
	}, nil
}

// StartAuthFlow launches the local callback server and returns the Google Auth URL
func (s *BackupService) StartAuthFlow() (string, error) {
	cfg, err := s.GetOAuthConfig()
	if err != nil {
		return "", err
	}

	// Stop any existing redirect server
	s.StopAuthServer()

	s.srv = &http.Server{Addr: ":8085"}
	http.HandleFunc("/oauth/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		if code != "" {
			s.authCh <- code
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<h3>تفكّر: تم تأكيد المصادقة بنجاح! يمكنك إغلاق هذه النافذة الآن.</h3><p>Authenticated successfully! You can close this window now.</p>"))
		} else {
			_, _ = w.Write([]byte("Failed to capture authentication code."))
		}
	})

	go func() {
		_ = s.srv.ListenAndServe()
	}()

	// Generate authorization URL
	url := cfg.AuthCodeURL("state-token", oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	return url, nil
}

// CompleteAuthFlow exchanges the captured code for a token and caches it
func (s *BackupService) CompleteAuthFlow(ctx context.Context) error {
	defer s.StopAuthServer()

	select {
	case code := <-s.authCh:
		cfg, err := s.GetOAuthConfig()
		if err != nil {
			return err
		}

		token, err := cfg.Exchange(ctx, code)
		if err != nil {
			return fmt.Errorf("oauth token exchange failed: %w", err)
		}

		tokenJSON, err := json.Marshal(token)
		if err != nil {
			return err
		}

		return s.db.SaveSetting("gdrive_oauth_token", string(tokenJSON))
	case <-time.After(5 * time.Minute):
		return fmt.Errorf("authentication timeout (5 minutes)")
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *BackupService) StopAuthServer() {
	if s.srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.srv.Shutdown(ctx)
		s.srv = nil
	}
}

// ZipNotesAndDB packages the database file and all markdown notes into a zip archive
func (s *BackupService) ZipNotesAndDB(zipPath string) error {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	archive := zip.NewWriter(zipFile)
	defer archive.Close()

	// 1. Export Markdown Notes to temporary folder, then add to zip
	tempDir, err := os.MkdirTemp("", "tafakkr_vault_*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	notes, err := s.db.GetAllNotes()
	if err != nil {
		return err
	}

	err = ExportVaultToMarkdown(notes, s.quran, tempDir)
	if err != nil {
		return err
	}

	// Walk vault temp folder and add files
	err = filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(tempDir, path)
		if err != nil {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		writer, err := archive.Create(filepath.Join("notes_vault", relPath))
		if err != nil {
			return err
		}

		_, err = io.Copy(writer, file)
		return err
	})
	if err != nil {
		return err
	}

	// 2. Backup tafakkr.db SQLite file directly (if connection is busy, we read raw bytes)
	// Since we are using WAL mode, copying the file is relatively safe, but to be sure we do a read.
	dbFile, err := os.Open(s.dbPath)
	if err != nil {
		return err
	}
	defer dbFile.Close()

	dbWriter, err := archive.Create("tafakkr.db")
	if err != nil {
		return err
	}

	_, err = io.Copy(dbWriter, dbFile)
	return err
}

// RunBackup performs zip packaging and uploads it to Google Drive
func (s *BackupService) RunBackup(ctx context.Context) error {
	tokenStr := s.db.GetSetting("gdrive_oauth_token", "")
	if tokenStr == "" {
		return fmt.Errorf("not authenticated with Google Drive")
	}

	cfg, err := s.GetOAuthConfig()
	if err != nil {
		return err
	}

	var token oauth2.Token
	if err := json.Unmarshal([]byte(tokenStr), &token); err != nil {
		return fmt.Errorf("invalid cached oauth token: %w", err)
	}

	// TokenSource automatically handles refresh token exchanges if token is expired!
	ts := cfg.TokenSource(ctx, &token)
	client := oauth2.NewClient(ctx, ts)

	// Update cached token if it has refreshed/changed
	newTok, err := ts.Token()
	if err == nil && newTok.AccessToken != token.AccessToken {
		newJSON, _ := json.Marshal(newTok)
		_ = s.db.SaveSetting("gdrive_oauth_token", string(newJSON))
	}

	srv, err := drive.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return err
	}

	// 1. Create a temporary zip file
	tempZip, err := os.CreateTemp("", "tafakkr_backup_*.zip")
	if err != nil {
		return err
	}
	tempZipPath := tempZip.Name()
	tempZip.Close()
	defer os.Remove(tempZipPath)

	if err := s.ZipNotesAndDB(tempZipPath); err != nil {
		return fmt.Errorf("failed to compress backup files: %w", err)
	}

	// 2. Find or Create "Taffakr_Backups" folder
	folderName := "Taffakr_Backups"
	q := fmt.Sprintf("name = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false", folderName)
	listCall := srv.Files.List().Q(q).Spaces("drive")
	filesList, err := listCall.Do()
	if err != nil {
		return fmt.Errorf("failed to query drive folders: %w", err)
	}

	var folderID string
	if len(filesList.Files) > 0 {
		folderID = filesList.Files[0].Id
	} else {
		// Create the folder
		f := &drive.File{
			Name:     folderName,
			MimeType: "application/vnd.google-apps.folder",
		}
		newFolder, err := srv.Files.Create(f).Do()
		if err != nil {
			return fmt.Errorf("failed to create drive folder: %w", err)
		}
		folderID = newFolder.Id
	}

	// 3. Upload Zip file
	filename := fmt.Sprintf("tafakkr_backup_%s.zip", time.Now().Format("20060102_150405"))
	fileToUpload, err := os.Open(tempZipPath)
	if err != nil {
		return err
	}
	defer fileToUpload.Close()

	driveFile := &drive.File{
		Name:    filename,
		Parents: []string{folderID},
	}

	_, err = srv.Files.Create(driveFile).Media(fileToUpload).Do()
	if err != nil {
		return fmt.Errorf("failed to upload file to Google Drive: %w", err)
	}

	// Update last backup milestone time
	_ = s.db.SaveSetting("last_backup_time", time.Now().Format(time.RFC3339))
	return nil
}

// StartBackupDaemon starts the background worker loop ticker
func (s *BackupService) StartBackupDaemon(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Check settings
			enabled := s.db.GetSetting("backup_enabled", "false") == "true"
			if !enabled {
				continue
			}

			intervalStr := s.db.GetSetting("backup_interval", "24h")
			interval, err := time.ParseDuration(intervalStr)
			if err != nil {
				interval = 24 * time.Hour
			}

			lastBackupStr := s.db.GetSetting("last_backup_time", "")
			var lastBackup time.Time
			if lastBackupStr != "" {
				lastBackup, _ = time.Parse(time.RFC3339, lastBackupStr)
			}

			if time.Since(lastBackup) >= interval {
				// Run backup asynchronously
				go func() {
					backupCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
					defer cancel()
					_ = s.RunBackup(backupCtx)
				}()
			}
		}
	}
}
