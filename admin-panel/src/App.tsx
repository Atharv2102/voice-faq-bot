import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Questions from './pages/Questions';
import Suggestions from './pages/Suggestions';
import Import from './pages/Import';
import Audit from './pages/Audit';
import Queries from './pages/Queries';
import Profile from './pages/Profile';
import Users from './pages/Users';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<Dashboard />} />
        <Route path="questions"   element={<Questions />} />
        <Route path="suggestions" element={<Suggestions />} />
        <Route path="import"      element={<Import />} />
        <Route path="audit"       element={<Audit />} />
        <Route path="queries"     element={<Queries />} />
        <Route path="profile"     element={<Profile />} />
        <Route path="users"       element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
