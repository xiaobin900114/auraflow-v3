import React, { useState, useEffect } from 'react';
import { supabase } from './api/supabase';
import Auth from './features/auth/Auth';
import Dashboard from './features/dashboard/Dashboard';
import ToastProvider from './components/Toast/ToastProvider';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <ToastProvider>
      <div className="h-screen bg-gray-50 text-[13px] antialiased">
        {!session ? <Auth /> : <Dashboard key={session.user.id} />}
      </div>
    </ToastProvider>
  );
}
export default App;
