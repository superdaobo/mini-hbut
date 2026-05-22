import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Releases from './pages/Releases';
import Search from './pages/Search';
import DocsLayout from './layouts/DocsLayout';
import Overview from './pages/docs/Overview';
import Guide from './pages/docs/Guide';
import Configuration from './pages/docs/Configuration';
import FAQ from './pages/docs/FAQ';
import Technical from './pages/docs/Technical';
import More from './pages/docs/More';
import QuickStart from './pages/docs/QuickStart';
import UserGuide from './pages/docs/UserGuide';
import AcademicServices from './pages/docs/AcademicServices';
import CampusLife from './pages/docs/CampusLife';
import CommunityNotifications from './pages/docs/CommunityNotifications';
import Extensions from './pages/docs/Extensions';
import SettingsData from './pages/docs/SettingsData';
import Troubleshooting from './pages/docs/Troubleshooting';
import DeveloperOverview from './pages/docs/DeveloperOverview';
import ArchitectureDataFlow from './pages/docs/ArchitectureDataFlow';
import PlatformTauri from './pages/docs/PlatformTauri';
import ModuleSystem from './pages/docs/ModuleSystem';
import BuildRelease from './pages/docs/BuildRelease';
import SecurityPrivacy from './pages/docs/SecurityPrivacy';
import ReferenceIndex from './pages/docs/ReferenceIndex';
import TauriApi from './pages/docs/TauriApi';
import DevRules from './pages/docs/DevRules';
import Nonebot from './pages/docs/Nonebot';
import Implementation from './pages/docs/Implementation';
import RouteScrollManager from './components/RouteScrollManager';

function App() {
  return (
    <Router>
      <RouteScrollManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/releases" element={<Releases />} />
        <Route path="/search" element={<Search />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Overview />} />
          <Route path="guide" element={<Guide />} />
          <Route path="configuration" element={<Configuration />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="technical" element={<Technical />} />
          <Route path="more" element={<More />} />
          <Route path="quick-start" element={<QuickStart />} />
          <Route path="user-guide" element={<UserGuide />} />
          <Route path="academic" element={<AcademicServices />} />
          <Route path="campus-life" element={<CampusLife />} />
          <Route path="community-notifications" element={<CommunityNotifications />} />
          <Route path="extensions" element={<Extensions />} />
          <Route path="settings-data" element={<SettingsData />} />
          <Route path="troubleshooting" element={<Troubleshooting />} />
          <Route path="developer" element={<DeveloperOverview />} />
          <Route path="architecture" element={<ArchitectureDataFlow />} />
          <Route path="platform-tauri" element={<PlatformTauri />} />
          <Route path="module-system" element={<ModuleSystem />} />
          <Route path="build-release" element={<BuildRelease />} />
          <Route path="security-privacy" element={<SecurityPrivacy />} />
          <Route path="reference" element={<ReferenceIndex />} />
          <Route path="reference/tauri-api" element={<TauriApi />} />
          <Route path="reference/dev-rules" element={<DevRules />} />
          <Route path="reference/nonebot" element={<Nonebot />} />
          <Route path="reference/implementation-notes" element={<Implementation />} />
          <Route path="*" element={<Navigate to="/docs" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
