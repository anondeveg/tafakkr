import { useState, useEffect, useRef } from 'react';
import {
  GetQuranStructure,
  GetAyahText,
  GetNotesForAyah,
  GetAllNotes,
  CreateNote,
  SaveNote,
  DeleteNote,
  GetExegesis,
  GetExegesisPage,
  GetSettings,
  SaveSettings,
  ExportNoteToMarkdown,
  ExportVaultToMarkdown,
  StartGoogleDriveAuth,
  CompleteGoogleDriveAuth,
  GetBooks,
  AddBook,
  DeleteBook
} from "../wailsjs/go/main/App";

// Helper to shorten exegesis book titles for tab bar display
const getShortBookName = (title) => {
  if (!title) return "";
  let clean = title.split('=')[0].trim();
  const words = clean.split(/\s+/);
  if (words.length > 3) {
    return words.slice(0, 3).join(' ') + '...';
  }
  return clean;
};

// Helper to convert numbers to Arabic numerals and wrap in ornate braces
const getAyahMarker = (aNum) => {
  const arabicZero = 0x660;
  const arabicNum = String(aNum).split('').map(char => {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      return String.fromCharCode(code - 48 + arabicZero);
    }
    return char;
  }).join('');
  return `\uFD3F${arabicNum}\uFD3E`;
};

const renderMarkdown = (text) => {
  if (!text) return "";

  // 1. Escape HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Parse blockquotes (using &gt;)
  const lines = html.split('\n');
  let inBlockquote = false;
  let resultLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("&gt;")) {
      let content = trimmed.substring(4).trim();
      if (!inBlockquote) {
        resultLines.push("<blockquote class='border-r-4 border-primary/50 bg-surface-container-low/40 pr-4 py-2 my-4 text-on-surface-variant italic rounded-l text-right'>");
        inBlockquote = true;
      }
      resultLines.push(content);
    } else {
      if (inBlockquote) {
        resultLines.push("</blockquote>");
        inBlockquote = false;
      }
      resultLines.push(line);
    }
  }
  if (inBlockquote) {
    resultLines.push("</blockquote>");
  }
  
  html = resultLines.join('\n');

  // 3. Headings
  html = html.replace(/^#\s+(.*?)$/gm, "<h1 class='text-headline-lg text-primary font-bold border-b border-outline-variant/20 pb-2 mt-6 mb-4'>$1</h1>");
  html = html.replace(/^##\s+(.*?)$/gm, "<h2 class='text-headline-md text-secondary font-bold mt-5 mb-3'>$1</h2>");
  html = html.replace(/^###\s+(.*?)$/gm, "<h3 class='text-title-lg text-on-surface font-bold mt-4 mb-2'>$1</h3>");

  // 4. Bold and Italics
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // 5. Wiki-links [[Book Name: Page X]]
  html = html.replace(/\[\[(.*?)\]\]/g, "<span class='inline-flex items-center gap-1 bg-primary/10 border border-primary/20 text-primary rounded px-2 py-0.5 text-xs font-bold font-quran-text cursor-pointer hover:bg-primary/20 transition-colors'>$1</span>");

  // 6. Handle Paragraphs & Line Breaks
  const paragraphs = html.split(/\n\n+/);
  const formattedParagraphs = paragraphs.map(p => {
    const trimmed = p.trim();
    if (trimmed.startsWith("<blockquote") || trimmed.startsWith("<h1") || trimmed.startsWith("<h2") || trimmed.startsWith("<h3") || trimmed.endsWith("</blockquote>")) {
      return trimmed;
    }
    return `<p class='mb-4 leading-relaxed text-right select-text'>${trimmed.replace(/\n/g, "<br/>")}</p>`;
  });

  return formattedParagraphs.join('\n');
};

// Helper to normalize Arabic characters for robust search
const normalizeArabic = (text) => {
  if (!text) return "";
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ـ\u064B-\u065F]/g, ""); // Remove diacritics
};

function App() {
  // Quran navigation state
  const [surahs, setSurahs] = useState([]);
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [selectedAyah, setSelectedAyah] = useState(1);
  const [expandedSurahs, setExpandedSurahs] = useState({ 1: true });
  const [ayahText, setAyahText] = useState("");
  const [surahSearchQuery, setSurahSearchQuery] = useState("");

  // Panel widths for resizable panes
  const [sidebarWidth, setSidebarWidth] = useState(260); // Quran Navigator (RTL Right)
  const [referenceWidth, setReferenceWidth] = useState(280); // Exegesis Reader (RTL Left)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingReference, setIsResizingReference] = useState(false);

  // Exegesis reader state
  const [activeBook, setActiveBook] = useState("42"); // Default: Ibn Kathir
  const [booksList, setBooksList] = useState([]);
  const [visibleBookIds, setVisibleBookIds] = useState([]);
  const [showManageBooks, setShowManageBooks] = useState(false);
  const [exegesisPages, setExegesisPages] = useState([]);
  const [loadingExegesis, setLoadingExegesis] = useState(false);
  const [loadingMorePage, setLoadingMorePage] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);

  // Notes state
  const [notesList, setNotesList] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [savingStatus, setSavingStatus] = useState("تم الحفظ محلياً");

  // Multi-verse binding states
  const [boundVersesTexts, setBoundVersesTexts] = useState({});
  const [addSurahSelectValue, setAddSurahSelectValue] = useState(1);
  const [addAyahSelectValue, setAddAyahSelectValue] = useState(1);
  const [allNotesList, setAllNotesList] = useState([]);
  const [sidebarTab, setSidebarTab] = useState("quran"); // "quran" or "notes"
  const [isExporting, setIsExporting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    quran_font_family: "Amiri",
    quran_font_size: "32px",
    note_font_family: "Geist",
    note_font_size: "16px",
    backup_enabled: "false",
    backup_interval: "24h",
    gdrive_client_id: "",
    gdrive_secret: "",
    gdrive_oauth_token: ""
  });
  const [authUrl, setAuthUrl] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  const editorRef = useRef(null);
  const progressTimerRef = useRef(null);

  const getGroupedVerses = () => {
    if (!activeNote || !activeNote.bound_verses) return [];
    
    // Copy and sort by Surah ID, then by Ayah number
    const sorted = [...activeNote.bound_verses].sort((a, b) => {
      if (a[0] !== b[0]) return a[0] - b[0];
      return a[1] - b[1];
    });

    const groups = [];
    for (const [sNum, aNum] of sorted) {
      if (groups.length === 0) {
        groups.push({
          surahId: sNum,
          ayahs: [aNum]
        });
      } else {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup.surahId === sNum && aNum === lastGroup.ayahs[lastGroup.ayahs.length - 1] + 1) {
          lastGroup.ayahs.push(aNum);
        } else {
          groups.push({
            surahId: sNum,
            ayahs: [aNum]
          });
        }
      }
    }
    return groups;
  };

  const startProgress = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }
    setProgressPercent(0);
    let current = 0;
    progressTimerRef.current = setInterval(() => {
      if (current < 40) {
        current += Math.floor(Math.random() * 8) + 4;
      } else if (current < 80) {
        current += Math.floor(Math.random() * 4) + 1;
      } else if (current < 95) {
        current += 0.5;
      }
      
      if (current >= 95) {
        current = 95;
        clearInterval(progressTimerRef.current);
      }
      setProgressPercent(Math.min(95, Math.round(current)));
    }, 45);
  };

  const completeProgress = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }
    setProgressPercent(100);
  };

  const loadAllNotes = () => {
    GetAllNotes().then(notes => {
      setAllNotesList(notes || []);
    }).catch(err => {
      console.error("Failed to load all notes:", err);
    });
  };

  const loadBooks = async () => {
    try {
      let list = await GetBooks();
      if (!list || list.length === 0) {
        startProgress();
        setLoadingExegesis(true);
        const defaultIds = ["7798", "18102", "42", "23606", "12884"];
        for (const id of defaultIds) {
          try {
            await AddBook(id);
          } catch (e) {
            console.error(`Failed to seed book ${id}:`, e);
          }
        }
        list = await GetBooks();
      }
      setBooksList(list || []);

      // Fetch visibility settings
      const settingsData = await GetSettings();
      let visibleIds = [];
      if (settingsData && settingsData.visible_books) {
        try {
          visibleIds = JSON.parse(settingsData.visible_books);
        } catch (e) {
          visibleIds = settingsData.visible_books.split(',').filter(Boolean);
        }
      }
      
      const validVisibleIds = visibleIds.filter(id => list.some(b => b.id === id));
      if (validVisibleIds.length === 0) {
        const allIds = list.map(b => b.id);
        setVisibleBookIds(allIds);
        visibleIds = allIds;
      } else {
        setVisibleBookIds(validVisibleIds);
        visibleIds = validVisibleIds;
      }

      if (list && list.length > 0) {
        setActiveBook(prev => {
          const found = list.some(b => b.id === prev) && visibleIds.includes(prev);
          if (found) return prev;
          const defaultTab = list.find(b => b.id === "42" && visibleIds.includes(b.id)) ||
                            list.find(b => b.id === "7798" && visibleIds.includes(b.id)) ||
                            list.find(b => visibleIds.includes(b.id)) ||
                            list[0];
          return defaultTab.id;
        });
      }
    } catch (err) {
      console.error("Failed to load books:", err);
    } finally {
      completeProgress();
      setLoadingExegesis(false);
    }
  };

  const handleToggleBookVisibility = (bookId) => {
    setVisibleBookIds(prev => {
      let next;
      if (prev.includes(bookId)) {
        if (prev.length <= 1) {
          alert("يجب أن يبقى كتاب تفسير واحد على الأقل معروضاً.");
          return prev;
        }
        next = prev.filter(id => id !== bookId);
      } else {
        next = [...prev, bookId];
      }

      SaveSettings({ visible_books: JSON.stringify(next) }).catch(err => {
        console.error("Failed to save visible books setting:", err);
      });

      if (activeBook === bookId && !next.includes(bookId)) {
        const firstVisible = booksList.find(b => next.includes(b.id));
        if (firstVisible) {
          setActiveBook(firstVisible.id);
        }
      }

      return next;
    });
  };

  const handleDeleteCustomBook = async (bookId, title) => {
    const isDefault = ["7798", "18102", "42", "23606", "12884"].includes(bookId);
    if (isDefault) {
      alert("لا يمكن حذف كتب التفسير الافتراضية.");
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف كتاب التفسير "${title}" نهائياً من قاعدة البيانات؟`)) {
      return;
    }

    startProgress();
    setLoadingExegesis(true);
    try {
      await DeleteBook(bookId);
      alert("تم حذف الكتاب بنجاح.");
      
      const nextVisible = visibleBookIds.filter(id => id !== bookId);
      setVisibleBookIds(nextVisible);
      await SaveSettings({ visible_books: JSON.stringify(nextVisible) });

      await loadBooks();
    } catch (err) {
      alert(`خطأ أثناء حذف الكتاب: ${err}`);
    } finally {
      completeProgress();
      setLoadingExegesis(false);
    }
  };

  const handleAddNewBook = async () => {
    const url = window.prompt("أدخل رابط الكتاب من مكتبة الشاملة (مثال: https://shamela.ws/book/42):");
    if (!url) return;

    startProgress();
    setLoadingExegesis(true);
    try {
      const meta = await AddBook(url);
      if (meta) {
        alert(`تم إضافة الكتاب بنجاح: ${meta.title}`);
        
        const nextVisible = Array.from(new Set([...visibleBookIds, meta.id]));
        setVisibleBookIds(nextVisible);
        await SaveSettings({ visible_books: JSON.stringify(nextVisible) });

        const list = await GetBooks();
        setBooksList(list || []);
        setActiveBook(meta.id);
      } else {
        alert("فشل في إضافة الكتاب: لم يتم العثور على بيانات التعريف.");
      }
    } catch (err) {
      alert(`خطأ أثناء إضافة الكتاب: ${err}`);
    } finally {
      completeProgress();
      setLoadingExegesis(false);
    }
  };

  // 1. Fetch Quran structure & settings on startup
  useEffect(() => {
    GetQuranStructure().then(data => {
      setSurahs(data || []);
    }).catch(err => {
      console.error("Failed to load Quran structure:", err);
      setSurahs([]);
    });

    GetSettings().then(data => {
      if (data && Object.keys(data).length > 0) {
        setSettings(prev => ({ ...prev, ...data }));
      }
    }).catch(err => {
      console.error("Failed to load settings:", err);
    });

    loadAllNotes();
    loadBooks();
  }, []);

  // 2. Load Active Ayah text, notes, and exegesis whenever selection changes
  useEffect(() => {
    if (!selectedSurah || !selectedAyah) return;

    // Load Ayah Text
    GetAyahText(selectedSurah, selectedAyah).then(text => {
      setAyahText(text);
    });

    // Reset default select values for adding ayah
    setAddSurahSelectValue(selectedSurah);
    setAddAyahSelectValue(selectedAyah);

    // Load Notes
    loadNotes();

    // Load Exegesis
    loadExegesis();
  }, [selectedSurah, selectedAyah, activeBook]);

  // 3. Load Arabic texts of all bound verses dynamically when activeNote changes
  useEffect(() => {
    if (!activeNote || !activeNote.bound_verses) {
      setBoundVersesTexts({});
      return;
    }

    const missing = activeNote.bound_verses.filter(([s, a]) => !boundVersesTexts[`${s}-${a}`]);
    if (missing.length === 0) return;

    const promises = missing.map(([s, a]) => {
      return GetAyahText(s, a).then(text => ({ key: `${s}-${a}`, text }));
    });

    Promise.all(promises).then(results => {
      setBoundVersesTexts(prev => {
        const next = { ...prev };
        results.forEach(r => {
          next[r.key] = r.text;
        });
        return next;
      });
    });
  }, [activeNote]);

  const startResizeSidebar = (e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  const startResizeReference = (e) => {
    e.preventDefault();
    setIsResizingReference(true);
  };

  // Resizing Panels Effects
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingSidebar) {
        // RTL Layout: Sidebar is on the right of the screen.
        // As clientX decreases, the width of the right sidebar increases.
        const width = window.innerWidth - e.clientX;
        if (width > 180 && width < 500) {
          setSidebarWidth(width);
        }
      }
      if (isResizingReference) {
        // RTL Layout: Reference pane is on the left of the screen.
        // As clientX increases, the width of the left pane increases.
        const width = e.clientX;
        if (width > 180 && width < 500) {
          setReferenceWidth(width);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingReference(false);
    };

    if (isResizingSidebar || isResizingReference) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingReference]);

  const loadNotes = (forceActive = false) => {
    GetNotesForAyah(selectedSurah, selectedAyah).then(notes => {
      const safeNotes = notes || [];
      setNotesList(safeNotes);
      if (forceActive || !activeNote) {
        if (safeNotes.length > 0) {
          setActiveNote(safeNotes[0]);
        } else {
          setActiveNote(null);
        }
      }
    }).catch(err => {
      console.error("Failed to load notes:", err);
      setNotesList([]);
      if (forceActive || !activeNote) {
        setActiveNote(null);
      }
    });
  };

  const loadExegesis = () => {
    startProgress();
    setLoadingExegesis(true);
    setHasMorePages(true);
    GetExegesis(activeBook, selectedSurah, selectedAyah)
      .then(data => {
        if (data) {
          setExegesisPages([data]);
        } else {
          setExegesisPages([]);
        }
      })
      .catch(err => {
        console.error("Failed to load exegesis:", err);
        setExegesisPages([]);
      })
      .finally(() => {
        completeProgress();
        setLoadingExegesis(false);
      });
  };

  const loadNextPage = async () => {
    if (loadingExegesis || loadingMorePage || !hasMorePages || exegesisPages.length === 0) return;
    const lastPageNum = exegesisPages[exegesisPages.length - 1].page_number;
    
    setLoadingMorePage(true);
    startProgress();
    try {
      const nextPageData = await GetExegesisPage(activeBook, lastPageNum + 1);
      if (nextPageData && nextPageData.paragraphs && nextPageData.paragraphs.length > 0) {
        setExegesisPages(prev => [...prev, nextPageData]);
      } else {
        setHasMorePages(false);
      }
    } catch (err) {
      console.error("Failed to load next page:", err);
      setHasMorePages(false);
    } finally {
      completeProgress();
      setLoadingMorePage(false);
    }
  };

  const loadPrevPage = async () => {
    if (loadingExegesis || loadingMorePage || exegesisPages.length === 0) return;
    const firstPageNum = exegesisPages[0].page_number;
    if (firstPageNum <= 1) return;
    
    setLoadingMorePage(true);
    startProgress();
    try {
      const prevPageData = await GetExegesisPage(activeBook, firstPageNum - 1);
      if (prevPageData && prevPageData.paragraphs && prevPageData.paragraphs.length > 0) {
        setExegesisPages(prev => [prevPageData, ...prev]);
      } else {
        alert("لا توجد صفحات سابقة متوفرة.");
      }
    } catch (err) {
      console.error("Failed to load previous page:", err);
    } finally {
      completeProgress();
      setLoadingMorePage(false);
    }
  };

  const handleExegesisScroll = (e) => {
    if (loadingExegesis || loadingMorePage || !hasMorePages || exegesisPages.length === 0) return;
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 80) {
      loadNextPage();
    }
  };

  // Note management
  const handleCreateNewNote = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const surahName = surahs.find(s => s.id === selectedSurah)?.name || "";
    const noteId = "note_" + Date.now();
    const title = `تأملات - سورة ${surahName} آية ${selectedAyah} (${timestamp})`;
    const content = `# ${title}\n\n`;
    const bound = [[selectedSurah, selectedAyah]];

    CreateNote(noteId, title, content, bound).then(() => {
      const newNote = {
        id: noteId,
        title: title,
        content: content,
        bound_verses: bound,
        created_at: new Date(),
        updated_at: new Date()
      };
      setNotesList(prev => [newNote, ...prev]);
      setActiveNote(newNote);
      loadAllNotes();
    }).catch(err => alert("خطأ في إنشاء الملحوظة: " + err));
  };

  const handleNoteChange = (fields) => {
    if (!activeNote) return;
    const updated = { ...activeNote, ...fields, updated_at: new Date() };
    setActiveNote(updated);
    setSavingStatus("جاري الحفظ...");

    SaveNote(updated.id, updated.title, updated.content, updated.bound_verses)
      .then(() => {
        setSavingStatus("تم الحفظ محلياً");
        setNotesList(prev => prev.map(n => n.id === updated.id ? updated : n));
        loadAllNotes();
      })
      .catch(err => setSavingStatus("خطأ في الحفظ: " + err));
  };

  const handleDeleteNote = (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الملحوظة؟")) return;
    DeleteNote(id).then(() => {
      setNotesList(prev => prev.filter(n => n.id !== id));
      setActiveNote(null);
      loadAllNotes();
    }).catch(err => alert("خطأ في الحذف: " + err));
  };

  // Bind a specific verse to the active note
  const handleAddVerseToActiveNote = (ayahNum) => {
    if (!activeNote) return;
    const exists = activeNote.bound_verses.some(v => v[0] === selectedSurah && v[1] === ayahNum);
    if (exists) return;

    const newBounds = [...activeNote.bound_verses, [selectedSurah, ayahNum]];
    handleNoteChange({ bound_verses: newBounds });
  };

  const handleAddSpecificVerse = (surahNum, ayahNum) => {
    if (!activeNote) return;
    const exists = activeNote.bound_verses.some(v => v[0] === surahNum && v[1] === ayahNum);
    if (exists) return;

    const newBounds = [...activeNote.bound_verses, [surahNum, ayahNum]];
    handleNoteChange({ bound_verses: newBounds });
  };

  const handleBindCurrentVerse = () => {
    handleAddSpecificVerse(selectedSurah, selectedAyah);
  };

  const handleUnbindVerse = (surahNum, ayahNum) => {
    if (!activeNote) return;
    const newBounds = activeNote.bound_verses.filter(v => !(v[0] === surahNum && v[1] === ayahNum));
    handleNoteChange({ bound_verses: newBounds });
  };

  // Deep linking citation injection
  const handleInjectCitation = (paraIndex, paragraphText, pageNum, partNum) => {
    if (!activeNote) return;

    // Force edit mode so the textarea is rendered
    setIsEditMode(true);

    setTimeout(() => {
      if (!editorRef.current) return;

      const book = booksList.find(b => b.id === activeBook);
      const bookName = book ? book.title : "تفسير";
      const partPart = partNum ? `${partNum} ` : "";
      const citation = `\n> ${paragraphText}\n> — [[${bookName}: ${partPart}ص ${pageNum} فقرة ${paraIndex + 1}]]\n\n`;

      const textarea = editorRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);

      const updatedContent = before + citation + after;
      handleNoteChange({ content: updatedContent });

      setTimeout(() => {
        textarea.focus();
        const newCursor = start + citation.length;
        textarea.setSelectionRange(newCursor, newCursor);
      }, 50);
    }, 100);
  };

  // Single file markdown export
  const handleExportSingleNote = () => {
    if (!activeNote) return;
    const defaultName = `${activeNote.title}.md`;
    const targetPath = window.prompt("أدخل مسار الحفظ لملف الماركدون:", defaultName);
    if (!targetPath) return;

    startProgress();
    setIsExporting(true);
    ExportNoteToMarkdown(activeNote.id, targetPath)
      .then(() => alert("تم تصدير الملحوظة بنجاح!"))
      .catch(err => alert("خطأ في التصدير: " + err))
      .finally(() => {
        completeProgress();
        setIsExporting(false);
      });
  };

  // Vault bulk export
  const handleExportVault = () => {
    const targetDir = window.prompt("أدخل مسار المجلد لتصدير كامل الخزانة:", "");
    if (targetDir === null) return;

    startProgress();
    setIsExporting(true);
    ExportVaultToMarkdown(targetDir)
      .then(() => alert("تم تصدير كامل الخزانة بنجاح!"))
      .catch(err => alert("خطأ في تصدير الخزانة: " + err))
      .finally(() => {
        completeProgress();
        setIsExporting(false);
      });
  };

  // Google Drive Auth Actions
  const handleStartGDriveAuth = () => {
    startProgress();
    setAuthenticating(true);
    StartGoogleDriveAuth()
      .then(url => {
        setAuthUrl(url);
        CompleteGoogleDriveAuth()
          .then(() => {
            completeProgress();
            alert("تم إتمام المصادقة مع Google Drive بنجاح!");
            GetSettings().then(data => setSettings(prev => ({ ...prev, ...data })));
            setAuthenticating(false);
          })
          .catch(err => {
            completeProgress();
            alert("فشلت المصادقة: " + err);
            setAuthenticating(false);
          });
      })
      .catch(err => {
        completeProgress();
        alert("فشل بدء الاتصال بـ Google Drive: " + err);
        setAuthenticating(false);
      });
  };

  const handleSaveSettings = (newSettings) => {
    SaveSettings(newSettings)
      .then(() => {
        setSettings(prev => ({ ...prev, ...newSettings }));
        setShowSettings(false);
      })
      .catch(err => alert("فشل حفظ الإعدادات: " + err));
  };

  const toggleSurahExpanded = (id) => {
    setExpandedSurahs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredSurahs = surahs.filter(surah => {
    const normalizedQuery = normalizeArabic(surahSearchQuery.trim());
    const normalizedName = normalizeArabic(surah.name);
    return normalizedName.includes(normalizedQuery) || String(surah.id).includes(normalizedQuery);
  });

  const currentSurahObj = surahs.find(s => s.id === selectedSurah);
  const currentSurahTotalVerses = currentSurahObj ? currentSurahObj.total_verses : 0;

  return (
    <div className="bg-background text-on-surface font-body-md overflow-hidden h-screen flex flex-col select-none">
      {/* Top Navbar */}
      <header className="fixed top-0 w-full z-30 flex justify-between items-center px-4 h-12 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant">
        <div className="flex items-center gap-6">
          <h1 className="font-quran-display text-headline-md text-primary leading-none cursor-pointer">تفكّر</h1>
          <span className="text-xs text-on-surface-variant font-label-caps opacity-80">Obsidian Quran Exegesis</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-on-surface-variant cursor-pointer p-1.5 hover:bg-surface-container-highest rounded" onClick={() => setShowSettings(true)}>settings</span>
          <button className="bg-[#181f34] border border-outline-variant hover:border-primary text-xs px-3 py-1 rounded transition-all text-on-surface font-bold" onClick={handleExportVault}>تصدير الخزانة</button>
        </div>
      </header>

      {/* Global Linear Progress Bar (Under the navbar) */}
      {(loadingExegesis || isExporting || authenticating) && (
        <div className="fixed top-12 left-0 right-0 h-[3px] bg-surface-container-high z-40 overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300 ease-out shadow-[0_0_8px_#6bd8cb]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-1 pt-12 overflow-hidden">
        {/* Pane 1: Quran navigation / notes list explorer (RTL Right) */}
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className="flex-shrink-0 bg-surface-container-low border-l border-outline-variant flex flex-col h-full overflow-hidden"
        >
          {/* Sidebar Tabs */}
          <div className="flex border-b border-outline-variant/30 bg-surface-container-lowest">
            <button
              className={`flex-1 py-3 text-xs font-bold transition-all ${
                sidebarTab === "quran"
                  ? "text-primary border-b-2 border-primary bg-surface-container-low"
                  : "text-on-surface-variant hover:bg-surface-container-highest"
              }`}
              onClick={() => setSidebarTab("quran")}
            >
              المصحف الشريف
            </button>
            <button
              className={`flex-1 py-3 text-xs font-bold transition-all ${
                sidebarTab === "notes"
                  ? "text-primary border-b-2 border-primary bg-surface-container-low"
                  : "text-on-surface-variant hover:bg-surface-container-highest"
              }`}
              onClick={() => {
                setSidebarTab("notes");
                loadAllNotes();
              }}
            >
              كل الملاحظات ({allNotesList.length})
            </button>
          </div>

          {sidebarTab === "quran" ? (
            <>
              <div className="p-2 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center gap-2">
                <div className="relative flex-grow">
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs select-none">search</span>
                  <input
                    type="text"
                    placeholder="بحث عن سورة..."
                    className="w-full bg-surface-container-low text-on-surface border border-outline-variant/20 text-xs rounded-lg pr-8 pl-8 py-1.5 focus:outline-none focus:border-primary transition-all text-right font-quran-text"
                    value={surahSearchQuery}
                    onChange={(e) => setSurahSearchQuery(e.target.value)}
                  />
                  {surahSearchQuery && (
                    <span
                      className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[14px] hover:text-error cursor-pointer select-none"
                      onClick={() => setSurahSearchQuery("")}
                    >
                      close
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-0.5">
                {filteredSurahs.map(surah => {
                  const isExpanded = expandedSurahs[surah.id];
                  return (
                    <div key={surah.id} className="group">
                      <div
                        className={`flex items-center gap-2 px-3 py-2 hover:bg-surface-container-highest cursor-pointer rounded transition-all ${
                          selectedSurah === surah.id ? "bg-surface-container-high/40 text-primary border-r-2 border-primary" : "text-on-surface-variant"
                        }`}
                        onClick={() => {
                          setSelectedSurah(surah.id);
                          setSelectedAyah(1);
                          toggleSurahExpanded(surah.id);
                        }}
                      >
                        <span className={`material-symbols-outlined text-sm transition-transform ${isExpanded ? "rotate-90" : "rotate-180"}`}>chevron_left</span>
                        <span className="material-symbols-outlined text-sm">{isExpanded ? "folder_open" : "folder"}</span>
                        <span className="font-quran-text text-sm leading-none">{String(surah.id).padStart(3, '0')} - {surah.name}</span>
                      </div>

                      {isExpanded && (
                        <div className="mr-4 border-r border-outline-variant/30 mt-1 space-y-0.5 pl-1">
                          {Array.from({ length: surah.total_verses }, (_, index) => {
                            const ayahNum = index + 1;
                            const isSelected = selectedSurah === surah.id && selectedAyah === ayahNum;
                            return (
                              <div
                                key={ayahNum}
                                className={`flex items-center gap-2 px-3 py-1 hover:bg-surface-container-highest cursor-pointer rounded text-xs transition-all ${
                                  isSelected ? "bg-primary/10 text-primary font-bold" : "text-on-surface-variant/80"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSurah(surah.id);
                                  setSelectedAyah(ayahNum);
                                }}
                              >
                                <span className="material-symbols-outlined text-xs">notes</span>
                                <span className="font-quran-text">الآية {ayahNum}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
              {allNotesList.length === 0 ? (
                <div className="text-center text-xs text-on-surface-variant/60 py-8">
                  لا توجد ملاحظات حالياً.
                </div>
              ) : (
                allNotesList.map(note => {
                  const isActive = activeNote && activeNote.id === note.id;
                  const snippet = note.content
                    ? note.content.replace(/^#\s+[^\n]+\n*/, '').substring(0, 60)
                    : "";
                  return (
                    <div
                      key={note.id}
                      className={`p-3 rounded cursor-pointer transition-all border text-right ${
                        isActive
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-surface-container-low border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
                      }`}
                      onClick={() => {
                        setActiveNote(note);
                        if (note.bound_verses && note.bound_verses.length > 0) {
                          const [s, a] = note.bound_verses[0];
                          setSelectedSurah(s);
                          setSelectedAyah(a);
                        }
                      }}
                    >
                      <div className="font-bold text-xs truncate mb-1">{note.title}</div>
                      <div className="text-[10px] text-on-surface-variant/80 truncate">
                        {snippet || "لا يوجد محتوى..."}
                      </div>
                      <div className="text-[8px] text-tertiary mt-2">
                        الآيات المرتبطة: {note.bound_verses.map(([s, a]) => {
                          const sName = surahs.find(sur => sur.id === s)?.name || s;
                          return `${sName} (${a})`;
                        }).join('، ')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>

        {/* Resizer Handle 1 (Between Right Sidebar and Editor) */}
        <div
          className={`resize-handle-v ${isResizingSidebar ? 'active' : ''}`}
          onMouseDown={startResizeSidebar}
        />

        {/* Pane 2: Editor (Middle) */}
        <section className="flex-grow flex flex-col bg-[#111625] relative overflow-y-auto editor-pane">
          {/* Editor Header */}
          <div className="sticky top-0 z-10 bg-[#111625]/95 backdrop-blur-sm border-b border-outline-variant/20 p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-3 w-full text-right">
                {/* Embedded Quran Font & Size for all bound verses */}
                {activeNote && activeNote.bound_verses && activeNote.bound_verses.length > 0 ? (
                  <div className="space-y-6">
                    {getGroupedVerses().map((group) => {
                      const sNum = group.surahId;
                      const sName = surahs.find(s => s.id === sNum)?.name || sNum;
                      const minAyah = group.ayahs[0];
                      const maxAyah = group.ayahs[group.ayahs.length - 1];
                      const totalVerses = surahs.find(s => s.id === sNum)?.total_verses || 0;
                      const groupKey = `${sNum}-${minAyah}-${maxAyah}`;
                      return (
                        <div key={groupKey} className="group/verse border-r-2 border-primary/20 pr-4 py-1 text-right relative">
                          <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] bg-primary/25 text-primary px-2.5 py-0.5 rounded font-quran-text border border-primary/30">
                                سورة {sName} : {group.ayahs.length === 1 ? `الآية ${minAyah}` : `الآيات ${minAyah} - ${maxAyah}`}
                              </span>
                              {minAyah > 1 && (
                                <button
                                  className="text-[9px] bg-[#181f34] text-on-surface-variant hover:text-primary border border-outline-variant/30 px-2 py-0.5 rounded transition-all font-bold"
                                  onClick={() => handleAddSpecificVerse(sNum, minAyah - 1)}
                                >
                                  + الآية السابقة ({minAyah - 1})
                                </button>
                              )}
                              {maxAyah < totalVerses && (
                                <button
                                  className="text-[9px] bg-[#181f34] text-on-surface-variant hover:text-primary border border-outline-variant/30 px-2 py-0.5 rounded transition-all font-bold"
                                  onClick={() => handleAddSpecificVerse(sNum, maxAyah + 1)}
                                >
                                  + الآية التالية ({maxAyah + 1})
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Individual ayah tags for unbinding */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-1 mb-2">
                            {group.ayahs.map(aNum => (
                              <span
                                key={aNum}
                                className="inline-flex items-center gap-1 text-[9px] bg-surface-container-highest/60 hover:bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded border border-outline-variant/20 transition-colors"
                              >
                                الآية {aNum}
                                {activeNote.bound_verses.length > 1 && (
                                  <span
                                    className="material-symbols-outlined text-[10px] cursor-pointer text-on-surface-variant/70 hover:text-error font-bold leading-none select-none"
                                    onClick={() => handleUnbindVerse(sNum, aNum)}
                                    title={`إزالة الربط بالآية ${aNum}`}
                                  >
                                    close
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>

                          <h2
                            className="leading-loose tracking-wide select-text text-primary text-right"
                            style={{ fontFamily: settings.quran_font_family, fontSize: settings.quran_font_size }}
                          >
                            {group.ayahs.map(aNum => {
                              const verseKey = `${sNum}-${aNum}`;
                              const text = boundVersesTexts[verseKey] || "جاري تحميل الآية...";
                              return (
                                <span key={verseKey} className="inline">
                                  {text}
                                  <span className="text-secondary/80 font-quran-text text-[0.8em] select-none mx-1.5 inline-block">
                                    {getAyahMarker(aNum)}
                                  </span>
                                </span>
                              );
                            })}
                          </h2>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="border-r-2 border-primary/20 pr-4 py-1 text-right">
                    <span className="text-[9px] bg-primary/25 text-primary px-2.5 py-0.5 rounded font-quran-text border border-primary/30">
                      سورة {surahs.find(s => s.id === selectedSurah)?.name || ""} : آية {selectedAyah}
                    </span>
                    <h2
                      className="mt-3 text-right leading-loose tracking-wide select-text text-primary"
                      style={{ fontFamily: settings.quran_font_family, fontSize: settings.quran_font_size }}
                    >
                      {ayahText}
                    </h2>
                  </div>
                )}
              </div>
            </div>

            {/* Note Picker / Creator Header bar */}
            <div className="flex justify-between items-center bg-surface-container-low/50 p-2 rounded-lg border border-outline-variant/20 gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="bg-primary hover:bg-primary-container hover:text-on-primary-container text-on-primary font-bold text-xs py-1.5 px-3 rounded flex items-center gap-1.5 transition-colors"
                  onClick={handleCreateNewNote}
                >
                  <span className="material-symbols-outlined text-xs">add</span>
                  ملحوظة جديدة
                </button>
                {activeNote && (
                  <button
                    className="bg-[#181f34] border border-outline-variant text-on-surface hover:text-primary text-xs py-1.5 px-3 rounded flex items-center gap-1 transition-all font-bold"
                    onClick={handleBindCurrentVerse}
                    title="ربط الملحوظة النشطة بالآية المفتوحة حالياً"
                  >
                    <span className="material-symbols-outlined text-xs">link</span>
                    ربط بالآية الحالية
                  </button>
                )}
                {activeNote && (
                  <button
                    className="bg-[#181f34] border border-outline-variant text-on-surface hover:text-primary text-xs py-1.5 px-3 rounded flex items-center gap-1.5 transition-all font-bold"
                    onClick={() => setIsEditMode(!isEditMode)}
                    title={isEditMode ? "معاينة الملحوظة بتنسيق ماركداون" : "تعديل الملحوظة"}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {isEditMode ? "visibility" : "edit"}
                    </span>
                    {isEditMode ? "معاينة" : "تعديل"}
                  </button>
                )}
              </div>

              {/* Add Verse widget to bind more Ayat to the current note */}
              {activeNote && (
                <div className="flex items-center gap-1.5 bg-[#181f34]/80 p-1.5 rounded border border-outline-variant/25">
                  <span className="text-[10px] text-on-surface-variant font-bold">ربط آية إضافية:</span>
                  <select
                    className="bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-1.5 py-0.5 max-w-[110px] focus:outline-none"
                    value={addSurahSelectValue}
                    onChange={(e) => {
                      const sId = Number(e.target.value);
                      setAddSurahSelectValue(sId);
                      setAddAyahSelectValue(1);
                    }}
                  >
                    {surahs.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <select
                    className="bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-1.5 py-0.5 max-w-[80px] focus:outline-none"
                    value={addAyahSelectValue}
                    onChange={(e) => setAddAyahSelectValue(Number(e.target.value))}
                  >
                    {Array.from(
                      { length: surahs.find(s => s.id === addSurahSelectValue)?.total_verses || 0 },
                      (_, i) => i + 1
                    ).map(num => (
                      <option key={num} value={num}>الآية {num}</option>
                    ))}
                  </select>
                  <button
                    className="bg-primary text-on-primary hover:opacity-90 text-[10px] px-2 py-0.5 rounded flex items-center gap-0.5 transition-all font-bold"
                    onClick={() => handleAddSpecificVerse(addSurahSelectValue, addAyahSelectValue)}
                  >
                    <span className="material-symbols-outlined text-[10px]">add</span>
                    ربط
                  </button>
                </div>
              )}

              {notesList.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-on-surface-variant font-bold">الملحوظة النشطة:</span>
                  <select
                    className="bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2 py-1 max-w-[200px] focus:outline-none"
                    value={activeNote?.id || ""}
                    onChange={(e) => {
                      const note = notesList.find(n => n.id === e.target.value);
                      if (note) setActiveNote(note);
                    }}
                  >
                    {notesList.map(n => (
                      <option key={n.id} value={n.id}>{n.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Alert Banner when open note is not linked to current navigated verse */}
          {activeNote && !activeNote.bound_verses.some(v => v[0] === selectedSurah && v[1] === selectedAyah) && (
            <div className="bg-primary/10 border-b border-primary/20 px-6 py-2.5 flex justify-between items-center text-xs text-right">
              <span className="text-on-surface-variant font-bold">
                الملاحظة المفتوحة غير مرتبطة بالآية النشطة حالياً (سورة {surahs.find(s => s.id === selectedSurah)?.name || ""} آية {selectedAyah}).
              </span>
              <button
                className="bg-primary text-on-primary font-bold px-3 py-1 rounded hover:opacity-90 transition-opacity"
                onClick={handleBindCurrentVerse}
              >
                ربط بالآية الحالية
              </button>
            </div>
          )}

          {/* Editor Workspace Content */}
          <div className="flex-grow flex flex-col p-6 max-w-editor-max-width mx-auto w-full pb-16">
            {activeNote ? (
              <div className="flex-grow flex flex-col gap-4">
                {isEditMode ? (
                  <>
                    <input
                      type="text"
                      className="bg-transparent text-primary text-headline-lg font-bold border-b border-outline-variant/20 py-2 focus:outline-none focus:border-primary transition-all text-right"
                      value={activeNote.title}
                      onChange={(e) => handleNoteChange({ title: e.target.value })}
                      placeholder="عنوان الملحوظة..."
                    />

                    <textarea
                      id="note-editor-textarea"
                      ref={editorRef}
                      className="flex-grow bg-transparent text-on-surface leading-relaxed text-right rtl-editor border-none focus:ring-0 outline-none resize-none font-body-lg"
                      style={{ fontFamily: settings.note_font_family, fontSize: settings.note_font_size }}
                      value={activeNote.content}
                      onChange={(e) => handleNoteChange({ content: e.target.value })}
                      placeholder="اكتب تأملاتك وملاحظاتك هنا (يدعم لغة الماركداون)..."
                    />
                  </>
                ) : (
                  <>
                    <h1 className="text-primary text-headline-lg font-bold pb-2 text-right border-b border-outline-variant/20">
                      {activeNote.title}
                    </h1>
                    <div
                      className="flex-grow text-on-surface leading-relaxed text-right overflow-y-auto select-text font-body-lg"
                      style={{ fontFamily: settings.note_font_family, fontSize: settings.note_font_size }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(activeNote.content) }}
                    />
                  </>
                )}

                <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4 mt-6">
                  <button className="bg-[#181f34] border border-outline-variant text-on-surface hover:text-primary text-xs px-3 py-1.5 rounded transition-all flex items-center gap-1 font-bold" onClick={handleExportSingleNote}>
                    <span className="material-symbols-outlined text-xs">file_download</span>
                    حفظ كملف Markdown
                  </button>
                  <button className="bg-[#5a1515] text-red-200 border border-red-500/20 hover:bg-red-950 text-xs px-3 py-1.5 rounded transition-all flex items-center gap-1 font-bold" onClick={() => handleDeleteNote(activeNote.id)}>
                    <span className="material-symbols-outlined text-xs">delete</span>
                    حذف الملحوظة
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-on-surface-variant gap-4 py-32 border-2 border-dashed border-outline-variant/20 rounded-xl">
                <span className="material-symbols-outlined text-[64px] opacity-40">edit_note</span>
                <p className="text-sm">لا توجد ملاحظات مرتبطة بهذه الآية حالياً.</p>
                <button
                  className="bg-primary hover:bg-primary-container text-on-primary px-6 py-2.5 rounded font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
                  onClick={handleCreateNewNote}
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  كتابة ملحوظة جديدة
                </button>
              </div>
            )}
          </div>

          {/* Note Status Bar */}
          <footer className="h-6 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between px-4 fixed bottom-0 left-[260px] right-[260px] z-10">
            <div className="flex gap-4 items-center h-full">
              <span className="font-body-md text-[9px] text-on-surface-variant opacity-80">UTF-8</span>
              {activeNote && (
                <span className="font-body-md text-[9px] text-on-surface-variant opacity-80">
                  حجم الملحوظة: {activeNote.content.length} حرفاً | الكلمات: {activeNote.content.trim() ? activeNote.content.trim().split(/\s+/).length : 0}
                </span>
              )}
            </div>
            <div className="flex gap-4 items-center h-full">
              <span className="font-body-md text-[9px] text-primary flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${savingStatus.includes("خطأ") ? "bg-error" : "bg-primary animate-pulse"}`}></span>
                {savingStatus}
              </span>
            </div>
          </footer>
        </section>

        {/* Resizer Handle 2 (Between Editor and Left Sidebar) */}
        <div
          className={`resize-handle-v ${isResizingReference ? 'active' : ''}`}
          onMouseDown={startResizeReference}
        />

        {/* Pane 3: Reference Exegesis Reader (RTL Left) */}
        <aside
          style={{ width: `${referenceWidth}px` }}
          className="flex-shrink-0 bg-surface-container border-r border-outline-variant flex flex-col h-full overflow-hidden"
        >
          {/* Exegesis book selector tabs header */}
          <div className="flex justify-between items-center border-b border-outline-variant bg-surface-container-low select-none">
            {/* Tabs scrollable area */}
            <div className="flex-grow flex overflow-x-auto no-scrollbar items-center">
              {booksList.filter(book => visibleBookIds.includes(book.id)).map(book => (
                <button
                  key={book.id}
                  title={book.title}
                  className={`px-3 py-3 font-quran-text text-xs flex-shrink-0 transition-all ${
                    activeBook === book.id
                      ? "text-primary bg-surface-container border-b-2 border-primary font-bold custom-active-border"
                      : "text-on-surface-variant hover:bg-surface-container-highest"
                  }`}
                  onClick={() => setActiveBook(book.id)}
                >
                  {getShortBookName(book.title)}
                </button>
              ))}
            </div>

            {/* Action buttons (fixed on the left) */}
            <div className="flex items-center gap-0.5 px-2 border-r border-outline-variant/20 flex-shrink-0 h-full bg-surface-container-low">
              <button
                onClick={handleAddNewBook}
                title="إضافة كتاب جديد من المكتبة الشاملة"
                className="p-1.5 flex items-center justify-center text-primary hover:text-primary-container hover:bg-surface-container-highest rounded transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm font-bold">add</span>
              </button>
              <button
                onClick={() => setShowManageBooks(true)}
                title="تنظيم كتب التفسير الظاهرة"
                className="p-1.5 flex items-center justify-center text-primary hover:text-primary-container hover:bg-surface-container-highest rounded transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm font-bold">tune</span>
              </button>
            </div>
          </div>

          {/* Exegesis content panel */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar"
            onScroll={handleExegesisScroll}
          >
            {loadingExegesis ? (
              <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4">
                {/* Percentage based progress bar */}
                <div className="w-48 bg-surface-container-high h-2 rounded-full overflow-hidden relative border border-outline-variant/30">
                  <div
                    className="bg-primary h-full transition-all duration-300 ease-out shadow-[0_0_8px_#6bd8cb]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-primary">
                  جاري تحميل التفسير... ({progressPercent}%)
                </span>
              </div>
            ) : exegesisPages.length > 0 ? (
              <div className="space-y-6">
                {/* Prepend page button */}
                {exegesisPages[0].page_number > 1 && (
                  <button
                    onClick={loadPrevPage}
                    disabled={loadingMorePage}
                    className="w-full py-2 bg-[#181f34] hover:bg-surface-container-highest border border-outline-variant/30 rounded text-xs text-primary font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-xs">keyboard_double_arrow_up</span>
                    تحميل الصفحة السابقة (صفحة {exegesisPages[0].page_number - 1})
                  </button>
                )}

                {exegesisPages.map((pageData, pIdx) => (
                  <div
                    key={`${pageData.book_id}-${pageData.page_number}`}
                    className="space-y-4 text-justify select-text border-b border-outline-variant/15 pb-6 last:border-b-0"
                  >
                    <div className="border-b border-outline-variant/10 pb-2 mb-2 flex justify-between items-center">
                      <span className="text-[10px] text-tertiary block font-bold">
                        {pageData.part_number ? `${pageData.part_number} | ` : ""}صفحة {pageData.page_number}
                      </span>
                      {pIdx > 0 && (
                        <span className="text-[9px] text-on-surface-variant/40 italic">تصفح متتالي</span>
                      )}
                    </div>

                    {pageData.paragraphs && pageData.paragraphs.map((p, idx) => (
                      <div
                        key={idx}
                        className="group relative flex items-start gap-2 border-b border-outline-variant/5 pb-2 last:border-b-0"
                      >
                        <p className="font-quran-text text-sm leading-loose text-on-surface text-right flex-grow">
                          {p}
                        </p>
                        {activeNote && (
                          <button
                            className="material-symbols-outlined text-primary/40 hover:text-primary transition-colors text-sm mt-1.5 cursor-pointer flex-shrink-0"
                            title="اقتباس المرجع وإدراجه في الملاحظة"
                            onClick={() => handleInjectCitation(idx, p, pageData.page_number, pageData.part_number)}
                          >
                            format_quote
                          </button>
                        )}
                      </div>
                    ))}

                    {pageData.footnotes && pageData.footnotes.length > 0 && (
                      <div className="mt-6 border-t border-outline-variant/20 pt-4 space-y-2 text-right">
                        <span className="text-[10px] text-tertiary block font-bold">الهوامش والمراجع (ص {pageData.page_number}):</span>
                        {pageData.footnotes.map((fn, idx) => (
                          <p key={idx} className="text-xs text-on-surface-variant font-quran-text leading-relaxed">
                            {fn.number ? `(${fn.number}) ` : ""}{fn.content}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {loadingMorePage && (
                  <div className="flex justify-center items-center py-4 gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-primary font-bold">جاري تحميل الصفحة التالية...</span>
                  </div>
                )}

                {!hasMorePages && (
                  <div className="text-center text-[10px] text-on-surface-variant/40 py-4">
                    — نهاية صفحات الكتاب —
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-2 opacity-60">
                <span className="material-symbols-outlined text-[48px]">search_off</span>
                <span className="text-xs">لم يتم العثور على صفحات تفسير لهذه الآية.</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Settings Modal Dialog overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-text text-right" dir="rtl">
          <div className="bg-[#111625] border border-outline-variant/30 rounded-2xl w-[480px] max-w-full p-6 flex flex-col gap-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary text-headline-md">إعدادات تفكّر</h3>
              <span className="material-symbols-outlined cursor-pointer text-on-surface-variant hover:text-primary" onClick={() => setShowSettings(false)}>close</span>
            </div>

            <div className="space-y-6 overflow-y-auto max-h-[400px] pl-2 no-scrollbar">
              {/* Typography Group */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-secondary border-r-2 border-primary pr-2">الخطوط وتنسيق العرض</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">خط المصحف الشريف</label>
                    <select
                      className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                      value={settings.quran_font_family}
                      onChange={(e) => setSettings(prev => ({ ...prev, quran_font_family: e.target.value }))}
                    >
                      <option value="Amiri">Amiri (عربي كلاسيكي)</option>
                      <option value="Arial">Arial (خط افتراضي)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">حجم خط المصحف</label>
                    <select
                      className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                      value={settings.quran_font_size}
                      onChange={(e) => setSettings(prev => ({ ...prev, quran_font_size: e.target.value }))}
                    >
                      <option value="24px">24px</option>
                      <option value="28px">28px</option>
                      <option value="32px">32px</option>
                      <option value="36px">36px</option>
                      <option value="40px">40px</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">خط الملاحظات</label>
                    <select
                      className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                      value={settings.note_font_family}
                      onChange={(e) => setSettings(prev => ({ ...prev, note_font_family: e.target.value }))}
                    >
                      <option value="Geist">Geist (خط حديث)</option>
                      <option value="Amiri">Amiri</option>
                      <option value="Arial">Arial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">حجم خط الملاحظات</label>
                    <select
                      className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                      value={settings.note_font_size}
                      onChange={(e) => setSettings(prev => ({ ...prev, note_font_size: e.target.value }))}
                    >
                      <option value="13px">13px</option>
                      <option value="14px">14px</option>
                      <option value="16px">16px</option>
                      <option value="18px">18px</option>
                      <option value="20px">20px</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* GDrive Backup settings */}
              <div className="space-y-4 border-t border-outline-variant/20 pt-4">
                <h4 className="text-xs font-bold text-secondary border-r-2 border-primary pr-2">النسخ الاحتياطي السحابي (Google Drive)</h4>
                
                <div className="flex items-center justify-between bg-[#1e293b]/40 p-2.5 rounded-lg border border-outline-variant/10">
                  <span className="text-xs font-bold">تفعيل النسخ الاحتياطي التلقائي</span>
                  <div
                    className={`w-8 h-4 rounded-full relative cursor-pointer transition-all ${
                      settings.backup_enabled === "true" ? "bg-primary-container" : "bg-[#2d3748]"
                    }`}
                    onClick={() => setSettings(prev => ({ ...prev, backup_enabled: prev.backup_enabled === "true" ? "false" : "true" }))}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                      settings.backup_enabled === "true" ? "right-4.5 bg-primary" : "right-0.5 bg-outline"
                    }`}></div>
                  </div>
                </div>

                {settings.backup_enabled === "true" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">معدل تكرار المزامنة</label>
                      <select
                        className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                        value={settings.backup_interval}
                        onChange={(e) => setSettings(prev => ({ ...prev, backup_interval: e.target.value }))}
                      >
                        <option value="1h">كل ساعة (Hourly)</option>
                        <option value="12h">كل ١٢ ساعة</option>
                        <option value="24h">كل ٢٤ ساعة (Daily)</option>
                        <option value="168h">كل أسبوع (Weekly)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">OAuth Client ID</label>
                      <input
                        type="text"
                        className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary text-left"
                        value={settings.gdrive_client_id}
                        onChange={(e) => setSettings(prev => ({ ...prev, gdrive_client_id: e.target.value }))}
                        placeholder="Paste Google Client ID"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-on-surface-variant mb-1 font-bold">OAuth Client Secret</label>
                      <input
                        type="password"
                        className="w-full bg-[#1e293b] text-on-surface border border-outline-variant/30 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary text-left"
                        value={settings.gdrive_secret}
                        onChange={(e) => setSettings(prev => ({ ...prev, gdrive_secret: e.target.value }))}
                        placeholder="Paste Client Secret"
                      />
                    </div>

                    <div className="bg-[#1e293b]/60 p-3 rounded-lg border border-outline-variant/20 flex flex-col gap-2">
                      <span className="text-[10px] text-on-surface-variant block leading-relaxed font-bold">
                        {settings.gdrive_oauth_token ? "✓ تم ربط حساب Google Drive بنجاح." : "يرجى تعبئة بيانات OAuth أولاً، ثم الضغط على ربط الحساب أدناه للمصادقة."}
                      </span>
                      {settings.gdrive_client_id && settings.gdrive_secret && (
                        <button
                          type="button"
                          className="bg-primary text-on-primary-container text-xs py-1 px-4 rounded font-bold hover:opacity-90 self-start transition-opacity"
                          disabled={authenticating}
                          onClick={handleStartGDriveAuth}
                        >
                          {authenticating ? "جاري المصادقة..." : "ربط الحساب الآن"}
                        </button>
                      )}
                      {authUrl && (
                        <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline mt-1 block">
                          إذا لم تفتح نافذة المتصفح تلقائياً، اضغط هنا لفتح رابط المصادقة.
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Exegesis Books Settings */}
              <div className="space-y-4 border-t border-outline-variant/20 pt-4">
                <h4 className="text-xs font-bold text-secondary border-r-2 border-primary pr-2">تنظيم كتب التفسير</h4>
                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  اختر كتب التفسير التي ترغب في إظهارها في شريط التصفح الجانبي:
                </p>
                <div className="border border-outline-variant/10 rounded-xl bg-[#1e293b]/20 p-2.5 space-y-1.5 max-h-[160px] overflow-y-auto no-scrollbar">
                  {booksList.map(book => {
                    const isVisible = visibleBookIds.includes(book.id);
                    return (
                      <div key={book.id} className="flex items-center gap-2.5 py-1">
                        <input
                          type="checkbox"
                          id={`settings-visible-checkbox-${book.id}`}
                          className="w-3.5 h-3.5 accent-primary rounded cursor-pointer"
                          checked={isVisible}
                          onChange={() => handleToggleBookVisibility(book.id)}
                        />
                        <label
                          htmlFor={`settings-visible-checkbox-${book.id}`}
                          className="font-quran-text text-xs cursor-pointer select-none text-on-surface hover:text-primary transition-colors text-right"
                        >
                          {book.title}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-outline-variant/20 pt-4 mt-2">
              <button
                className="bg-[#181f34] border border-outline-variant text-xs px-4 py-2 rounded hover:text-primary transition-all text-on-surface font-bold"
                onClick={() => setShowSettings(false)}
              >
                إلغاء
              </button>
              <button
                className="bg-primary text-on-primary font-bold text-xs px-4 py-2 rounded hover:opacity-90 transition-opacity"
                onClick={() => handleSaveSettings(settings)}
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Books Modal Dialog overlay */}
      {showManageBooks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-text text-right" dir="rtl">
          <div className="bg-[#111625] border border-outline-variant/30 rounded-2xl w-[500px] max-w-full p-6 flex flex-col gap-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary text-headline-md">تنظيم مكتبة التفسير</h3>
              <span className="material-symbols-outlined cursor-pointer text-on-surface-variant hover:text-primary" onClick={() => setShowManageBooks(false)}>close</span>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                اختر كتب التفسير التي ترغب في إظهارها في شريط التصفح الجانبي. يمكنك أيضاً حذف كتب التفسير المخصصة التي قمت بإضافتها:
              </p>

              <div className="overflow-y-auto max-h-[300px] border border-outline-variant/10 rounded-xl bg-surface-container-low/40 p-2 space-y-2 no-scrollbar">
                {booksList.map(book => {
                  const isVisible = visibleBookIds.includes(book.id);
                  const isDefault = ["7798", "18102", "42", "23606", "12884"].includes(book.id);
                  
                  return (
                    <div
                      key={book.id}
                      className="flex items-center justify-between p-3 bg-[#181f34]/40 hover:bg-[#181f34]/80 rounded-lg border border-outline-variant/5 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`visible-checkbox-${book.id}`}
                          className="w-4 h-4 accent-primary rounded cursor-pointer"
                          checked={isVisible}
                          onChange={() => handleToggleBookVisibility(book.id)}
                        />
                        <label
                          htmlFor={`visible-checkbox-${book.id}`}
                          className="font-quran-text text-sm cursor-pointer select-none text-on-surface hover:text-primary transition-colors text-right"
                        >
                          {book.title}
                        </label>
                      </div>

                      {!isDefault && (
                        <button
                          onClick={() => handleDeleteCustomBook(book.id, book.title)}
                          title="حذف الكتاب نهائياً من التطبيق"
                          className="p-1 text-on-surface-variant hover:text-error hover:bg-surface-container-highest rounded transition-all cursor-pointer flex-shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm font-bold">delete</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-outline-variant/20 pt-4 mt-2">
              <button
                className="bg-primary text-on-primary font-bold text-xs px-6 py-2.5 rounded hover:opacity-90 transition-opacity"
                onClick={() => setShowManageBooks(false)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
