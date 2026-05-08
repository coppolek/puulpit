import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { collection, doc, setDoc, serverTimestamp, query, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { GoogleGenAI } from '@google/genai';
import { Wand2, Loader2, Save, Type, FileText, Image as ImageIcon, Search, Trash2, ExternalLink } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  content: string;
  type: 'review' | 'tutorial';
  categoryId?: string;
  authorId: string;
  createdAt: any;
  updatedAt: any;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: any;
}

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'categories' | 'import'>('manage');
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [prompt, setPrompt] = useState('');
  const [postType, setPostType] = useState<'review' | 'tutorial'>('tutorial');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Category Form State
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Import Form State
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      if (activeTab === 'manage') {
        fetchPosts();
      } else if (activeTab === 'categories') {
        fetchCategories();
      } else if (activeTab === 'create') {
        fetchCategories();
      }
    }
  }, [isAdmin, activeTab]);

  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const q = query(collection(db, 'categories'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q).catch(e => handleFirestoreError(e, OperationType.LIST, 'categories'));
      const fetchedCategories: Category[] = [];
      snapshot.forEach(doc => {
        fetchedCategories.push({ id: doc.id, ...doc.data() } as Category);
      });
      setCategories(fetchedCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    setIsSavingCategory(true);
    setError('');

    try {
      const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const newCategoryRef = doc(collection(db, 'categories'));
      await setDoc(newCategoryRef, {
        name: categoryName,
        slug,
        description: categoryDescription,
        createdAt: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'categories'));

      setCategoryName('');
      setCategoryDescription('');
      fetchCategories(); // Refresh the list
    } catch (err: any) {
      console.error('Error saving category:', err);
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteDoc(doc(db, 'categories', categoryId)).catch(e => handleFirestoreError(e, OperationType.DELETE, `categories/${categoryId}`));
      setCategories(categories.filter(c => c.id !== categoryId));
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category.');
    }
  };

  const fetchPosts = async () => {
    setIsLoadingPosts(true);
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q).catch(e => handleFirestoreError(e, OperationType.LIST, 'posts'));
      const fetchedPosts: Post[] = [];
      snapshot.forEach(doc => {
        fetchedPosts.push({ id: doc.id, ...doc.data() } as Post);
      });
      setPosts(fetchedPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    
    try {
      await deleteDoc(doc(db, 'posts', postId)).catch(e => handleFirestoreError(e, OperationType.DELETE, `posts/${postId}`));
      setPosts(posts.filter(p => p.id !== postId));
    } catch (err) {
      console.error('Error deleting post:', err);
      alert('Failed to delete post.');
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
        <p className="text-gray-600 mb-6">You need administrator privileges to view this page.</p>
        <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">Return to Home</button>
      </div>
    );
  }

  const generateAltTextFromFilename = (filename: string) => {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    return nameWithoutExt.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim() || 'Blog post image';
  };

  const validateImage = (file: File): string | null => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (!file.type.startsWith('image/')) {
       return 'File is not an image.';
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 5MB limit.';
    }
    return null;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImage(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const caption = window.prompt("Enter a caption for this image (optional):");

    setIsUploading(true);
    setError('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `images/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storageRef = ref(storage, fileName);

      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const altText = caption || generateAltTextFromFilename(file.name);
      const imageMarkdown = `\n![${altText}](${downloadURL})\n`;
      
      const textarea = textareaRef.current;
      if (textarea) {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        
        if (startPos !== undefined && endPos !== undefined) {
          setGeneratedContent(prev => 
            prev.substring(0, startPos) + 
            imageMarkdown + 
            prev.substring(endPos)
          );
        } else {
          setGeneratedContent(prev => prev + imageMarkdown);
        }
      } else {
        setGeneratedContent(prev => prev + imageMarkdown);
      }
      
    } catch (err: any) {
      console.error('Image upload failed:', err);
      // Wait, is there a rules issue with storage? Let's generic handle error.
      setError(err instanceof Error ? err.message : 'Failed to upload image. Please check Firebase Storage rules.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    
    setIsImporting(true);
    setError('');
    
    try {
      // 1. Fetch content from URL using our backend proxy
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch content');
      
      const htmlContent = data.htmlContent;
      if (!htmlContent) throw new Error('Failed to retrieve content from the provided URL.');
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const textContent = doc.body.textContent || '';
      
      if (!textContent.trim()) throw new Error('No text content found on the page.');

      // @ts-ignore
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API Key is missing. Check your environment configuration.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = "You are an expert technical writer and editor. You are given the text content scraped from a webpage. Rewrite and elaborate this content into a highly engaging, structured, and professional article (in Markdown). Avoid hallucinations; stick to the core facts of the provided content but present it much better. Start with a catchy title in the very first line format '# Title', then two newlines, then the article body. Include at least 2 relevant placeholder images in your markdown using the URL format `![alt text](https://image.pollinations.ai/prompt/{detailed-image-prompt}?width=1200&height=600&nologo=true)` where {detailed-image-prompt} is a URL-encoded descriptive prompt.";

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Scraped content:\n\n${textContent.substring(0, 30000)}`, // limit text length
        config: { systemInstruction }
      });
      
      const text = aiResponse.text || '';
      const lines = text.split('\n');
      let extractedTitle = 'Untitled Imported Post';
      let extractedContent = text;
      
      if (lines[0].startsWith('# ')) {
        extractedTitle = lines[0].replace('# ', '').trim();
        extractedContent = lines.slice(1).join('\n').trim();
      }
      
      setGeneratedTitle(extractedTitle);
      setGeneratedContent(extractedContent);
      setPrompt(`Imported from: ${importUrl}`); // put url in prompt just for reference
      setPostType('tutorial'); // default to tutorial or we can let them change it before saving
      setActiveTab('create'); // Redirect to create tab to finish editing and saving
    } catch (err: any) {
      console.error('Import Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to import and elaborate content.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError('');
    
    try {
      // @ts-ignore
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API Key is missing. Check your environment configuration.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = postType === 'tutorial' 
        ? "You are an expert developer and technical writer. Write a comprehensive, step-by-step tutorial based on the user's prompt. Use markdown. Start with a catchy title in the very first line format '# Title', then two newlines, then the tutorial content. ALWAYS include at least 2 relevant placeholder images in your markdown using the URL format `![alt text](https://image.pollinations.ai/prompt/{detailed-image-prompt}?width=1200&height=600&nologo=true)` where {detailed-image-prompt} is a URL-encoded descriptive prompt for the image."
        : "You are an expert tech reviewer. Write a detailed, engaging review of the product/topic based on the user's prompt. Use markdown. Start with a catchy title in the very first line format '# Title', then two newlines, then the review content. ALWAYS include at least 2 relevant placeholder images in your markdown using the URL format `![alt text](https://image.pollinations.ai/prompt/{detailed-image-prompt}?width=1200&height=600&nologo=true)` where {detailed-image-prompt} is a URL-encoded descriptive prompt for the image.";

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: { systemInstruction }
      });
      
      const text = response.text || '';
      // Extract title and content
      const lines = text.split('\n');
      let extractedTitle = 'Untitled Post';
      let extractedContent = text;
      
      if (lines[0].startsWith('# ')) {
        extractedTitle = lines[0].replace('# ', '').trim();
        extractedContent = lines.slice(1).join('\n').trim();
      }
      
      setGeneratedTitle(extractedTitle);
      setGeneratedContent(extractedContent);
    } catch (err: any) {
      console.error('AI Generation Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate content using AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestTitle = async () => {
    if (!generatedContent.trim()) {
      alert('Please generate or write some content first to get title suggestions.');
      return;
    }
    
    setIsSuggestingTitle(true);
    setError('');
    
    try {
      // @ts-ignore
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API Key is missing. Check your environment configuration.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const promptText = `Based on the following content, suggest 1 single catchy, engaging, and concise title for it. Do not include quotes or formatting, just the plain text title itself.\n\nContent:\n${generatedContent.substring(0, 5000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: promptText,
      });
      
      if (response.text) {
        setGeneratedTitle(response.text.trim().replace(/^["']|["']$/g, ''));
      }
    } catch (err: any) {
      console.error('Title Suggestion Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to suggest title using AI.');
    } finally {
      setIsSuggestingTitle(false);
    }
  };

  const handleSave = async () => {
    if (!generatedTitle.trim() || !generatedContent.trim()) return;
    
    setIsSaving(true);
    setError('');
    
    try {
      const newPostRef = doc(collection(db, 'posts'));
      await setDoc(newPostRef, {
        title: generatedTitle,
        content: generatedContent,
        type: postType,
        categoryId: selectedCategoryId || null,
        authorId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `posts/${newPostRef.id}`));
      
      navigate(`/posts/${newPostRef.id}`);
    } catch (err: any) {
      console.error('Save failed:', err);
      setError('Failed to save the post to the database.');
      setIsSaving(false);
    }
  };

  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-12 md:py-24">
      <div className="mb-12">
        <h1 className="text-[50px] sm:text-[80px] leading-[0.85] font-black tracking-tighter mb-4 uppercase">
          AI<br/>CRAFT.
        </h1>
        <p className="font-serif text-2xl italic text-gray-500 max-w-md">Admin dashboard to create and manage technical reviews and tutorials.</p>
      </div>

      <div className="flex gap-4 mb-16 border-b-2 border-black pb-4">
        <button
          onClick={() => setActiveTab('create')}
          className={`font-black uppercase text-xs tracking-[0.3em] transition-all px-4 py-2 ${
            activeTab === 'create' ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-gray-200'
          }`}
        >
          Create Post
        </button>
        <button
          onClick={() => setActiveTab('manage')}
          className={`font-black uppercase text-xs tracking-[0.3em] transition-all px-4 py-2 ${
            activeTab === 'manage' ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-gray-200'
          }`}
        >
          Manage Posts
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`font-black uppercase text-xs tracking-[0.3em] transition-all px-4 py-2 ${
            activeTab === 'categories' ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-gray-200'
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`font-black uppercase text-xs tracking-[0.3em] transition-all px-4 py-2 ${
            activeTab === 'import' ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-gray-200'
          }`}
        >
          Import
        </button>
      </div>

      {activeTab === 'manage' ? (
        <div className="space-y-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search posts by title or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 border-2 border-black font-sans text-lg focus:outline-none"
            />
          </div>

          {isLoadingPosts ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-black" size={32} />
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="border border-black p-12 text-center bg-white relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-black"></div>
              <p className="font-serif italic text-gray-500 text-lg">No posts found matching your search.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredPosts.map(post => (
                <div key={post.id} className="border-2 border-black bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-shadow">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-2 py-1">
                        {post.type}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                         {((post.createdAt as any)?.toDate ? (post.createdAt as any).toDate() : new Date(post.createdAt || Date.now())).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="font-black text-2xl uppercase tracking-tighter line-clamp-1">{post.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      to={`/posts/${post.id}`}
                      className="w-10 h-10 flex items-center justify-center border-2 border-black hover:bg-black hover:text-white transition-colors"
                      title="View Post"
                    >
                      <ExternalLink size={18} />
                    </Link>
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="w-10 h-10 flex items-center justify-center border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                      title="Delete Post"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'categories' ? (
        <div className="space-y-16">
          <div className="bg-transparent border-none">
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-8 border-b-2 border-black pb-4">Create New Category</h2>
            <form onSubmit={handleSaveCategory} className="space-y-6">
              {error && (
                <div className="border-l-4 border-red-500 bg-white p-4">
                  <p className="font-bold text-red-700 uppercase tracking-widest text-[10px]">{error}</p>
                </div>
              )}
              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Category Name</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. React, Web Development"
                  className="w-full bg-white border-2 border-black p-4 font-sans text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:translate-y-[2px] focus:translate-x-[2px] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                  required
                />
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Description (optional)</label>
                <textarea
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="A short description of this category..."
                  className="w-full bg-white border-2 border-black p-4 font-sans text-lg focus:outline-none"
                  rows={3}
                />
              </div>
              <button
                type="submit"
                disabled={isSavingCategory}
                className="bg-black text-white px-8 py-4 font-black uppercase tracking-[0.2em] text-xs hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {isSavingCategory ? 'Saving...' : 'Add Category'}
              </button>
            </form>
          </div>

          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-8 border-b-2 border-black pb-4">Manage Categories</h2>
            {isLoadingCategories ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-black" size={32} />
              </div>
            ) : categories.length === 0 ? (
              <div className="border border-black p-12 text-center bg-white relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-black"></div>
                <p className="font-serif italic text-gray-500 text-lg">No categories created yet.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {categories.map(category => (
                  <div key={category.id} className="border-2 border-black bg-white p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-xl uppercase tracking-tighter">{category.name}</h3>
                      <p className="text-sm font-sans text-gray-500">/{category.slug}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteCategory(category.id)}
                      className="w-10 h-10 flex items-center justify-center border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'import' ? (
        <div className="bg-transparent border-none">
          <h2 className="text-3xl font-black uppercase tracking-tighter mb-8 border-b-2 border-black pb-4">Import from URL</h2>
          <p className="font-serif text-xl mb-8 text-gray-600">Provide a URL, and AI will scrape the contents and generate a comprehensive article automatically.</p>
          <form onSubmit={handleImport} className="space-y-8">
            {error && (
              <div className="border-l-4 border-red-500 bg-white p-4">
                <p className="font-bold text-red-700 uppercase tracking-widest text-[10px]">{error}</p>
              </div>
            )}
            <div className="space-y-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Source URL</label>
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full bg-white border-2 border-black p-4 font-sans text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:translate-y-[2px] focus:translate-x-[2px] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isImporting}
              className="bg-black text-white px-8 py-4 font-black uppercase tracking-[0.2em] text-xs flex items-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <><Loader2 className="animate-spin" size={16} /> Scraping & Elaborating...</>
              ) : (
                <><Wand2 size={16} /> Import & Generate</>
              )}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="bg-transparent border-none mb-16">
            <form onSubmit={handleGenerate} className="space-y-12">
          {error && (
            <div className="border-l-4 border-red-500 bg-white p-4">
              <p className="font-bold text-red-700 uppercase tracking-widest text-[10px]">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Category (Optional)</label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full bg-white border-2 border-black p-4 font-sans text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:translate-y-[2px] focus:translate-x-[2px] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            >
              <option value="">-- No Category --</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Post Type</label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setPostType('tutorial')}
                className={`flex-1 py-4 font-black uppercase text-xs tracking-[0.3em] transition-all border-2 border-black ${
                  postType === 'tutorial' 
                  ? 'bg-black text-white' 
                  : 'bg-transparent text-black hover:bg-black hover:text-white'
                }`}
              >
                Tutorial
              </button>
              <button
                type="button"
                onClick={() => setPostType('review')}
                className={`flex-1 py-4 font-black uppercase text-xs tracking-[0.3em] transition-all border-2 border-black ${
                  postType === 'review' 
                  ? 'bg-black text-white' 
                  : 'bg-transparent text-black hover:bg-black hover:text-white'
                }`}
              >
                Review
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <label htmlFor="prompt" className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
              AI Prompt Engine
            </label>
            <textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Esempio: Scrivi un ${postType} su come configurare...`}
              className="w-full h-32 p-6 border-2 border-black bg-brand-input font-serif text-lg italic focus:outline-none resize-none"
              required
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="flex-1 bg-black text-white py-5 font-black uppercase text-xs tracking-[0.3em] hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center justify-center"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-3" />
                  Generating...
                </>
              ) : (
                <>Generate Draft</>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border-[8px] border-black p-8 sm:p-12 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.3)] fade-in duration-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 mb-12 pb-8 border-b border-gray-200">
            <h2 className="text-3xl font-black uppercase tracking-tighter">
              Draft Preview
            </h2>
            <button
              onClick={handleSave}
              disabled={isSaving || isUploading || !generatedTitle.trim() || !generatedContent.trim()}
              className="px-8 border-2 border-black py-4 font-black uppercase text-xs tracking-[0.3em] bg-black text-white hover:bg-transparent hover:text-black transition-all flex items-center justify-center disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin mr-3" />
              ) : null}
              {isSaving ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>
          
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Title</label>
                <button
                  type="button"
                  onClick={handleSuggestTitle}
                  disabled={isSuggestingTitle || !generatedContent.trim()}
                  className="flex items-center text-[10px] uppercase font-black tracking-widest text-gray-500 hover:text-black transition-colors disabled:opacity-50"
                >
                  {isSuggestingTitle ? <Loader2 size={12} className="animate-spin mr-2" /> : <Wand2 size={12} className="mr-2" />}
                  {isSuggestingTitle ? 'Suggesting...' : 'Suggest AI Title'}
                </button>
              </div>
              <input
                type="text"
                value={generatedTitle}
                onChange={(e) => setGeneratedTitle(e.target.value)}
                className="w-full p-6 border-2 border-black font-black text-2xl tracking-tighter uppercase focus:outline-none bg-transparent"
              />
            </div>
            <div className="space-y-4 relative">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Content (Markdown)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center text-[10px] uppercase font-black tracking-widest text-gray-500 hover:text-black transition-colors disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={12} className="animate-spin mr-2" /> : <ImageIcon size={12} className="mr-2" />}
                    {isUploading ? 'Uploading...' : 'Add Image'}
                  </button>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                rows={20}
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const validationError = validateImage(file);
                    if (validationError) {
                      setError(validationError);
                      return;
                    }
                    
                    const caption = window.prompt("Enter a caption for this image (optional):");
                    setIsUploading(true);
                    setError('');
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `images/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                      const storageRef = ref(storage, fileName);
                      await uploadBytes(storageRef, file);
                      const downloadURL = await getDownloadURL(storageRef);
                      const altText = caption || generateAltTextFromFilename(file.name);
                      const imageMarkdown = `\n![${altText}](${downloadURL})\n`;
                      
                      // Insert where cursor is or at end
                      const textarea = e.target as HTMLTextAreaElement;
                      const startPos = textarea.selectionStart;
                      const endPos = textarea.selectionEnd;
                      
                      if (startPos !== undefined && endPos !== undefined) {
                        setGeneratedContent(
                          generatedContent.substring(0, startPos) + 
                          imageMarkdown + 
                          generatedContent.substring(endPos)
                        );
                      } else {
                        setGeneratedContent(prev => prev + imageMarkdown);
                      }
                    } catch (err: any) {
                      console.error('Image upload failed:', err);
                      setError(err instanceof Error ? err.message : 'Failed to upload image. Please check Firebase Storage rules.');
                    } finally {
                      setIsUploading(false);
                    }
                  }
                }}
                className={`w-full p-6 border-2 font-serif text-lg leading-relaxed focus:outline-none resize-y transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-50' : 'border-black bg-transparent'
                }`}
                placeholder="Write your content in Markdown here. You can drag and drop images directly into this area."
              />
            </div>
          </div>
        </div>
      </>
      )}
    </div>
  );
}
