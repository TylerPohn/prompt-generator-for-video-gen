import { Link, useLocation } from 'react-router-dom';
import { ENABLE_VIDEO_GEN } from '../services/config';

interface NavLink {
  path: string;
  label: string;
}

const navLinks: NavLink[] = [
  ...(ENABLE_VIDEO_GEN ? [{ path: '/', label: 'Video Lab' }] : []),
  { path: '/browser', label: 'Library' },
];

export function Navbar() {
  const location = useLocation();

  // Public mode: show branded header instead of navigation
  if (!ENABLE_VIDEO_GEN) {
    return (
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center">
          <h1 className="text-2xl font-bold text-white">AI Generated Hentai</h1>
          <p className="text-gray-400 mt-1">New vids generated every few minutes, 24/7</p>
        </div>
      </header>
    );
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <span className="text-xl font-bold text-white">Video Prompt Lab</span>
            <div className="flex space-x-4">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
