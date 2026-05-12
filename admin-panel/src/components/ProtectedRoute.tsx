import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('jwt') ? <>{children}</> : <Navigate to="/login" replace />;
}
