import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/Dashboard";
import CharactersPage from "./pages/Characters";
import LootPage from "./pages/Loot";
import RaidsPage from "./pages/Raids";
import SettingsPage from "./pages/Settings";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/raids" element={<RaidsPage />} />
        <Route path="/loot" element={<LootPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
