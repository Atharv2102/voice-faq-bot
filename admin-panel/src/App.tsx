import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Questions from './pages/Questions';
import Suggestions from './pages/Suggestions';
import Import from './pages/Import';
import Audit from './pages/Audit';
import Queries from './pages/Queries';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<Dashboard />} />
        <Route path="questions"   element={<Questions />} />
        <Route path="suggestions" element={<Suggestions />} />
        <Route path="import"      element={<Import />} />
        <Route path="audit"       element={<Audit />} />
        <Route path="queries"     element={<Queries />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
