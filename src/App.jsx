import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Admin from './pages/Admin';
import UserConfig from './pages/UserConfig';
import UserForm from './pages/UserForm';
import './App.css';

function PrivateRoute({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={isAuthenticated ? (isAdmin() ? <Navigate to="/admin" /> : <Navigate to="/config" />) : <Login />} 
      />
      <Route 
        path="/admin" 
        element={
          <PrivateRoute allowedRoles={['admin']}>
            <Admin />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/config" 
        element={
          <PrivateRoute allowedRoles={['user', 'admin']}>
            <UserConfig />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/user-form" 
        element={<UserForm />} 
      />
      <Route 
        path="/" 
        element={
          isAuthenticated 
            ? (isAdmin() ? <Navigate to="/admin" /> : <Navigate to="/config" />)
            : <Navigate to="/login" />
        } 
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
