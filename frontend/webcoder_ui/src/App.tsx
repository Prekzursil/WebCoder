import React from 'react'; // Ensuring React is explicitly imported
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './App.css';
// import { useAuth } from './context/AuthContext'; // No longer needed directly in App for ProtectedRoute logic
import Navbar from './components/layout/Navbar'; 
import HomePage from './pages/HomePage'; 
import LoginPage from './pages/auth/LoginPage'; 
import RegisterPage from './pages/auth/RegisterPage';
import CompleteRegistrationPage from './pages/auth/CompleteRegistrationPage';
import ProblemsListPage from './pages/problems/ProblemsListPage';
import ProblemDetailPage from './pages/problems/ProblemDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import MySubmissionsPage from './pages/submissions/MySubmissionsPage';
import UserProfilePage from './pages/user/UserProfilePage';
import SubmissionDetailPage from './pages/submissions/SubmissionDetailPage';
import ProblemFormPage from './pages/problems/ProblemFormPage';
import ProblemVerificationQueuePage from './pages/admin/ProblemVerificationQueuePage';
import MyCreatedProblemsPage from './pages/problems/MyCreatedProblemsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import ProtectedRoute from './components/common/ProtectedRoute'; // Import the new ProtectedRoute component

function App() {
  return (
    <div className="App">
      <Toaster position="top-center" reverseOrder={false} />
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
          <Route path="/problems" element={<ProblemsListPage />} />
          
          <Route path="/problems/create" element={<ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER']}><ProblemFormPage /></ProtectedRoute>} />
          <Route path="/problems/:problemId/edit" element={<ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER']}><ProblemFormPage /></ProtectedRoute>} />
          <Route path="/problems/:problemId" element={<ProblemDetailPage />} />
          
          <Route path="/my-submissions" element={<ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'BASIC_USER']}><MySubmissionsPage /></ProtectedRoute>} />
          <Route path="/my-created-problems" element={<ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER']}><MyCreatedProblemsPage /></ProtectedRoute>} />
          <Route path="/admin/problem-queue" element={<ProtectedRoute roles={['ADMIN', 'PROBLEM_VERIFIER']}><ProblemVerificationQueuePage /></ProtectedRoute>} />
          <Route path="/admin/dashboard" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/submissions/:submissionId" element={<SubmissionDetailPage />} />
          <Route path="/profile" element={<ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'BASIC_USER']}><UserProfilePage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} /> 
        </Routes>
      </main>
    </div>
  );
}

export default App;
