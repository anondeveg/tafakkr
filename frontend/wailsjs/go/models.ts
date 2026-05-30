export namespace backend {
	
	export class BookMetadata {
	    id: string;
	    title: string;
	    author_name: string;
	    author_page: string;
	    publisher: string;
	    book_print: string;
	    volumes: number;
	    is_equal_to_print: boolean;
	    book_description: string;
	
	    static createFrom(source: any = {}) {
	        return new BookMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.author_name = source["author_name"];
	        this.author_page = source["author_page"];
	        this.publisher = source["publisher"];
	        this.book_print = source["book_print"];
	        this.volumes = source["volumes"];
	        this.is_equal_to_print = source["is_equal_to_print"];
	        this.book_description = source["book_description"];
	    }
	}
	export class Footnote {
	    number: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new Footnote(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.content = source["content"];
	    }
	}
	export class NoteWithVerses {
	    id: string;
	    title: string;
	    content: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	    bound_verses: number[][];
	
	    static createFrom(source: any = {}) {
	        return new NoteWithVerses(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	        this.bound_verses = source["bound_verses"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PageData {
	    book_id: string;
	    page_number: number;
	    part_number: string;
	    headings: string[];
	    paragraphs: string[];
	    footnotes: Footnote[];
	    citations: string[];
	    departments: Record<string, Array<string>>;
	
	    static createFrom(source: any = {}) {
	        return new PageData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.book_id = source["book_id"];
	        this.page_number = source["page_number"];
	        this.part_number = source["part_number"];
	        this.headings = source["headings"];
	        this.paragraphs = source["paragraphs"];
	        this.footnotes = this.convertValues(source["footnotes"], Footnote);
	        this.citations = source["citations"];
	        this.departments = source["departments"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Verse {
	    id: number;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new Verse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	    }
	}
	export class Surah {
	    id: number;
	    name: string;
	    transliteration: string;
	    type: string;
	    total_verses: number;
	    verses: Verse[];
	
	    static createFrom(source: any = {}) {
	        return new Surah(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.transliteration = source["transliteration"];
	        this.type = source["type"];
	        this.total_verses = source["total_verses"];
	        this.verses = this.convertValues(source["verses"], Verse);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

