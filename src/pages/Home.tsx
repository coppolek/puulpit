import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

interface Post {
  id: string;
  title: string;
  content: string;
  type: 'review' | 'tutorial';
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q).catch(e => handleFirestoreError(e, OperationType.LIST, 'posts'));
        const fetchedPosts: Post[] = [];
        querySnapshot.forEach((doc) => {
          fetchedPosts.push({ id: doc.id, ...doc.data() } as Post);
        });
        setPosts(fetchedPosts);
      } catch (error) {
        console.error('Error fetching posts:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 sm:px-10 py-12 sm:py-24 w-full">
      <Helmet>
        <title>Latest Insights - puulp.it</title>
        <meta name="description" content="Discover AI-generated reviews and developer tutorials tailored for tech enthusiasts." />
        <meta name="keywords" content="AI, Technology, Blog, Reviews, Tutorials, Tech Enthusiasts, Mobile Development, Web Development" />
      </Helmet>

      <div className="mb-16">
        <h1 className="text-[60px] sm:text-[100px] leading-[0.85] font-black tracking-tighter mb-8 uppercase">
          Latest<br/>Insights.
        </h1>
        <p className="font-serif text-2xl italic text-gray-500 max-w-md">Discover AI-generated reviews and developer tutorials tailored for tech enthusiasts.</p>
      </div>

      {posts.length === 0 ? (
        <div className="border border-black p-12 text-center bg-white relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-black"></div>
          <p className="font-serif italic text-gray-500 text-lg">No posts yet. Check back soon!</p>
        </div>
      ) : (
        <div className="grid gap-16 md:grid-cols-2 lg:grid-cols-2">
          {posts.map((post) => (
            <Link key={post.id} to={`/posts/${post.id}`} className="group flex flex-col pt-8 border-t border-black bg-transparent">
              <div className="flex-grow flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-3 py-1">
                    {post.type}
                  </span>
                  <div className="flex items-center text-[10px] font-bold uppercase tracking-widest opacity-40">
                    <Clock size={12} className="mr-1" />
                    {((post.createdAt as any)?.toDate ? (post.createdAt as any).toDate() : new Date(post.createdAt)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                
                <h2 className="text-4xl font-black leading-none tracking-tighter mb-6 group-hover:opacity-70 transition-opacity line-clamp-2">
                  {post.title}
                </h2>
                
                {(() => {
                  const imgMatch = post.content.match(/!\[.*?\]\((.*?)\)/);
                  const imgSrc = imgMatch ? imgMatch[1] : null;
                  if (imgSrc) {
                    return (
                      <div className="w-full h-48 sm:h-64 mb-6 border-2 border-black overflow-hidden relative">
                        <img src={imgSrc} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    );
                  }
                  return null;
                })()}

                <p className="font-serif text-lg italic text-gray-600 line-clamp-3 mb-8">
                  {/* Strip markdown basically or just show first chars */}
                  {post.content.substring(0, 150).replace(/[#*_>]/g, '')}...
                </p>
                
                <div className="mt-auto text-[10px] font-black uppercase tracking-[0.3em] group-hover:pl-2 transition-all">
                  Read more &rarr;
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
