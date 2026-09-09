import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PlannerPage } from './pages/PlannerPage';
import { SessionPage } from './pages/SessionPage';
import { DoubtChatPage } from './pages/DoubtChatPage';
import { QuizPage } from './pages/QuizPage';
import { ProfilePage } from './pages/ProfilePage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/planner"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <PlannerPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/session"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <SessionPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/doubts"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <DoubtChatPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quiz"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <QuizPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ProfilePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/planner" replace />} />
          <Route path="*" element={<Navigate to="/planner" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
