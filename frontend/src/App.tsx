import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components';
import { VideoLabPage, S3BrowserPage } from './pages';

function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <Routes>
        <Route path="/" element={<VideoLabPage />} />
        <Route path="/browser" element={<S3BrowserPage />} />
      </Routes>
    </div>
  );
}

export default App;
