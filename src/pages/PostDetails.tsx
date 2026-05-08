import React, { useEffect, useState, FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import Markdown from 'react-markdown';
import { ArrowLeft, Clock, Twitter, Facebook, Linkedin, Share2, Check, X, Loader2, ImageOff } from 'lucide-react';
import AdBanner from '../components/AdBanner';

interface Post {
  id: string;
  title: string;
  content: string;
  type: 'review' | 'tutorial';
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorEmail: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

const MarkdownImage: React.FC<any> = ({ src, alt, ...props }) => {
  const [error, setError] = useState(false);

  const getDescriptiveAltText = (imgSrc?: string, imgAlt?: string) => {
    // 1. Prioritize descriptive alt text
    if (
      imgAlt && 
      imgAlt.trim() !== '' && 
      imgAlt.toLowerCase() !== 'image' && 
      !imgAlt.match(/\.(png|jpg|jpeg|gif|webp)$/i)
    ) {
      return imgAlt.trim();
    }

    // 2. Pollinations AI generated image prompts
    if (imgSrc?.includes('pollinations.ai/prompt/')) {
      try {
        const promptPart = imgSrc.split('pollinations.ai/prompt/')[1].split('?')[0];
        const decoded = decodeURIComponent(promptPart).replace(/[-_]/g, ' ').trim();
        if (decoded) return decoded;
      } catch (e) {
        // Ignore
      }
    }

    // 3. Fallback to extracting information from the filename in Firebase Storage URL
    if (imgSrc?.includes('firebasestorage.googleapis.com')) {
      try {
        const pathMatch = imgSrc.match(/o\/(.*?)\?/);
        if (pathMatch) {
            const decodedPath = decodeURIComponent(pathMatch[1]);
            const filename = decodedPath.split('/').pop() || '';
            const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
            
            // Clean up common generated patterns: timestamps, UUIDs, or random tails
            const cleanName = nameWithoutExt
              .replace(/^\d{10,}-/, '') // Remove leading timestamp (e.g. 1679000000000-)
              .replace(/-[a-zA-Z0-9]{5,12}$/, '') // Remove trailing random string
              .replace(/[-_]/g, ' ') // Replace remaining dashes/underscores with spaces
              .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
              .trim()
              .toLowerCase();
            
            if (cleanName && cleanName.length > 2) {
              return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            }
        }
      } catch (e) {
        // Ignore
      }
    }
    
    // 4. Try parsing the alt text if it was just a filename
    if (imgAlt && imgAlt.trim() !== '') {
        const nameWithoutExt = imgAlt.replace(/\.[^/.]+$/, "");
        const cleanName = nameWithoutExt.replace(/[-_]/g, ' ').trim().toLowerCase();
        if (cleanName && cleanName.length > 2) {
             return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        }
    }

    return "Blog post illustration";
  };
  
  const descriptiveAlt = getDescriptiveAltText(src, alt);

  return (
    <figure className="my-10 flex flex-col items-center border-[8px] border-black p-2 bg-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]">
      {error ? (
        <div className="w-full h-48 md:h-64 flex flex-col items-center justify-center bg-gray-100 text-gray-400 border-2 border-dashed border-gray-300 m-0">
          <ImageOff size={48} className="mb-4 text-gray-300" />
          <span className="font-mono text-sm uppercase tracking-wider font-bold">Image unavailable</span>
          {alt && alt !== 'image' && <span className="mt-2 text-xs opacity-70 px-4 text-center">{alt}</span>}
        </div>
      ) : (
        <img 
          src={src} 
          alt={descriptiveAlt} 
          {...props} 
          onError={() => setError(true)}
          className="w-full h-auto object-cover m-0" 
        />
      )}
      {alt && alt !== 'image' && !alt.match(/\.(png|jpg|jpeg|gif|webp)$/i) && (
        <figcaption className="mt-4 font-serif text-lg italic text-gray-500 text-center px-4 mb-2">
          {alt}
        </figcaption>
      )}
    </figure>
  );
};

export default function PostDetails() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    async function fetchData() {
      if (!id) return;
      try {
        const docRef = doc(db, 'posts', id);
        const docSnap = await getDoc(docRef).catch(e => handleFirestoreError(e, OperationType.GET, `posts/${id}`));
        if (docSnap.exists()) {
          const postData = { id: docSnap.id, ...docSnap.data() } as Post;
          setPost(postData);
          
          // Fetch Related Posts
          const relatedQ = query(
            collection(db, 'posts'),
            where('type', '==', postData.type),
            orderBy('createdAt', 'desc'),
            limit(4)
          );
          try {
            const relatedSnap = await getDocs(relatedQ);
            const rPosts: Post[] = [];
            relatedSnap.forEach(d => {
              if (d.id !== id && rPosts.length < 3) {
                rPosts.push({ id: d.id, ...d.data() } as Post);
              }
            });
            setRelatedPosts(rPosts);
          } catch (e) {
            console.error('Error fetching related posts:', e);
          }
          
          // Fetch Comments
          let allCommentsMap = new Map<string, Comment>();
          
          if (isAdmin) {
            // Admins can fetch all comments for this post
            const commentsQ = query(collection(db, 'comments'), where('postId', '==', id));
            const commentsSnap = await getDocs(commentsQ).catch(e => handleFirestoreError(e, OperationType.GET, `comments`));
            commentsSnap.forEach(d => {
              allCommentsMap.set(d.id, { id: d.id, ...d.data() } as Comment);
            });
          } else {
            // Regular users: Fetch approved comments
            const approvedQ = query(collection(db, 'comments'), where('postId', '==', id), where('status', '==', 'approved'));
            const approvedSnap = await getDocs(approvedQ).catch(e => handleFirestoreError(e, OperationType.GET, `comments`));
            approvedSnap.forEach(d => {
              allCommentsMap.set(d.id, { id: d.id, ...d.data() } as Comment);
            });
            
            // If logged in, also fetch own comments
            if (user) {
              const myCommentsQ = query(collection(db, 'comments'), where('postId', '==', id), where('authorId', '==', user.uid));
              const myCommentsSnap = await getDocs(myCommentsQ).catch(e => handleFirestoreError(e, OperationType.GET, `comments`));
              myCommentsSnap.forEach(d => {
                allCommentsMap.set(d.id, { id: d.id, ...d.data() } as Comment);
              });
            }
          }
          
          const sortedComments = Array.from(allCommentsMap.values()).sort((a, b) => {
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return timeB - timeA; // Descending order
          });
          
          setComments(sortedComments);
        } else {
          setPost(null);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, user, isAdmin]);

  const handleSubmitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !id) return;
    
    setIsSubmitting(true);
    try {
      const commentData = {
        postId: id,
        authorId: user.uid,
        authorEmail: user.email,
        content: newComment.trim(),
        status: isAdmin ? 'approved' : 'pending',
        createdAt: serverTimestamp()
      };
      
      const res = await addDoc(collection(db, 'comments'), commentData).catch(err => handleFirestoreError(err, OperationType.CREATE, 'comments'));
      
      // Optimistically add
      setComments(prev => [{
        id: res!.id,
        ...commentData,
        createdAt: { toDate: () => new Date() }
      } as Comment, ...prev]);
      
      setNewComment('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (commentId: string, newStatus: 'approved' | 'rejected') => {
    if (!isAdmin) return;
    try {
      const commentRef = doc(db, 'comments', commentId);
      await updateDoc(commentRef, { status: newStatus }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `comments/${commentId}`));
      
      setComments(prev => prev.map(c => 
        c.id === commentId ? { ...c, status: newStatus } : c
      ));
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h2>
        <Link to="/" className="text-blue-600 hover:underline">Return to Home</Link>
      </div>
    );
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <article className="max-w-5xl mx-auto w-full px-6 py-12 md:py-24">
      <Link to="/" className="inline-flex items-center text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-50 transition-opacity mb-16">
        <ArrowLeft size={16} className="mr-4" />
        Back
      </Link>
      
      <header className="mb-16 border-b border-black pb-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-3 py-1">
              {post.type}
            </span>
            <div className="flex items-center text-[10px] font-bold uppercase tracking-widest opacity-40">
              <time dateTime={((post.createdAt as any)?.toDate ? (post.createdAt as any).toDate() : new Date(post.createdAt)).toISOString()}>
                {((post.createdAt as any)?.toDate ? (post.createdAt as any).toDate() : new Date(post.createdAt)).toLocaleDateString(undefined, { 
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                })}
              </time>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center">
              <Share2 size={12} className="mr-2" /> Share
            </span>
            <a 
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center border-2 border-black hover:bg-black hover:text-white transition-colors"
            >
              <Twitter size={14} />
            </a>
            <a 
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center border-2 border-black hover:bg-black hover:text-white transition-colors"
            >
              <Facebook size={14} />
            </a>
            <a 
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center border-2 border-black hover:bg-black hover:text-white transition-colors"
            >
              <Linkedin size={14} />
            </a>
          </div>
        </div>
        
        <h1 className="text-[50px] md:text-[80px] font-black tracking-tighter leading-[0.9] uppercase break-words">
          {post.title}
        </h1>
      </header>
      
      <AdBanner />

      <div className="prose prose-lg prose-slate prose-headings:font-sans prose-headings:font-black prose-headings:tracking-tighter prose-headings:uppercase prose-a:font-bold prose-h1:text-[50px] prose-h2:text-[40px] prose-h3:text-[30px] prose-p:font-serif prose-p:text-xl prose-p:leading-relaxed max-w-none prose-li:font-serif prose-li:text-xl">
        <Markdown 
          components={{
            p: ({node, children, ...props}) => {
              if (node?.children?.length === 1 && (node.children[0] as any).tagName === 'img') {
                return <>{children}</>;
              }
              return <p {...props}>{children}</p>;
            },
            img: ({node, src, alt, ...props}) => <MarkdownImage src={src} alt={alt} {...props} />
          }}
        >
          {post.content}
        </Markdown>
      </div>

      {relatedPosts.length > 0 && (
        <div className="mt-24 border-t-[8px] border-black pt-16">
          <h2 className="text-[40px] font-black uppercase tracking-tighter mb-8">Related {post.type}s</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {relatedPosts.map((relatedPost) => (
              <Link 
                key={relatedPost.id} 
                to={`/post/${relatedPost.id}`}
                className="group border-[4px] border-black p-6 bg-white hover:bg-black hover:text-white transition-colors duration-300 flex flex-col h-full"
              >
                <div className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 group-hover:opacity-80">
                  {((relatedPost.createdAt as any)?.toDate ? (relatedPost.createdAt as any).toDate() : new Date(relatedPost.createdAt)).toLocaleDateString(undefined, { 
                    month: 'short', day: 'numeric', year: 'numeric' 
                  })}
                </div>
                <h3 className="font-black text-xl uppercase tracking-tight mb-4 flex-grow line-clamp-3">
                  {relatedPost.title}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-24 border-t-[8px] border-black pt-16">
        <h2 className="text-[40px] font-black uppercase tracking-tighter mb-8">Discussion</h2>
        
        {user ? (
          <form onSubmit={handleSubmitComment} className="mb-16">
            <div className="flex flex-col gap-4">
              <label htmlFor="comment" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Leave a comment</label>
              <textarea
                id="comment"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your thoughts..."
                className="w-full p-6 border-2 border-black font-serif text-lg focus:outline-none resize-y min-h-[120px] bg-transparent"
                required
              />
              <button
                type="submit"
                disabled={isSubmitting || !newComment.trim()}
                className="self-end px-8 py-4 border-2 border-black font-black uppercase text-xs tracking-[0.3em] bg-black text-white hover:bg-transparent hover:text-black transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin mr-3" /> : null}
                Post Comment
              </button>
            </div>
          </form>
        ) : (
          <div className="mb-16 p-8 border-2 border-black border-dashed flex flex-col items-center text-center">
            <p className="font-serif italic text-xl mb-4 text-gray-600">Join the discussion</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Please sign in to leave a comment.</p>
          </div>
        )}

        <div className="space-y-8">
          {comments.map((comment) => (
            <div key={comment.id} className={`p-6 border-2 border-black ${comment.status === 'pending' ? 'bg-yellow-50' : comment.status === 'rejected' ? 'bg-red-50 opacity-50' : 'bg-white'}`}>
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-4">
                <div>
                  <div className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    {comment.authorEmail.split('@')[0]}
                    {comment.status === 'pending' && <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 text-[10px]">Pending Approval</span>}
                    {comment.status === 'rejected' && <span className="px-2 py-0.5 bg-red-200 text-red-800 text-[10px]">Rejected</span>}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">
                    {((comment.createdAt as any)?.toDate ? (comment.createdAt as any).toDate() : new Date()).toLocaleDateString(undefined, { 
                      month: 'short', day: 'numeric', year: 'numeric' 
                    })}
                  </div>
                </div>
                
                {isAdmin && (
                  <div className="flex gap-2">
                    {comment.status !== 'approved' && (
                      <button onClick={() => handleUpdateStatus(comment.id, 'approved')} className="p-2 border-2 border-black hover:bg-black hover:text-white transition-colors" title="Approve">
                        <Check size={14} />
                      </button>
                    )}
                    {comment.status !== 'rejected' && (
                      <button onClick={() => handleUpdateStatus(comment.id, 'rejected')} className="p-2 border-2 border-black hover:bg-black hover:text-white transition-colors" title="Reject">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="font-serif text-lg leading-relaxed whitespace-pre-wrap">{comment.content}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-gray-500 font-serif italic">No comments yet. Be the first to start the discussion!</p>
          )}
        </div>
      </div>
    </article>
  );
}
