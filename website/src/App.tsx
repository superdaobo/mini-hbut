import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Releases from './pages/Releases';
import DocsLayout from './layouts/DocsLayout';
import Overview from './pages/docs/Overview';
import Guide from './pages/docs/Guide';
import Configuration from './pages/docs/Configuration';
import FAQ from './pages/docs/FAQ';
import Technical from './pages/docs/Technical';
import More from './pages/docs/More';
import RouteScrollManager from './components/RouteScrollManager';

function App() {
  return (
    <Router>
      <RouteScrollManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/releases" element={<Releases />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Overview />} />
          <Route path="guide" element={<Guide />} />
          <Route path="configuration" element={<Configuration />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="technical" element={<Technical />} />
          <Route path="more" element={<More />} />
          <Route path="*" element={<Navigate to="/docs" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
