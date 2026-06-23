import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/Dashboard";
import CharactersPage from "./pages/Characters";
import LootPage from "./pages/Loot";
import InventoryPage from "./pages/Inventory";
import ShoppingPage from "./pages/Shopping";
import RaidsPage from "./pages/Raids";
import RestedXpPage from "./pages/RestedXp";
import SettingsPage from "./pages/Settings";
import AdminPage from "./pages/Admin";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/raids" element={<RaidsPage />} />
        <Route path="/loot" element={<LootPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/rested" element={<RestedXpPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
