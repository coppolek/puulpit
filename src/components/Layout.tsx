import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PenSquare, LogOut, LogIn, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { user, isAdmin, signInWithGoogle, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col font-sans">
      <header className="h-20 border-b border-black flex items-center justify-between px-6 sm:px-10 shrink-0 bg-brand-bg relative z-20">
        <Link to="/" className="flex items-center gap-4 group">
          <div className="w-10 h-10 bg-black flex items-center justify-center text-white font-black text-xl group-hover:bg-brand-text transition-colors">P</div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tighter uppercase">puulp.it</h1>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden sm:flex items-center gap-10 text-[11px] font-bold uppercase tracking-[0.2em]">
          <Link to="/" className="border-b-2 border-transparent hover:border-black pb-1 transition-all">Home</Link>
          {isAdmin && (
            <Link to="/admin" className="border-b-2 border-transparent hover:border-black pb-1 transition-all">
              Dashboard
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-3 bg-black text-white px-4 py-2 rounded-full group hover:bg-gray-800 transition-colors cursor-pointer" onClick={logout}>
              <span className="text-[9px]">{user.email?.split('@')[0] || 'User'}</span>
              <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                 <LogOut size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ) : (
            <button onClick={signInWithGoogle} className="flex items-center gap-3 bg-black text-white px-4 py-2 rounded-full group hover:bg-gray-800 transition-colors">
              <span className="text-[9px]">Sign In</span>
            </button>
          )}
        </nav>

        {/* Mobile menu button */}
        <div className="flex sm:hidden items-center">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-black hover:opacity-70 focus:outline-none">
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="absolute top-20 left-0 w-full bg-brand-bg border-b border-black p-6 space-y-4 shadow-2xl z-50">
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="block text-sm font-black uppercase tracking-widest hover:pl-2 transition-all">Home</Link>
            {isAdmin && (
               <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block text-sm font-black uppercase tracking-widest hover:pl-2 transition-all">Dashboard</Link>
            )}
            {user ? (
              <button 
                onClick={() => { logout(); setIsMenuOpen(false); }} 
                className="block text-sm font-black uppercase tracking-widest hover:pl-2 transition-all w-full text-left"
              >
                Logout
              </button>
            ) : (
              <button 
                onClick={() => { signInWithGoogle(); setIsMenuOpen(false); }} 
                className="w-full bg-black text-white py-4 font-black uppercase text-xs tracking-[0.3em] hover:bg-gray-800"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex-grow flex flex-col w-full overflow-x-hidden">
        <Outlet />
      </main>

      <footer className="border-t border-black bg-brand-bg py-8">
        <div className="px-6 sm:px-10 text-center text-[10px] uppercase font-bold tracking-[0.2em] opacity-40 hover:opacity-100 transition-opacity">
          &copy; {new Date().getFullYear()} puulp.it. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
