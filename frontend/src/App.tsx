import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components';
import { VideoLabPage, S3BrowserPage } from './pages';
import { ENABLE_VIDEO_GEN } from './services/config';

function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <Routes>
        {ENABLE_VIDEO_GEN ? (
          <Route path="/" element={<VideoLabPage />} />
        ) : (
          <Route path="/" element={<Navigate to="/browser" replace />} />
        )}
        <Route path="/browser" element={<S3BrowserPage />} />
      </Routes>
    </div>
  );
}

export default App;
